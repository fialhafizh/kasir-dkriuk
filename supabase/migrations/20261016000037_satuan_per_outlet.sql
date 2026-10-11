-- Satuan beli per outlet: Kertapati (D'Krizzpy) memakai pack berbeda (kemasan besar & plastik kecil isi 50,
-- saus sambal & tomat isi 25) dan tidak menjual ayam Hot & kulit. Satuan beli tanpa baris di tabel ini dipakai semua outlet.

create table public.satuan_beli_outlet (
  satuan_beli_id uuid not null references public.satuan_beli (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  primary key (satuan_beli_id, outlet_id)
);
alter table public.satuan_beli_outlet enable row level security;
revoke all on public.satuan_beli_outlet from anon, authenticated;
grant select on public.satuan_beli_outlet to authenticated;
grant all on public.satuan_beli_outlet to service_role;
create policy satuan_beli_outlet_baca on public.satuan_beli_outlet for select to authenticated using (true);

create function public._satuan_di_outlet(p_satuan uuid, p_outlet uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.satuan_beli_outlet where satuan_beli_id = p_satuan)
      or exists (select 1 from public.satuan_beli_outlet where satuan_beli_id = p_satuan and outlet_id = p_outlet)
$$;

-- Bahan dipakai outlet bila ada satuan beli aktif berisi bahan itu yang dipakai outlet (atau bahan tanpa satuan beli).
create function public._bahan_di_outlet(p_bahan uuid, p_outlet uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.satuan_beli_isi i join public.satuan_beli s on s.id = i.satuan_beli_id and s.aktif where i.bahan_id = p_bahan)
      or exists (select 1 from public.satuan_beli_isi i join public.satuan_beli s on s.id = i.satuan_beli_id and s.aktif
                 where i.bahan_id = p_bahan and public._satuan_di_outlet(s.id, p_outlet))
$$;

-- Admin: atur outlet pemakai satuan beli (daftar kosong = semua outlet).
create function public.simpan_outlet_satuan(p_satuan uuid, p_outlet uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh mengubah satuan beli' using errcode = '42501';
  end if;
  if not exists (select 1 from public.satuan_beli where id = p_satuan) then
    raise exception 'Satuan beli tidak ditemukan' using errcode = '22023';
  end if;
  delete from public.satuan_beli_outlet where satuan_beli_id = p_satuan;
  insert into public.satuan_beli_outlet (satuan_beli_id, outlet_id)
  select p_satuan, o.id from public.outlets o where o.id = any (coalesce(p_outlet, '{}'));
end
$$;

-- ---------- Data (keputusan owner 11 Okt 2026) ----------
insert into public.satuan_beli (kode, nama, ambang, harga_tetap, urutan) values
  ('pack_kemasan_besar_50', 'Pack Kemasan Besar (isi 50)', 2, true, 40),
  ('pack_plastik_kecil_50', 'Pack Plastik Kecil (isi 50)', null, true, 43),
  ('pack_saus_sambal_25', 'Pack Saus Sambal (isi 25)', null, true, 50),
  ('pack_saus_tomat_25', 'Pack Saus Tomat (isi 25)', null, true, 51);
insert into public.satuan_beli_isi (satuan_beli_id, bahan_id, qty)
select s.id, b.id, v.qty
from (values ('pack_kemasan_besar_50', 'kemasan_besar', 50), ('pack_plastik_kecil_50', 'plastik_kecil', 50),
             ('pack_saus_sambal_25', 'saus_sambal', 25), ('pack_saus_tomat_25', 'saus_tomat', 25)) v (satuan, bahan, qty)
join public.satuan_beli s on s.kode = v.satuan join public.bahan b on b.kode = v.bahan;
-- saus sambal & tomat D'Kriuk isi 150 sachet per pack (bukan 100)
update public.satuan_beli_isi i set qty = 150 from public.satuan_beli s
where s.id = i.satuan_beli_id and s.kode in ('pack_saus_sambal', 'pack_saus_tomat');
-- pack D'Kriuk hanya Bukit Lama & Talang Kerangga; pack isi 50/25 hanya Kertapati
insert into public.satuan_beli_outlet (satuan_beli_id, outlet_id)
select s.id, o.id from public.satuan_beli s cross join public.outlets o
where (s.kode in ('pack_ayam_hot', 'pack_kulit', 'pack_cup_kulit', 'pack_kemasan_besar', 'pack_plastik_kecil', 'pack_saus_sambal', 'pack_saus_tomat') and o.kode in ('BL', 'TK'))
   or (s.kode in ('pack_kemasan_besar_50', 'pack_plastik_kecil_50', 'pack_saus_sambal_25', 'pack_saus_tomat_25') and o.kode = 'KP');
-- Kertapati tidak menjual ayam Hot & kulit (menu tanpa harga jual tidak tampil di kasir)
delete from public.harga_jual h using public.menu m, public.outlets o
where h.menu_id = m.id and h.outlet_id = o.id and o.kode = 'KP'
  and m.kode in ('hot_dada', 'hot_paha_atas', 'hot_paha_bawah', 'hot_sayap', 'kulit');

-- ---------- Fungsi yang memakai satuan beli: hanya satuan outlet itu ----------
create or replace function public._tg_status_stok(p_outlet uuid, p_bahan uuid[] default null)
returns table (kunci text, label text, status text, teks text)
language sql stable security definer set search_path = '' as $$
  with recursive relevan (id) as (
    select unnest(p_bahan)
    union
    select i2.bahan_id from relevan r
    join public.satuan_beli_isi i1 on i1.bahan_id = r.id
    join public.satuan_beli_isi i2 on i2.satuan_beli_id = i1.satuan_beli_id
  ),
  isi as (
    select i.satuan_beli_id as sid, i.bahan_id, i.qty
    from public.satuan_beli_isi i
    join public.satuan_beli s on s.id = i.satuan_beli_id and s.aktif
    join public.bahan b on b.id = i.bahan_id and b.aktif
    where public._satuan_di_outlet(s.id, p_outlet)
  ),
  q as (
    select b.id, b.nama, b.satuan, b.urutan, coalesce(sum(g.qty), 0)::numeric as n
    from public.bahan b
    left join public.gerakan_stok g on g.bahan_id = b.id and g.outlet_id = p_outlet
    where b.aktif and (p_bahan is null or b.id in (select id from relevan))
      and public._bahan_di_outlet(b.id, p_outlet)
    group by b.id
  ),
  grup as (select sid from isi group by sid having count(*) > 1),
  anggota as (
    select distinct on (i.bahan_id) i.bahan_id, i.sid from isi i join grup g using (sid) order by i.bahan_id, i.sid
  ),
  baris_grup as (
    select s.id::text as kunci,
           trim(regexp_replace(regexp_replace(s.nama, '^(pack|karung)\s+', '', 'i'), '\s*\(.*\)\s*$', '')) as label,
           case when bool_or(q.n < -0.001) then 'minus'
                when s.ambang is not null and sum(q.n) / sum(i.qty) <= s.ambang + 1e-9 then 'menipis'
                else 'aman' end as status,
           '≈ ' || replace(trim_scale(round(sum(q.n) / sum(i.qty), 1))::text, '.', ',') || ' pack' as teks,
           min(q.urutan) as urutan
    from public.satuan_beli s
    join isi i on i.sid = s.id
    join q on q.id = i.bahan_id
    where s.id in (select sid from anggota)
    group by s.id
  ),
  acuan as (
    select distinct on (i.bahan_id) i.bahan_id, i.qty as isi, s.ambang
    from isi i join public.satuan_beli s on s.id = i.sid
    where i.sid not in (select sid from grup)
    order by i.bahan_id, i.qty
  ),
  baris_tunggal as (
    select q.id::text, q.nama,
           case when q.n < -0.001 then 'minus'
                when a.ambang is not null and q.n / a.isi <= a.ambang + 1e-9 then 'menipis'
                else 'aman' end,
           replace(trim_scale(round(q.n, 2))::text, '.', ',') || ' ' || q.satuan,
           q.urutan
    from q left join acuan a on a.bahan_id = q.id
    where q.id not in (select bahan_id from anggota)
  )
  select kunci, label, status, teks from (
    select * from baris_grup union all select * from baris_tunggal
  ) x order by urutan, label
$$;

create or replace function public._modal_bahan_semua(p_dari timestamptz, p_sampai timestamptz)
returns table (outlet_id uuid, bahan_id uuid, modal numeric, sumber text)
language sql stable security definer set search_path = '' as $$
  with satuan as (
    select s.id, count(*) as anggota from public.satuan_beli s join public.satuan_beli_isi i on i.satuan_beli_id = s.id group by s.id
  ),
  beli as (
    -- harga rata-rata tiap satuan beli per outlet di periode
    select b.outlet_id, bi.satuan_beli_id, sum(bi.subtotal)::numeric / nullif(sum(bi.qty), 0) as harga, sum(bi.subtotal)::numeric as rupiah, sum(bi.qty) as qty
    from public.barang_masuk b join public.barang_masuk_item bi on bi.barang_masuk_id = b.id
    where b.batal_at is null and b.waktu >= p_dari and b.waktu < p_sampai
    group by b.outlet_id, bi.satuan_beli_id
  ),
  harga_satuan as (
    select o.id as outlet_id, s.id as satuan_beli_id,
           coalesce(bl.harga, hb.harga::numeric) as harga,
           case when bl.harga is not null then 'beli' when hb.harga is not null then 'acuan' end as sumber
    from public.outlets o cross join satuan s
    left join beli bl on bl.outlet_id = o.id and bl.satuan_beli_id = s.id
    left join public.harga_beli hb on hb.outlet_id = o.id and hb.satuan_beli_id = s.id
    where public._satuan_di_outlet(s.id, o.id)
  ),
  -- bahan satu-satuan (bukan pack campuran)
  tunggal_beli as (
    select bl.outlet_id, i.bahan_id, sum(bl.rupiah) / nullif(sum(bl.qty * i.qty), 0) as modal
    from beli bl join satuan s on s.id = bl.satuan_beli_id and s.anggota = 1
    join public.satuan_beli_isi i on i.satuan_beli_id = bl.satuan_beli_id
    group by bl.outlet_id, i.bahan_id
  ),
  tunggal_acuan as (
    select distinct on (hs.outlet_id, i.bahan_id) hs.outlet_id, i.bahan_id, hs.harga / i.qty as modal
    from harga_satuan hs join satuan s on s.id = hs.satuan_beli_id and s.anggota = 1
    join public.satuan_beli_isi i on i.satuan_beli_id = hs.satuan_beli_id
    where hs.sumber = 'acuan'
    order by hs.outlet_id, i.bahan_id, i.qty
  ),
  -- pack campuran: harga pack dibagi sebanding harga jual potongan (menu ayam satu-bahan)
  bobot as (
    select h.outlet_id, r.bahan_id, avg(h.harga / r.qty)::numeric as bobot
    from public.resep r join public.menu m on m.id = r.menu_id and m.kategori = 'ayam' and m.aktif
    join public.harga_jual h on h.menu_id = m.id
    where (select count(*) from public.resep r2 where r2.menu_id = r.menu_id) = 1
    group by h.outlet_id, r.bahan_id
  ),
  pack_bobot as (
    select hs.outlet_id, hs.satuan_beli_id, hs.harga, hs.sumber, i.bahan_id, i.qty, bb.bobot,
           -- satu potongan tanpa harga jual → seluruh pack dibagi rata (bobot 1), bukan dicampur
           bool_and(coalesce(bb.bobot, 0) > 0) over (partition by hs.outlet_id, hs.satuan_beli_id) as bobot_lengkap
    from harga_satuan hs join satuan s on s.id = hs.satuan_beli_id and s.anggota > 1
    join public.satuan_beli_isi i on i.satuan_beli_id = hs.satuan_beli_id
    left join bobot bb on bb.outlet_id = hs.outlet_id and bb.bahan_id = i.bahan_id
    where hs.harga is not null
  ),
  pack as (
    select outlet_id, bahan_id, sumber,
           harga * case when bobot_lengkap then bobot else 1 end
             / nullif(sum(qty * case when bobot_lengkap then bobot else 1 end) over (partition by outlet_id, satuan_beli_id), 0) as modal
    from pack_bobot
  )
  select o.id, b.id,
         coalesce(tb.modal, p.modal, ta.modal),
         case when tb.modal is not null then 'beli' when p.modal is not null then p.sumber when ta.modal is not null then 'acuan' end
  from public.outlets o cross join public.bahan b
  left join tunggal_beli tb on tb.outlet_id = o.id and tb.bahan_id = b.id
  left join lateral (select * from pack where pack.outlet_id = o.id and pack.bahan_id = b.id order by (pack.sumber = 'beli') desc, pack.modal limit 1) p on true
  left join tunggal_acuan ta on ta.outlet_id = o.id and ta.bahan_id = b.id
$$;

create or replace function public.rencana_belanja(p_hari integer) returns jsonb
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
    -- satuan beli yang dipakai tiap outlet (mis. Kertapati: saus isi 25, tanpa pack Hot & kulit)
    dipakai as (select o.id as outlet_id, s.id as sid, s.anggota from outlet o cross join satuan s where public._satuan_di_outlet(s.id, o.id)),
    dalam_pack as (select p.outlet_id, i.bahan_id from dipakai p join isi i on i.sid = p.sid where p.anggota > 1),
    -- bahan tunggal: per outlet satu satuan beli (yang punya harga acuan di outlet itu dulu, lalu isi terkecil);
    -- satuan yang sama dipakai banyak outlet tetap satu baris
    pilih as (
      select distinct on (p.outlet_id, i.bahan_id) p.outlet_id, i.sid, i.bahan_id, i.qty as isi
      from dipakai p join isi i on i.sid = p.sid
      left join public.harga_beli hb on hb.outlet_id = p.outlet_id and hb.satuan_beli_id = i.sid
      where p.anggota = 1 and not exists (select 1 from dalam_pack d where d.outlet_id = p.outlet_id and d.bahan_id = i.bahan_id)
      order by p.outlet_id, i.bahan_id, (hb.harga is null), i.qty, i.sid
    ),
    barang as (
      select p.outlet_id, i.sid, i.bahan_id, i.qty as isi
      from dipakai p join isi i on i.sid = p.sid where p.anggota > 1
      union all
      select outlet_id, sid, bahan_id, isi from pilih
    ),
    saldo as (
      select outlet_id, bahan_id, sum(qty) as n from public.gerakan_stok
      where bahan_id in (select bahan_id from isi) group by 1, 2
    ),
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
    anggota as (
      select br.outlet_id, br.sid, br.isi, bh.mode <> 'otomatis' as dari_beli,
             coalesce(sl.n, 0) as saldo, coalesce(pk.n, 0) as pakai7, coalesce(b28.n, 0) as beli28
      from barang br join public.bahan bh on bh.id = br.bahan_id
      left join saldo sl on sl.outlet_id = br.outlet_id and sl.bahan_id = br.bahan_id
      left join pakai pk on pk.outlet_id = br.outlet_id and pk.bahan_id = br.bahan_id
      left join beli28 b28 on b28.outlet_id = br.outlet_id and b28.bahan_id = br.bahan_id
    ),
    hitung as (
      select outlet_id, sid, sum(isi) as isi, bool_or(dari_beli) as dari_beli,
             sum(saldo) as saldo, sum(pakai7) as pakai7, sum(beli28) as beli28,
             -- pack dibeli utuh: jumlah pack = potongan yang paling kurang (mis. dada habis walau sayap masih banyak)
             max(case when dari_beli then beli28 * p_hari / 28 / isi
                      else (pakai7 * p_hari / 7 - greatest(saldo, 0)) / isi end) as kurang
      from anggota group by outlet_id, sid
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
            'saran', greatest(0, ceil(round(n.kurang, 6)))::integer)) as per
          from nilai n group by n.sid
        ) x on x.sid = s.id
      ), '[]'::jsonb)
    )
  );
end
$$;

revoke execute on function public._satuan_di_outlet(uuid, uuid), public._bahan_di_outlet(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.simpan_outlet_satuan(uuid, uuid[]) from public, anon;
grant execute on function public.simpan_outlet_satuan(uuid, uuid[]) to authenticated;
