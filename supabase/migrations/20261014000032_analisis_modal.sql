-- Tahap 7b: modal per bahan & untung per menu (perkiraan; laba riil tetap laporan_keuangan).

create table public.analisis_pengaturan (
  id boolean primary key default true check (id),
  -- menu ditandai "untung tipis" bila untung kotor di bawah persen ini
  batas_untung numeric(5, 2) not null default 30 check (batas_untung between 0 and 100),
  diubah_at timestamptz not null default now()
);
insert into public.analisis_pengaturan (id) values (true);
alter table public.analisis_pengaturan enable row level security;
revoke all on public.analisis_pengaturan from anon, authenticated;
grant select on public.analisis_pengaturan to authenticated;
grant all on public.analisis_pengaturan to service_role;
create policy analisis_pengaturan_baca on public.analisis_pengaturan for select to authenticated using ((select public.is_admin()));

create function public.simpan_batas_untung(p_batas numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._wajib_admin_dasbor();
  if p_batas is null or p_batas < 0 or p_batas > 100 then
    raise exception 'Batas untung 0–100 persen' using errcode = '22023';
  end if;
  update public.analisis_pengaturan set batas_untung = p_batas, diubah_at = now() where id;
end
$$;

-- Modal per satuan bahan untuk SEMUA outlet aktif di periode [dari, sampai).
-- sumber: 'beli' (rata-rata barang masuk periode) | 'acuan' (Harga Beli) ; modal null = belum ada harga.
create function public._modal_bahan_semua(p_dari timestamptz, p_sampai timestamptz)
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

-- Modal per porsi menu per outlet (Σ resep × modal bahan); lengkap = semua bahan resep punya harga.
create function public._modal_menu_semua(p_dari timestamptz, p_sampai timestamptz)
returns table (outlet_id uuid, menu_id uuid, modal numeric, lengkap boolean)
language sql stable security definer set search_path = '' as $$
  -- modal hanya bila SEMUA bahan resep punya harga (sebagian = belum lengkap, bukan angka yang terlalu kecil)
  select mb.outlet_id, r.menu_id, case when bool_and(mb.modal is not null) then sum(r.qty * mb.modal) end, bool_and(mb.modal is not null)
  from public.resep r join public._modal_bahan_semua(p_dari, p_sampai) mb on mb.bahan_id = r.bahan_id
  group by mb.outlet_id, r.menu_id
$$;

create function public.modal_bahan(p_outlet uuid, p_dari timestamptz, p_sampai timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._wajib_admin_dasbor();
  if p_dari is null or p_sampai is null or p_dari >= p_sampai or p_sampai - p_dari > interval '400 days' then
    raise exception 'Rentang tanggal tidak sah' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('outlet_id', m.outlet_id, 'bahan_id', m.bahan_id, 'nama', b.nama, 'satuan', b.satuan,
                                        'modal', round(m.modal, 2), 'sumber', m.sumber) order by m.outlet_id, b.urutan)
    from public._modal_bahan_semua(p_dari, p_sampai) m join public.bahan b on b.id = m.bahan_id
    join public.outlets o on o.id = m.outlet_id
    where b.aktif and o.aktif and (p_outlet is null or m.outlet_id = p_outlet)
  ), '[]'::jsonb);
end
$$;

-- Untung per menu per outlet: harga jual, modal, untung/porsi, persen, dan penjualan periode.
create function public.untung_menu(p_outlet uuid, p_dari timestamptz, p_sampai timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_batas numeric := (select batas_untung from public.analisis_pengaturan where id);
begin
  perform public._wajib_admin_dasbor();
  if p_dari is null or p_sampai is null or p_dari >= p_sampai or p_sampai - p_dari > interval '400 days' then
    raise exception 'Rentang tanggal tidak sah' using errcode = '22023';
  end if;
  return jsonb_build_object('batas_untung', v_batas, 'menu', coalesce((
    with jual as (
      select p.outlet_id, i.menu_id, sum(i.qty) as qty, sum(i.subtotal) as omzet
      from public.penjualan_item i join public.penjualan p on p.id = i.penjualan_id
      where p.void_at is null and p.waktu >= p_dari and p.waktu < p_sampai and (p_outlet is null or p.outlet_id = p_outlet)
      group by p.outlet_id, i.menu_id
    )
    select jsonb_agg(jsonb_build_object(
      'outlet_id', h.outlet_id, 'menu_id', m.id, 'nama', m.nama, 'kategori', m.kategori,
      'harga', h.harga, 'modal', round(mm.modal), 'lengkap', coalesce(mm.lengkap, false),
      'untung', round(h.harga - mm.modal),
      'persen', case when h.harga > 0 and mm.modal is not null then round((h.harga - mm.modal) / h.harga * 100, 1) end,
      'tipis', h.harga > 0 and mm.modal is not null and (h.harga - mm.modal) / h.harga * 100 < v_batas,
      'terjual', coalesce(j.qty, 0), 'omzet', coalesce(j.omzet, 0),
      'untung_periode', case when mm.modal is not null then round(coalesce(j.omzet, 0) - coalesce(j.qty, 0) * mm.modal) end
    ) order by o.kode, (h.harga - mm.modal) / nullif(h.harga, 0) nulls first, m.urutan)
    from public.harga_jual h
    join public.menu m on m.id = h.menu_id and m.aktif
    join public.outlets o on o.id = h.outlet_id and o.aktif
    left join public._modal_menu_semua(p_dari, p_sampai) mm on mm.outlet_id = h.outlet_id and mm.menu_id = h.menu_id
    left join jual j on j.outlet_id = h.outlet_id and j.menu_id = h.menu_id
    where p_outlet is null or h.outlet_id = p_outlet
  ), '[]'::jsonb));
end
$$;

revoke execute on function public._modal_bahan_semua(timestamptz, timestamptz), public._modal_menu_semua(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.simpan_batas_untung(numeric), public.modal_bahan(uuid, timestamptz, timestamptz),
  public.untung_menu(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.simpan_batas_untung(numeric), public.modal_bahan(uuid, timestamptz, timestamptz),
  public.untung_menu(uuid, timestamptz, timestamptz) to authenticated;
