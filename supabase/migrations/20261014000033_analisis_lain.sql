-- Tahap 7b: susut & terbuang (rupiah), minyak & tepung, proyeksi bulan berjalan. Semua perkiraan, admin saja.

create function public._cek_rentang_analisis(p_dari timestamptz, p_sampai timestamptz) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_dari is null or p_sampai is null or p_dari >= p_sampai or p_sampai - p_dari > interval '400 days' then
    raise exception 'Rentang tanggal tidak sah' using errcode = '22023';
  end if;
end
$$;

-- Susut = selisih opname (hitung − sistem, bertanggal jam hitung) × modal; terbuang = sisa/rusak tidak batal × modal.
create function public.susut_terbuang(p_outlet uuid, p_dari timestamptz, p_sampai timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._wajib_admin_dasbor();
  perform public._cek_rentang_analisis(p_dari, p_sampai);
  return (
    with modal as (select * from public._modal_bahan_semua(p_dari, p_sampai)),
    susut as (
      select g.outlet_id, g.bahan_id, sum(g.qty) as jumlah, round(sum(g.qty * m.modal)) as nilai, count(distinct g.opname_id) as opname
      from public.gerakan_stok g left join modal m on m.outlet_id = g.outlet_id and m.bahan_id = g.bahan_id
      where g.jenis = 'opname' and g.waktu >= p_dari and g.waktu < p_sampai and (p_outlet is null or g.outlet_id = p_outlet)
      group by g.outlet_id, g.bahan_id
    ),
    buang as (
      select r.outlet_id, r.alasan::text as alasan, ri.bahan_id, sum(ri.qty) as jumlah, round(sum(ri.qty * m.modal)) as nilai
      from public.rusak r join public.rusak_item ri on ri.rusak_id = r.id
      left join modal m on m.outlet_id = r.outlet_id and m.bahan_id = ri.bahan_id
      where r.batal_at is null and r.waktu >= p_dari and r.waktu < p_sampai and (p_outlet is null or r.outlet_id = p_outlet)
      group by r.outlet_id, r.alasan, ri.bahan_id
    )
    select jsonb_build_object(
      'susut', coalesce((select jsonb_agg(jsonb_build_object('outlet_id', s.outlet_id, 'bahan_id', s.bahan_id, 'nama', b.nama, 'satuan', b.satuan,
                                                             'jumlah', round(s.jumlah, 3), 'nilai', s.nilai, 'opname', s.opname) order by s.nilai nulls last)
                         from susut s join public.bahan b on b.id = s.bahan_id), '[]'::jsonb),
      'susut_total', coalesce((select sum(nilai) from susut), 0),
      'terbuang', coalesce((select jsonb_agg(jsonb_build_object('outlet_id', t.outlet_id, 'alasan', t.alasan,
                                                                'label_alasan', public._dasbor_label('terbuang', 'alasan', null, t.alasan),
                                                                'bahan_id', t.bahan_id, 'nama', b.nama, 'satuan', b.satuan,
                                                                'jumlah', round(t.jumlah, 3), 'nilai', t.nilai) order by t.nilai desc nulls last)
                            from buang t join public.bahan b on b.id = t.bahan_id), '[]'::jsonb),
      'terbuang_total', coalesce((select sum(nilai) from buang), 0)
    )
  );
end
$$;

-- Minyak & tepung: tiap pembelian sampai pembelian berikutnya → potong ayam + porsi kulit terjual, potong per liter/kg, biaya per potong.
create function public.minyak_tepung(p_outlet uuid, p_dari timestamptz, p_sampai timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._wajib_admin_dasbor();
  perform public._cek_rentang_analisis(p_dari, p_sampai);
  return coalesce((
    with bahan as (
      select b.id, b.kode, b.nama, b.satuan from public.bahan b where b.kode in ('minyak', 'tepung_dkriuk', 'tepung_a')
    ),
    -- semua pembelian (untuk mencari pembelian berikutnya)
    beli_semua as (
      select bm.outlet_id, bh.id as bahan_id, bm.waktu, sum(bi.qty * i.qty) as jumlah, sum(bi.subtotal) as rupiah
      from public.barang_masuk bm
      join public.barang_masuk_item bi on bi.barang_masuk_id = bm.id
      join public.satuan_beli_isi i on i.satuan_beli_id = bi.satuan_beli_id
      join bahan bh on bh.id = i.bahan_id
      where bm.batal_at is null and (p_outlet is null or bm.outlet_id = p_outlet)
      group by bm.outlet_id, bh.id, bm.waktu
    ),
    beli as (
      select b.*, lead(b.waktu) over (partition by b.outlet_id, b.bahan_id order by b.waktu) as berikut from beli_semua b
    ),
    goreng as (
      -- potong ayam + porsi kulit terjual (yang digoreng)
      select p.outlet_id, p.waktu, i.qty
      from public.penjualan_item i join public.penjualan p on p.id = i.penjualan_id join public.menu m on m.id = i.menu_id
      where p.void_at is null and m.kategori in ('ayam', 'kulit') and (p_outlet is null or p.outlet_id = p_outlet)
    ),
    interval_beli as (
      select b.outlet_id, b.bahan_id, b.waktu, b.jumlah, b.rupiah, b.berikut is null as berjalan,
             coalesce((select sum(g.qty) from goreng g where g.outlet_id = b.outlet_id and g.waktu >= b.waktu
                         and g.waktu < coalesce(b.berikut, now())), 0) as potong
      from beli b where b.waktu >= p_dari and b.waktu < p_sampai
    ),
    potong_periode as (
      select g.outlet_id, sum(g.qty) as potong from goreng g where g.waktu >= p_dari and g.waktu < p_sampai group by g.outlet_id
    ),
    per_outlet as (
      select o.id as outlet_id, o.nama,
        (select jsonb_agg(jsonb_build_object(
           'kode', bh.kode, 'nama', bh.nama, 'satuan', bh.satuan,
           'pembelian', coalesce((select jsonb_agg(jsonb_build_object(
               'waktu', ib.waktu, 'jumlah', round(ib.jumlah, 2), 'rupiah', ib.rupiah, 'berjalan', ib.berjalan, 'potong', ib.potong,
               'potong_per_satuan', case when ib.jumlah > 0 then round(ib.potong / ib.jumlah, 1) end,
               'biaya_per_potong', case when ib.potong > 0 then round(ib.rupiah::numeric / ib.potong) end) order by ib.waktu)
             from interval_beli ib where ib.outlet_id = o.id and ib.bahan_id = bh.id), '[]'::jsonb),
           -- rata-rata hanya dari interval yang sudah selesai (sudah ada pembelian berikutnya)
           'potong_per_satuan', (select round(sum(ib.potong) / nullif(sum(ib.jumlah), 0), 1) from interval_beli ib
                                 where ib.outlet_id = o.id and ib.bahan_id = bh.id and not ib.berjalan),
           'biaya_per_potong', (select round(sum(ib.rupiah)::numeric / nullif(sum(ib.potong), 0)) from interval_beli ib
                                where ib.outlet_id = o.id and ib.bahan_id = bh.id and not ib.berjalan)
         ) order by bh.kode) from bahan bh) as bahan,
        (select coalesce(sum(b.jumlah) filter (where bh.kode = 'tepung_dkriuk'), 0) from beli_semua b join bahan bh on bh.id = b.bahan_id
          where b.outlet_id = o.id and b.waktu >= p_dari and b.waktu < p_sampai) as kg_dkriuk,
        (select coalesce(sum(b.jumlah) filter (where bh.kode = 'tepung_a'), 0) from beli_semua b join bahan bh on bh.id = b.bahan_id
          where b.outlet_id = o.id and b.waktu >= p_dari and b.waktu < p_sampai) as kg_a,
        (select coalesce(sum(b.rupiah), 0) from beli_semua b join bahan bh on bh.id = b.bahan_id
          where b.outlet_id = o.id and bh.kode like 'tepung%' and b.waktu >= p_dari and b.waktu < p_sampai) as biaya_tepung,
        coalesce((select potong from potong_periode pp where pp.outlet_id = o.id), 0) as potong
      from public.outlets o where o.aktif and (p_outlet is null or o.id = p_outlet)
    )
    select jsonb_agg(jsonb_build_object(
      'outlet_id', outlet_id, 'nama', nama, 'bahan', bahan,
      'tepung', jsonb_build_object(
        'kg_dkriuk', round(kg_dkriuk, 2), 'kg_a', round(kg_a, 2),
        'persen_dkriuk', case when kg_dkriuk + kg_a > 0 then round(kg_dkriuk / (kg_dkriuk + kg_a) * 100, 1) end,
        'menyimpang', kg_dkriuk + kg_a > 0 and (kg_dkriuk / (kg_dkriuk + kg_a) * 100 not between 40 and 60),
        'biaya', biaya_tepung, 'potong', potong,
        'modal_per_potong', case when potong > 0 then round(biaya_tepung::numeric / potong) end)
    ) order by nama) from per_outlet
  ), '[]'::jsonb);
end
$$;

-- Proyeksi bulan berjalan dari laba riil (laporan_keuangan) s.d. hari ini, dibanding bulan lalu penuh.
create function public.proyeksi_bulan(p_outlet uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hari date := (now() at time zone 'Asia/Jakarta')::date;
  v_awal date := date_trunc('month', v_hari)::date;
  v_jumlah_hari integer := extract(day from (v_awal + interval '1 month - 1 day'))::integer;
  v_lalu_awal date := (v_awal - interval '1 month')::date;
  v_berjalan integer := extract(day from v_hari)::integer;
  v_ini jsonb;
  v_lalu jsonb;
begin
  perform public._wajib_admin_dasbor();
  v_ini := public.laporan_keuangan(p_outlet, v_awal, v_hari);
  v_lalu := public.laporan_keuangan(p_outlet, v_lalu_awal, v_awal - 1);
  return jsonb_build_object(
    'bulan', v_awal, 'hari_berjalan', v_berjalan, 'hari_sebulan', v_jumlah_hari,
    'omzet', v_ini -> 'omzet', 'laba', v_ini -> 'laba',
    'proyeksi_omzet', round((v_ini ->> 'omzet')::numeric / v_berjalan * v_jumlah_hari),
    'proyeksi_laba', round((v_ini ->> 'laba')::numeric / v_berjalan * v_jumlah_hari),
    'bulan_lalu_omzet', v_lalu -> 'omzet', 'bulan_lalu_laba', v_lalu -> 'laba');
end
$$;

revoke execute on function public._cek_rentang_analisis(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.susut_terbuang(uuid, timestamptz, timestamptz), public.minyak_tepung(uuid, timestamptz, timestamptz),
  public.proyeksi_bulan(uuid) from public, anon;
grant execute on function public.susut_terbuang(uuid, timestamptz, timestamptz), public.minyak_tepung(uuid, timestamptz, timestamptz),
  public.proyeksi_bulan(uuid) to authenticated;
