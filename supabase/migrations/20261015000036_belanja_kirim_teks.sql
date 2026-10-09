-- Tahap 7c: rencana belanja ke stokis & kirim teks manual (belanja/gaji/ojol) ke Telegram.

-- Rencana belanja: saran beli per outlet = pemakaian/hari × N hari − stok sekarang (dibulatkan ke atas per satuan beli).
-- Bahan yang tidak dipotong otomatis (tepung, minyak, plastik merah, …): pemakaian dari rata-rata pembelian 28 hari, stok tidak dipakai.
create function public.rencana_belanja(p_hari integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._wajib_admin_dasbor();
  if p_hari is null or p_hari < 1 or p_hari > 60 then
    raise exception 'Jumlah hari 1–60' using errcode = '22023';
  end if;
  return (
    with satuan as (
      select s.id, s.nama, s.urutan, count(*) as anggota
      from public.satuan_beli s join public.satuan_beli_isi i on i.satuan_beli_id = s.id
      join public.bahan b on b.id = i.bahan_id and b.aktif
      where s.aktif group by s.id
    ),
    isi as (
      select i.satuan_beli_id as sid, i.bahan_id, i.qty from public.satuan_beli_isi i
      join satuan s on s.id = i.satuan_beli_id join public.bahan b on b.id = i.bahan_id and b.aktif
    ),
    outlet as (select id, nama, kode from public.outlets where aktif),
    dalam_pack as (select i.bahan_id from isi i join satuan s on s.id = i.sid and s.anggota > 1),
    -- bahan tunggal: satuan beli yang punya harga acuan di outlet itu dulu, lalu isi terkecil
    pilih as (
      select distinct on (o.id, i.bahan_id) o.id as outlet_id, i.sid, i.bahan_id, i.qty as isi
      from outlet o cross join isi i
      join satuan s on s.id = i.sid and s.anggota = 1
      left join public.harga_beli hb on hb.outlet_id = o.id and hb.satuan_beli_id = i.sid
      where i.bahan_id not in (select bahan_id from dalam_pack)
      order by o.id, i.bahan_id, (hb.harga is null), i.qty, i.sid
    ),
    barang as (
      select o.id as outlet_id, i.sid, i.bahan_id, i.qty as isi
      from outlet o cross join isi i join satuan s on s.id = i.sid and s.anggota > 1
      union all
      select outlet_id, sid, bahan_id, isi from pilih
    ),
    saldo as (select outlet_id, bahan_id, sum(qty) as n from public.gerakan_stok group by 1, 2),
    pakai as (
      select outlet_id, bahan_id, -sum(qty) as n from public.gerakan_stok
      where jenis in ('jual', 'jual_batal', 'rusak', 'rusak_batal') and waktu >= now() - interval '7 days' group by 1, 2
    ),
    beli28 as (
      select b.outlet_id, i.bahan_id, sum(bi.qty * i.qty) as n
      from public.barang_masuk b join public.barang_masuk_item bi on bi.barang_masuk_id = b.id
      join public.satuan_beli_isi i on i.satuan_beli_id = bi.satuan_beli_id
      where b.batal_at is null and b.waktu >= now() - interval '28 days' group by 1, 2
    ),
    hitung as (
      select br.outlet_id, br.sid, sum(br.isi) as isi, bool_or(bh.mode <> 'otomatis') as dari_beli,
             sum(coalesce(sl.n, 0)) as saldo, sum(coalesce(pk.n, 0)) as pakai7, sum(coalesce(b28.n, 0)) as beli28
      from barang br join public.bahan bh on bh.id = br.bahan_id
      left join saldo sl on sl.outlet_id = br.outlet_id and sl.bahan_id = br.bahan_id
      left join pakai pk on pk.outlet_id = br.outlet_id and pk.bahan_id = br.bahan_id
      left join beli28 b28 on b28.outlet_id = br.outlet_id and b28.bahan_id = br.bahan_id
      group by br.outlet_id, br.sid
    ),
    nilai as (
      select h.*,
             case when h.dari_beli then null else round(h.saldo / h.isi, 3) end as stok,
             round(case when h.dari_beli then h.beli28 / 28 else h.pakai7 / 7 end / h.isi, 4) as pakai_hari,
             coalesce(hb.harga::numeric, (
               select bi.harga from public.barang_masuk b join public.barang_masuk_item bi on bi.barang_masuk_id = b.id
               where b.outlet_id = h.outlet_id and bi.satuan_beli_id = h.sid and b.batal_at is null order by b.waktu desc limit 1)) as harga
      from hitung h left join public.harga_beli hb on hb.outlet_id = h.outlet_id and hb.satuan_beli_id = h.sid
    )
    select jsonb_build_object(
      'hari', p_hari,
      'outlet', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nama', nama, 'kode', kode) order by kode) from outlet), '[]'::jsonb),
      'barang', coalesce((
        select jsonb_agg(jsonb_build_object('satuan_beli_id', s.id, 'nama', s.nama, 'per_outlet', x.per) order by s.urutan, s.nama)
        from satuan s
        join (
          select n.sid, jsonb_object_agg(n.outlet_id, jsonb_build_object(
            'stok', n.stok, 'pakai_hari', n.pakai_hari, 'dari_beli', n.dari_beli, 'harga', n.harga,
            'saran', greatest(0, ceil(round(n.pakai_hari * p_hari - greatest(coalesce(n.stok, 0), 0), 3)))::integer)) as per
          from nilai n group by n.sid
        ) x on x.sid = s.id
      ), '[]'::jsonb)
    )
  );
end
$$;

-- Topik untuk pesan manual dari admin (belanja, gaji, ojol) → 💰 Kas.
create or replace function public._tg_topik(p_jenis text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_jenis = 'struk' then 'struk'
    when p_jenis in ('tutup', 'harian') then 'harian'
    when p_jenis in ('setoran', 'kasbon', 'pengeluaran', 'belanja', 'gaji', 'ojol') then 'kas'
    else 'peringatan' end
$$;

-- Teks dari admin (mis. daftar belanja) dikirim bot ke grup agar mudah disalin ke WA dari HP.
create function public.kirim_teks_telegram(p_jenis text, p_teks text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._wajib_admin_dasbor();
  if p_jenis is null or p_jenis not in ('belanja', 'gaji', 'ojol') then
    raise exception 'Jenis pesan tidak dikenal' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_teks, ''))) = 0 or length(p_teks) > 20000 then
    raise exception 'Teks pesan kosong atau terlalu panjang' using errcode = '22023';
  end if;
  if (select chat_id from public.telegram_pengaturan where id) is null then
    raise exception 'Grup Telegram belum dihubungkan' using errcode = '22023';
  end if;
  insert into public.telegram_antrean (kunci, jenis, topik, teks)
  values ('manual:' || gen_random_uuid(), p_jenis, public._tg_topik(p_jenis), public._tg_potong(public._tg_esc(p_teks)));
end
$$;

revoke execute on function public.rencana_belanja(integer), public.kirim_teks_telegram(text, text) from public, anon;
grant execute on function public.rencana_belanja(integer), public.kirim_teks_telegram(text, text) to authenticated;
