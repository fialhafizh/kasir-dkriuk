-- Tahap 7a: panel khusus dasbor — siklus stok & riwayat kejadian.

-- Siklus stok satu baris stok (kelompok pack = id satuan beli berisi >1 bahan, atau id bahan) di satu outlet.
-- Saldo kelompok dalam pack-setara (Σ jumlah ÷ Σ isi pack), sama dengan halaman Stok.
create function public.siklus_stok(p_outlet uuid, p_kunci text, p_dari timestamptz, p_sampai timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_bahan uuid[];
  v_pembagi numeric := 1;
  v_label text;
  v_satuan text;
  v_ember text;
  v_hasil jsonb;
  v_sekarang numeric;
  v_pakai numeric;
begin
  perform public._wajib_admin_dasbor();
  if p_outlet is null or p_dari is null or p_sampai is null or p_dari >= p_sampai or p_sampai - p_dari > interval '400 days' then
    raise exception 'Rentang tanggal tidak sah' using errcode = '22023';
  end if;
  select array_agg(i.bahan_id), sum(i.qty), min(trim(regexp_replace(regexp_replace(s.nama, '^(pack|karung)\s+', '', 'i'), '\s*\(.*\)\s*$', '')))
  into v_bahan, v_pembagi, v_label
  from public.satuan_beli s join public.satuan_beli_isi i on i.satuan_beli_id = s.id
  where s.id::text = p_kunci
  having count(*) > 1;
  if v_bahan is null then
    select array[b.id], 1, b.nama, b.satuan into v_bahan, v_pembagi, v_label, v_satuan from public.bahan b where b.id::text = p_kunci;
    if v_bahan is null then
      raise exception 'Bahan tidak ditemukan' using errcode = '22023';
    end if;
  else
    v_satuan := 'pack';
  end if;
  v_ember := case when p_sampai - p_dari <= interval '3 days' then 'hour' else 'day' end;

  with g as (
    select g.waktu, g.jenis::text as jenis, g.qty,
           sum(g.qty) over (order by g.waktu, g.id) / v_pembagi as saldo
    from public.gerakan_stok g
    where g.outlet_id = p_outlet and g.bahan_id = any (v_bahan) and g.waktu < p_sampai
  ),
  dalam as (select * from g where waktu >= p_dari),
  awal as (select coalesce((select saldo from g where waktu < p_dari order by waktu desc limit 1), 0) as saldo),
  -- Titik grafik: saldo terakhir & terendah per jam/hari.
  titik as (
    select date_trunc(v_ember, waktu at time zone 'Asia/Jakarta') as ember,
           (array_agg(saldo order by waktu desc))[1] as akhir, min(saldo) as terendah
    from dalam group by 1
  ),
  urut as (
    select waktu, jenis, qty, saldo,
           lag(saldo, 1, (select saldo from awal)) over (order by waktu) as sebelum
    from dalam
  ),
  habis as (select waktu from urut where saldo <= 0.001 and sebelum > 0.001),
  pulih as (select waktu from urut where saldo > 0.001 and sebelum <= 0.001),
  masuk as (select waktu, qty / v_pembagi as qty from dalam where jenis in ('masuk', 'transfer_masuk', 'awal') and qty > 0)
  select jsonb_build_object(
    'label', v_label, 'satuan', v_satuan, 'ember', case v_ember when 'hour' then 'jam' else 'hari' end,
    'saldo_awal', round((select saldo from awal), 3),
    'titik', coalesce((select jsonb_agg(jsonb_build_object('t', to_char(ember, 'YYYY-MM-DD HH24:MI'), 'akhir', round(akhir, 3), 'terendah', round(terendah, 3)) order by ember) from titik), '[]'::jsonb),
    'masuk', coalesce((select jsonb_agg(jsonb_build_object('waktu', waktu, 'jumlah', round(qty, 3)) order by waktu) from masuk), '[]'::jsonb),
    'episode_habis', coalesce((
      select jsonb_agg(jsonb_build_object('habis', h.waktu, 'pulih', (select min(p.waktu) from pulih p where p.waktu > h.waktu)) order by h.waktu)
      from habis h), '[]'::jsonb),
    -- Lama bertahan: dari tiap barang masuk sampai habis berikutnya (jam).
    'bertahan_jam', coalesce((
      select jsonb_agg(round(extract(epoch from (select min(h.waktu) from habis h where h.waktu > m.waktu) - m.waktu) / 3600, 1) order by m.waktu)
      from masuk m where exists (select 1 from habis h where h.waktu > m.waktu)), '[]'::jsonb),
    'jarak_masuk_jam', (
      select round(extract(epoch from (max(waktu) - min(waktu))) / 3600 / nullif(count(*) - 1, 0), 1) from masuk)
  ) into v_hasil;

  -- Pemakaian rata-rata per hari (jual + sisa/rusak) 7 hari terakhir & perkiraan habis.
  select coalesce(sum(qty), 0) / v_pembagi into v_sekarang
  from public.gerakan_stok where outlet_id = p_outlet and bahan_id = any (v_bahan);
  select -coalesce(sum(qty), 0) / v_pembagi / 7 into v_pakai
  from public.gerakan_stok
  where outlet_id = p_outlet and bahan_id = any (v_bahan) and jenis in ('jual', 'jual_batal', 'rusak', 'rusak_batal')
    and waktu >= now() - interval '7 days';
  return v_hasil || jsonb_build_object(
    'saldo_sekarang', round(v_sekarang, 3),
    'pakai_per_hari', round(v_pakai, 3),
    'perkiraan_habis_hari', case when v_pakai > 0 and v_sekarang > 0 then round(v_sekarang / v_pakai, 1) end);
end
$$;

-- Riwayat kejadian semua jenis, terbaru dulu. p_sebelum untuk "muat lebih".
create function public.riwayat_kejadian(p_outlet uuid, p_dari timestamptz, p_sampai timestamptz, p_jenis text[], p_sebelum timestamptz, p_batas integer)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_batas integer := least(greatest(coalesce(p_batas, 50), 1), 200);
  v_akhir timestamptz := least(p_sampai, coalesce(p_sebelum, p_sampai));
begin
  perform public._wajib_admin_dasbor();
  if p_dari is null or p_sampai is null or p_dari >= p_sampai or p_sampai - p_dari > interval '400 days' then
    raise exception 'Rentang tanggal tidak sah' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.waktu desc) from (
      select * from (
        select p.waktu, 'jual' as jenis, p.outlet_id,
               'Jualan ' || p.nomor as judul,
               public._tg_rp(p.total) || ' · ' || public._tg_metode(p.metode::text) || ' · ' || coalesce(pr.nama_tampilan, '-') as rincian
        from public.penjualan p left join public.profiles pr on pr.id = p.kasir_id
        where (p_jenis is null or 'jual' = any (p_jenis)) and p.waktu >= p_dari and p.waktu < v_akhir and (p_outlet is null or p.outlet_id = p_outlet)
        union all
        select p.void_at, 'batal', p.outlet_id, 'Batal ' || p.nomor,
               public._tg_rp(p.total) || ' · ' || coalesce(pr.nama_tampilan, '-') || ': ' || p.void_alasan
        from public.penjualan p left join public.profiles pr on pr.id = p.void_oleh
        where (p_jenis is null or 'batal' = any (p_jenis)) and p.void_at >= p_dari and p.void_at < v_akhir and (p_outlet is null or p.outlet_id = p_outlet)
        union all
        select r.waktu, 'sisa', r.outlet_id, 'Sisa/rusak' || case when r.batal_at is not null then ' (dibatalkan)' else '' end,
               (select string_agg(b.nama || ' ' || trim_scale(ri.qty)::text, ', ') from public.rusak_item ri join public.bahan b on b.id = ri.bahan_id where ri.rusak_id = r.id)
               || ' · ' || public._dasbor_label('terbuang', 'alasan', null, r.alasan::text)
        from public.rusak r
        where (p_jenis is null or 'sisa' = any (p_jenis)) and r.waktu >= p_dari and r.waktu < v_akhir and (p_outlet is null or r.outlet_id = p_outlet)
        union all
        select b.waktu, 'barang_masuk', b.outlet_id, 'Barang masuk' || case when b.batal_at is not null then ' (dibatalkan)' else '' end,
               (select string_agg(bi.nama || ' ' || trim_scale(bi.qty)::text, ', ') from public.barang_masuk_item bi where bi.barang_masuk_id = b.id)
               || ' · ' || public._tg_rp(b.total)
        from public.barang_masuk b
        where (p_jenis is null or 'barang_masuk' = any (p_jenis)) and b.waktu >= p_dari and b.waktu < v_akhir and (p_outlet is null or b.outlet_id = p_outlet)
        union all
        select e.w, 'transfer', t.dari_outlet_id, e.judul,
               (select o.nama from public.outlets o where o.id = t.dari_outlet_id) || ' → ' || (select o.nama from public.outlets o where o.id = t.ke_outlet_id)
               || ' · ' || (select string_agg(b.nama || ' ' || trim_scale(ti.qty)::text, ', ') from public.transfer_item ti join public.bahan b on b.id = ti.bahan_id where ti.transfer_id = t.id)
        from public.transfer t
        cross join lateral (values (t.dikirim_at, 'Kirim barang'), (t.diterima_at, 'Kiriman diterima'), (t.batal_at, 'Kiriman dibatalkan')) as e (w, judul)
        where (p_jenis is null or 'transfer' = any (p_jenis)) and e.w is not null and e.w >= p_dari and e.w < v_akhir
          and (p_outlet is null or p_outlet in (t.dari_outlet_id, t.ke_outlet_id))
        union all
        select e.w, 'opname', o.outlet_id, e.judul, coalesce((select nama_tampilan from public.profiles where id = o.diajukan_oleh), '-')
        from public.opname o
        cross join lateral (values (o.dihitung_at, 'Opname diajukan'),
                                   (o.diputus_at, case o.status when 'disetujui' then 'Opname disetujui' else 'Opname ditolak' end)) as e (w, judul)
        where (p_jenis is null or 'opname' = any (p_jenis)) and e.w is not null and e.w >= p_dari and e.w < v_akhir and (p_outlet is null or o.outlet_id = p_outlet)
        union all
        select e.w, 'opname', o.outlet_id, e.judul, coalesce((select nama_tampilan from public.profiles where id = o.diajukan_oleh), '-')
        from public.stok_awal o
        cross join lateral (values (o.dihitung_at, 'Stok awal diajukan'),
                                   (o.diputus_at, case o.status when 'disetujui' then 'Stok awal disetujui' else 'Stok awal ditolak' end)) as e (w, judul)
        where (p_jenis is null or 'opname' = any (p_jenis)) and e.w is not null and e.w >= p_dari and e.w < v_akhir and (p_outlet is null or o.outlet_id = p_outlet)
        union all
        select s.dibuka_at, 'toko', s.outlet_id, 'Buka toko', 'Modal ' || public._tg_rp(s.modal) || ' · ' || coalesce((select nama_tampilan from public.profiles where id = s.dibuka_oleh), '-')
        from public.shift s
        where (p_jenis is null or 'toko' = any (p_jenis)) and s.dibuka_at >= p_dari and s.dibuka_at < v_akhir and (p_outlet is null or s.outlet_id = p_outlet)
        union all
        select s.ditutup_at, 'toko', s.outlet_id, 'Tutup toko',
               'Selisih ' || coalesce((select public._tg_rp(x::bigint) from nullif(public._ringkasan_shift(s.id) ->> 'selisih', '') x where x is not null), '-')
               || ' · ' || coalesce((select nama_tampilan from public.profiles where id = coalesce(s.ditutup_oleh, s.dibuka_oleh)), '-')
        from public.shift s
        where (p_jenis is null or 'toko' = any (p_jenis)) and s.ditutup_at >= p_dari and s.ditutup_at < v_akhir and not s.tutup_tertunda
          and (p_outlet is null or s.outlet_id = p_outlet)
        union all
        select e.waktu, case when k.kode = 'kasbon' then 'kasbon' else 'pengeluaran' end, e.outlet_id,
               k.nama || case when e.batal_at is not null then ' (dibatalkan)' else '' end,
               public._tg_rp(e.jumlah) || ' · ' || case e.sumber::text when 'laci' then 'dari laci' else 'luar laci' end
               || coalesce(' · ' || (select nama from public.karyawan where id = e.karyawan_id), '') || coalesce(' · ' || e.keterangan, '')
        from public.pengeluaran e join public.kategori_pengeluaran k on k.id = e.kategori_id
        where (p_jenis is null or (case when k.kode = 'kasbon' then 'kasbon' else 'pengeluaran' end) = any (p_jenis))
          and e.waktu >= p_dari and e.waktu < v_akhir and (p_outlet is null or e.outlet_id = p_outlet)
        union all
        select e.w, 'setoran', s.outlet_id, e.judul, e.rincian
        from public.setoran s
        cross join lateral (values
          (s.waktu, 'Setoran dicatat' || case when s.batal_at is not null then ' (dibatalkan)' else '' end, public._tg_rp(s.jumlah)),
          (s.diterima_at, 'Setoran diterima', public._tg_rp(s.jumlah_diterima) || ' dari ' || public._tg_rp(s.jumlah))) as e (w, judul, rincian)
        where (p_jenis is null or 'setoran' = any (p_jenis)) and e.w is not null and e.w >= p_dari and e.w < v_akhir
          and (p_outlet is null or s.outlet_id = p_outlet)
        union all
        select d.dibuat_at, 'diabaikan', d.outlet_id, 'Data diabaikan kasir', public._tg_label_kejadian(d.jenis) || ': ' || d.alasan
        from public.kejadian_diabaikan d
        where (p_jenis is null or 'diabaikan' = any (p_jenis)) and d.dibuat_at >= p_dari and d.dibuat_at < v_akhir
          and (p_outlet is null or d.outlet_id = p_outlet)
      ) semua
      order by waktu desc
      limit v_batas
    ) x
  ), '[]'::jsonb);
end
$$;

revoke execute on function public.siklus_stok(uuid, text, timestamptz, timestamptz),
  public.riwayat_kejadian(uuid, timestamptz, timestamptz, text[], timestamptz, integer) from public, anon;
grant execute on function public.siklus_stok(uuid, text, timestamptz, timestamptz),
  public.riwayat_kejadian(uuid, timestamptz, timestamptz, text[], timestamptz, integer) to authenticated;
