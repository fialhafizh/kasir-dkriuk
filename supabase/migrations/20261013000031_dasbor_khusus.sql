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

  -- Satu kejadian (mis. barang masuk 1 pack ayam) menulis beberapa baris bahan dengan jam sama: dijumlah per jam dulu.
  with per as (
    select g.waktu, sum(g.qty) as qty,
           sum(g.qty) filter (where g.jenis in ('masuk', 'transfer_masuk') and g.qty > 0) as masuk
    from public.gerakan_stok g
    where g.outlet_id = p_outlet and g.bahan_id = any (v_bahan) and g.waktu >= p_dari and g.waktu < p_sampai
    group by g.waktu
  ),
  awal as (
    select coalesce(sum(qty), 0) / v_pembagi as saldo from public.gerakan_stok
    where outlet_id = p_outlet and bahan_id = any (v_bahan) and waktu < p_dari
  ),
  dalam as (
    select waktu, qty, masuk, (select saldo from awal) + sum(qty) over (order by waktu) / v_pembagi as saldo from per
  ),
  -- Titik grafik: saldo terakhir & terendah per jam/hari.
  titik as (
    select date_trunc(v_ember, waktu at time zone 'Asia/Jakarta') as ember,
           (array_agg(saldo order by waktu desc))[1] as akhir, min(saldo) as terendah
    from dalam group by 1
  ),
  urut as (
    select waktu, saldo, lag(saldo, 1, (select saldo from awal)) over (order by waktu) as sebelum
    from dalam
  ),
  habis as (select waktu from urut where saldo <= 0.001 and sebelum > 0.001),
  pulih as (select waktu from urut where saldo > 0.001 and sebelum <= 0.001),
  masuk as (select waktu, masuk / v_pembagi as qty from dalam where masuk > 0)
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

-- Teks satu kejadian riwayat; dibuat hanya untuk baris yang tampil (tahap kedua riwayat_kejadian).
create function public._riwayat_teks(p_jenis text, p_tahap text, p_ref uuid, out judul text, out rincian text)
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.penjualan;
  r public.rusak;
  b public.barang_masuk;
  t public.transfer;
  s public.shift;
  e public.pengeluaran;
  st public.setoran;
  d public.kejadian_diabaikan;
  v_nama text;
  v_selisih text;
begin
  if p_jenis in ('jual', 'batal') then
    select * into p from public.penjualan where id = p_ref;
    if p_jenis = 'jual' then
      judul := 'Jualan ' || p.nomor;
      rincian := public._tg_rp(p.total) || ' · ' || public._tg_metode(p.metode::text) || ' · '
        || coalesce((select nama_tampilan from public.profiles where id = p.kasir_id), '-');
    else
      judul := 'Batal ' || p.nomor;
      rincian := public._tg_rp(p.total) || ' · ' || coalesce((select nama_tampilan from public.profiles where id = p.void_oleh), '-') || ': ' || p.void_alasan;
    end if;
  elsif p_jenis = 'sisa' then
    select * into r from public.rusak where id = p_ref;
    judul := 'Sisa/rusak' || case when r.batal_at is not null then ' (dibatalkan)' else '' end;
    rincian := coalesce((select string_agg(x.nama || ' ' || trim_scale(ri.qty)::text, ', ')
                         from public.rusak_item ri join public.bahan x on x.id = ri.bahan_id where ri.rusak_id = r.id), '-')
      || ' · ' || public._dasbor_label('terbuang', 'alasan', null, r.alasan::text) || coalesce(' · ' || r.catatan, '');
  elsif p_jenis = 'barang_masuk' then
    select * into b from public.barang_masuk where id = p_ref;
    judul := 'Barang masuk' || case when b.batal_at is not null then ' (dibatalkan)' else '' end;
    rincian := coalesce((select string_agg(bi.nama || ' ' || trim_scale(bi.qty)::text, ', ') from public.barang_masuk_item bi where bi.barang_masuk_id = b.id), '-')
      || ' · ' || public._tg_rp(b.total);
  elsif p_jenis = 'transfer' then
    select * into t from public.transfer where id = p_ref;
    judul := case p_tahap when 'kirim' then 'Kirim barang' when 'terima' then 'Kiriman diterima' else 'Kiriman dibatalkan' end;
    rincian := (select o.nama from public.outlets o where o.id = t.dari_outlet_id) || ' → ' || (select o.nama from public.outlets o where o.id = t.ke_outlet_id)
      || coalesce(' · ' || (select string_agg(x.nama || ' ' || trim_scale(ti.qty)::text, ', ')
                            from public.transfer_item ti join public.bahan x on x.id = ti.bahan_id where ti.transfer_id = t.id), '');
  elsif p_jenis = 'opname' then
    if p_tahap like 'awal%' then
      select coalesce(pr.nama_tampilan, '-'), case when p_tahap = 'awal_aju' then 'Stok awal diajukan' when a.status = 'disetujui' then 'Stok awal disetujui' else 'Stok awal ditolak' end
      into rincian, judul
      from public.stok_awal a left join public.profiles pr on pr.id = a.diajukan_oleh where a.id = p_ref;
    else
      select coalesce(pr.nama_tampilan, '-'), case when p_tahap = 'aju' then 'Opname diajukan' when o.status = 'disetujui' then 'Opname disetujui' else 'Opname ditolak' end
      into rincian, judul
      from public.opname o left join public.profiles pr on pr.id = o.diajukan_oleh where o.id = p_ref;
    end if;
  elsif p_jenis = 'toko' then
    select * into s from public.shift where id = p_ref;
    if p_tahap = 'buka' then
      judul := 'Buka toko';
      rincian := 'Modal ' || public._tg_rp(s.modal) || ' · ' || coalesce((select nama_tampilan from public.profiles where id = s.dibuka_oleh), '-');
    else
      v_selisih := public._ringkasan_shift(s.id) ->> 'selisih';
      judul := 'Tutup toko';
      rincian := 'Selisih ' || case when v_selisih is null then '-' else public._tg_rp(v_selisih::bigint) end || ' · '
        || coalesce((select nama_tampilan from public.profiles where id = coalesce(s.ditutup_oleh, s.dibuka_oleh)), '-');
    end if;
  elsif p_jenis in ('pengeluaran', 'kasbon') then
    select * into e from public.pengeluaran where id = p_ref;
    select nama into v_nama from public.kategori_pengeluaran where id = e.kategori_id;
    judul := v_nama || case when e.batal_at is not null then ' (dibatalkan)' else '' end;
    rincian := public._tg_rp(e.jumlah) || ' · ' || case e.sumber::text when 'laci' then 'dari laci' else 'luar laci' end
      || coalesce(' · ' || (select nama from public.karyawan where id = e.karyawan_id), '') || coalesce(' · ' || e.keterangan, '');
  elsif p_jenis = 'setoran' then
    select * into st from public.setoran where id = p_ref;
    if p_tahap = 'catat' then
      judul := 'Setoran dicatat' || case when st.batal_at is not null then ' (dibatalkan)' else '' end;
      rincian := public._tg_rp(st.jumlah);
    else
      judul := 'Setoran diterima';
      rincian := public._tg_rp(st.jumlah_diterima) || ' dari ' || public._tg_rp(st.jumlah);
    end if;
  elsif p_jenis = 'diabaikan' then
    select * into d from public.kejadian_diabaikan where id = p_ref;
    judul := 'Data diabaikan kasir';
    rincian := public._tg_label_kejadian(d.jenis) || ': ' || d.alasan;
  end if;
end
$$;

-- Riwayat kejadian semua jenis, terbaru dulu. Halaman berikutnya memakai (p_sebelum, p_sebelum_kunci) dari baris terakhir.
-- Tahap 1 hanya memilih (waktu, jenis, id); teks dibuat untuk baris yang tampil saja.
create function public.riwayat_kejadian(p_outlet uuid, p_dari timestamptz, p_sampai timestamptz, p_jenis text[],
                                        p_sebelum timestamptz, p_sebelum_kunci text, p_batas integer)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_batas integer := least(greatest(coalesce(p_batas, 50), 1), 200);
  v_akhir timestamptz := least(p_sampai, coalesce(p_sebelum + interval '1 microsecond', p_sampai));
begin
  perform public._wajib_admin_dasbor();
  if p_dari is null or p_sampai is null or p_dari >= p_sampai or p_sampai - p_dari > interval '400 days' then
    raise exception 'Rentang tanggal tidak sah' using errcode = '22023';
  end if;
  return coalesce((
    with ev (waktu, jenis, tahap, ref, outlet_id) as (
      select p.waktu, 'jual', 'a', p.id, p.outlet_id from public.penjualan p
      where (p_jenis is null or 'jual' = any (p_jenis)) and p.waktu >= p_dari and p.waktu < v_akhir and (p_outlet is null or p.outlet_id = p_outlet)
      union all
      select p.void_at, 'batal', 'a', p.id, p.outlet_id from public.penjualan p
      where (p_jenis is null or 'batal' = any (p_jenis)) and p.void_at >= p_dari and p.void_at < v_akhir and (p_outlet is null or p.outlet_id = p_outlet)
      union all
      select r.waktu, 'sisa', 'a', r.id, r.outlet_id from public.rusak r
      where (p_jenis is null or 'sisa' = any (p_jenis)) and r.waktu >= p_dari and r.waktu < v_akhir and (p_outlet is null or r.outlet_id = p_outlet)
      union all
      select b.waktu, 'barang_masuk', 'a', b.id, b.outlet_id from public.barang_masuk b
      where (p_jenis is null or 'barang_masuk' = any (p_jenis)) and b.waktu >= p_dari and b.waktu < v_akhir and (p_outlet is null or b.outlet_id = p_outlet)
      union all
      select e.w, 'transfer', e.tahap, t.id, e.o from public.transfer t
      cross join lateral (values (t.dikirim_at, 'kirim', t.dari_outlet_id), (t.diterima_at, 'terima', t.ke_outlet_id),
                                 (t.batal_at, 'batal', t.dari_outlet_id)) as e (w, tahap, o)
      where (p_jenis is null or 'transfer' = any (p_jenis)) and e.w is not null and e.w >= p_dari and e.w < v_akhir
        and (p_outlet is null or p_outlet in (t.dari_outlet_id, t.ke_outlet_id))
      union all
      select e.w, 'opname', e.tahap, o.id, o.outlet_id from public.opname o
      cross join lateral (values (o.dihitung_at, 'aju'), (o.diputus_at, 'putus')) as e (w, tahap)
      where (p_jenis is null or 'opname' = any (p_jenis)) and e.w is not null and e.w >= p_dari and e.w < v_akhir and (p_outlet is null or o.outlet_id = p_outlet)
      union all
      select e.w, 'opname', e.tahap, a.id, a.outlet_id from public.stok_awal a
      cross join lateral (values (a.dihitung_at, 'awal_aju'), (a.diputus_at, 'awal_putus')) as e (w, tahap)
      where (p_jenis is null or 'opname' = any (p_jenis)) and e.w is not null and e.w >= p_dari and e.w < v_akhir and (p_outlet is null or a.outlet_id = p_outlet)
      union all
      select e.w, 'toko', e.tahap, s.id, s.outlet_id from public.shift s
      cross join lateral (values (s.dibuka_at, 'buka'), (case when not s.tutup_tertunda then s.ditutup_at end, 'tutup')) as e (w, tahap)
      where (p_jenis is null or 'toko' = any (p_jenis)) and e.w is not null and e.w >= p_dari and e.w < v_akhir and (p_outlet is null or s.outlet_id = p_outlet)
      union all
      select x.waktu, x.jenis, 'a', x.id, x.outlet_id from (
        select e.waktu, case when k.kode = 'kasbon' then 'kasbon' else 'pengeluaran' end as jenis, e.id, e.outlet_id
        from public.pengeluaran e join public.kategori_pengeluaran k on k.id = e.kategori_id
        where e.waktu >= p_dari and e.waktu < v_akhir and (p_outlet is null or e.outlet_id = p_outlet)
      ) x where p_jenis is null or x.jenis = any (p_jenis)
      union all
      select e.w, 'setoran', e.tahap, s.id, s.outlet_id from public.setoran s
      cross join lateral (values (s.waktu, 'catat'), (s.diterima_at, 'terima')) as e (w, tahap)
      where (p_jenis is null or 'setoran' = any (p_jenis)) and e.w is not null and e.w >= p_dari and e.w < v_akhir and (p_outlet is null or s.outlet_id = p_outlet)
      union all
      select d.dibuat_at, 'diabaikan', 'a', d.id, d.outlet_id from public.kejadian_diabaikan d
      where (p_jenis is null or 'diabaikan' = any (p_jenis)) and d.dibuat_at >= p_dari and d.dibuat_at < v_akhir and (p_outlet is null or d.outlet_id = p_outlet)
    ),
    pilih as (
      select ev.*, ev.jenis || ':' || ev.tahap || ':' || ev.ref as kunci from ev
      where p_sebelum is null or (ev.waktu, ev.jenis || ':' || ev.tahap || ':' || ev.ref) < (p_sebelum, coalesce(p_sebelum_kunci, ''))
      order by ev.waktu desc, kunci desc
      limit v_batas
    )
    select jsonb_agg(jsonb_build_object('waktu', pilih.waktu, 'jenis', pilih.jenis, 'kunci', pilih.kunci, 'outlet_id', pilih.outlet_id,
                                        'judul', tx.judul, 'rincian', tx.rincian) order by pilih.waktu desc, pilih.kunci desc)
    from pilih cross join lateral public._riwayat_teks(pilih.jenis, pilih.tahap, pilih.ref) tx
  ), '[]'::jsonb);
end
$$;

revoke execute on function public._riwayat_teks(text, text, uuid) from public, anon, authenticated;

revoke execute on function public.siklus_stok(uuid, text, timestamptz, timestamptz),
  public.riwayat_kejadian(uuid, timestamptz, timestamptz, text[], timestamptz, text, integer) from public, anon;
grant execute on function public.siklus_stok(uuid, text, timestamptz, timestamptz),
  public.riwayat_kejadian(uuid, timestamptz, timestamptz, text[], timestamptz, text, integer) to authenticated;
