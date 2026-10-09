-- Tahap 7b: sumber dasbor baru — untung per menu (perkiraan, modal rata-rata periode), susut (opname × modal),
-- dan ukuran nilai rupiah untuk terbuang. Fungsi katalog 0030 diganti (create or replace) dengan isi yang sama + tambahan.
-- $1/$2 di potongan FROM adalah rentang [dari, sampai) yang sama dengan agregasi_dasbor.

create or replace function public._dasbor_katalog() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "penjualan":    {"ukuran": ["omzet", "transaksi", "rata_rata"], "kelompok": ["waktu", "outlet", "kanal", "kasir", "jam", "hari"]},
    "item":         {"ukuran": ["jumlah", "rupiah"], "kelompok": ["waktu", "outlet", "menu", "kategori", "varian", "kanal"]},
    "pemakaian":    {"ukuran": ["jumlah"], "kelompok": ["waktu", "outlet", "bahan"]},
    "terbuang":     {"ukuran": ["jumlah", "nilai"], "kelompok": ["waktu", "outlet", "bahan", "alasan"]},
    "barang_masuk": {"ukuran": ["rupiah", "jumlah"], "kelompok": ["waktu", "outlet", "barang"]},
    "pengeluaran":  {"ukuran": ["rupiah"], "kelompok": ["waktu", "outlet", "kategori", "sumber"]},
    "setoran":      {"ukuran": ["dicatat", "diterima", "selisih"], "kelompok": ["waktu", "outlet"]},
    "tutup_toko":   {"ukuran": ["selisih", "banyak"], "kelompok": ["waktu", "outlet", "kasir"]},
    "batal":        {"ukuran": ["banyak", "rupiah"], "kelompok": ["waktu", "outlet", "kasir", "kanal"]},
    "untung_menu":  {"ukuran": ["untung", "modal", "omzet"], "kelompok": ["waktu", "outlet", "menu", "kategori", "varian"]},
    "susut":        {"ukuran": ["nilai", "jumlah"], "kelompok": ["waktu", "outlet", "bahan"]}
  }'::jsonb
$$;

create or replace function public._dasbor_dari(p_sumber text, out dari text, out syarat text, out waktu text, out outlet text)
language plpgsql immutable set search_path = '' as $$
begin
  case p_sumber
    when 'penjualan' then dari := 'public.penjualan p'; syarat := 'p.void_at is null'; waktu := 'p.waktu'; outlet := 'p.outlet_id';
    when 'item' then
      dari := 'public.penjualan_item i join public.penjualan p on p.id = i.penjualan_id join public.menu m on m.id = i.menu_id';
      syarat := 'p.void_at is null'; waktu := 'p.waktu'; outlet := 'p.outlet_id';
    when 'pemakaian' then dari := 'public.gerakan_stok g'; syarat := 'g.jenis in (''jual'', ''jual_batal'')'; waktu := 'g.waktu'; outlet := 'g.outlet_id';
    when 'terbuang' then
      dari := 'public.rusak r join public.rusak_item ri on ri.rusak_id = r.id left join public._modal_bahan_semua($1, $2) mb on mb.outlet_id = r.outlet_id and mb.bahan_id = ri.bahan_id';
      syarat := 'r.batal_at is null'; waktu := 'r.waktu'; outlet := 'r.outlet_id';
    when 'barang_masuk' then
      dari := 'public.barang_masuk b join public.barang_masuk_item bi on bi.barang_masuk_id = b.id'; syarat := 'b.batal_at is null';
      waktu := 'b.waktu'; outlet := 'b.outlet_id';
    when 'pengeluaran' then dari := 'public.pengeluaran e'; syarat := 'e.batal_at is null'; waktu := 'e.waktu'; outlet := 'e.outlet_id';
    when 'setoran' then dari := 'public.setoran s'; syarat := 's.batal_at is null'; waktu := 's.waktu'; outlet := 's.outlet_id';
    when 'tutup_toko' then
      dari := 'public.shift t'; syarat := 't.ditutup_at is not null and not t.tutup_tertunda'; waktu := 't.ditutup_at'; outlet := 't.outlet_id';
    when 'batal' then dari := 'public.penjualan p'; syarat := 'p.void_at is not null'; waktu := 'p.void_at'; outlet := 'p.outlet_id';
    when 'untung_menu' then
      dari := 'public.penjualan_item i join public.penjualan p on p.id = i.penjualan_id join public.menu m on m.id = i.menu_id'
              || ' left join public._modal_menu_semua($1, $2) mm on mm.outlet_id = p.outlet_id and mm.menu_id = i.menu_id';
      syarat := 'p.void_at is null'; waktu := 'p.waktu'; outlet := 'p.outlet_id';
    when 'susut' then
      dari := 'public.gerakan_stok g left join public._modal_bahan_semua($1, $2) mb on mb.outlet_id = g.outlet_id and mb.bahan_id = g.bahan_id';
      syarat := 'g.jenis = ''opname'''; waktu := 'g.waktu'; outlet := 'g.outlet_id';
  end case;
end
$$;

create or replace function public._dasbor_ukuran(p_sumber text, p_ukuran text) returns text
language sql immutable set search_path = '' as $$
  select case p_sumber || '.' || p_ukuran
    when 'penjualan.omzet' then 'coalesce(sum(p.total), 0)'
    when 'penjualan.transaksi' then 'count(*)'
    when 'penjualan.rata_rata' then 'coalesce(round(avg(p.total)), 0)'
    when 'item.jumlah' then 'coalesce(sum(i.qty), 0)'
    when 'item.rupiah' then 'coalesce(sum(i.subtotal), 0)'
    when 'pemakaian.jumlah' then 'coalesce(round(-sum(g.qty), 3), 0)'
    when 'terbuang.jumlah' then 'coalesce(round(sum(ri.qty), 3), 0)'
    when 'barang_masuk.rupiah' then 'coalesce(sum(bi.subtotal), 0)'
    when 'barang_masuk.jumlah' then 'coalesce(sum(bi.qty), 0)'
    when 'pengeluaran.rupiah' then 'coalesce(sum(e.jumlah), 0)'
    when 'setoran.dicatat' then 'coalesce(sum(s.jumlah), 0)'
    when 'setoran.diterima' then 'coalesce(sum(s.jumlah_diterima), 0)'
    when 'setoran.selisih' then 'coalesce(sum(s.jumlah_diterima - s.jumlah), 0)'
    when 'tutup_toko.selisih' then 'coalesce(sum((public._ringkasan_shift(t.id) ->> ''selisih'')::bigint), 0)'
    when 'tutup_toko.banyak' then 'count(*)'
    when 'batal.banyak' then 'count(*)'
    when 'batal.rupiah' then 'coalesce(sum(p.total), 0)'
    when 'terbuang.nilai' then 'coalesce(round(sum(ri.qty * mb.modal)), 0)'
    when 'untung_menu.untung' then 'coalesce(round(sum(i.subtotal - i.qty * mm.modal)), 0)'
    when 'untung_menu.modal' then 'coalesce(round(sum(i.qty * mm.modal)), 0)'
    when 'untung_menu.omzet' then 'coalesce(sum(i.subtotal), 0)'
    when 'susut.nilai' then 'coalesce(round(sum(g.qty * mb.modal)), 0)'
    when 'susut.jumlah' then 'coalesce(round(sum(g.qty), 3), 0)'
  end
$$;

create or replace function public._dasbor_kunci(p_sumber text, p_kolom text, p_satuan text, p_waktu text, p_outlet text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_kolom = 'waktu' then format('to_char(date_trunc(%L, %s at time zone ''Asia/Jakarta''), ''YYYY-MM-DD HH24:MI'')',
                                       case p_satuan when 'minggu' then 'week' when 'bulan' then 'month' when 'jam' then 'hour' else 'day' end, p_waktu)
    when p_kolom = 'outlet' then p_outlet || '::text'
    when p_kolom = 'jam' then format('lpad(extract(hour from %s at time zone ''Asia/Jakarta'')::int::text, 2, ''0'')', p_waktu)
    when p_kolom = 'hari' then format('extract(isodow from %s at time zone ''Asia/Jakarta'')::int::text', p_waktu)
    else case p_sumber || '.' || p_kolom
      when 'penjualan.kanal' then 'p.metode::text'
      when 'penjualan.kasir' then 'p.kasir_id::text'
      when 'item.menu' then 'i.menu_id::text'
      when 'item.kategori' then 'm.kategori::text'
      when 'item.varian' then 'coalesce(m.varian::text, ''-'')'
      when 'item.kanal' then 'p.metode::text'
      when 'pemakaian.bahan' then 'g.bahan_id::text'
      when 'terbuang.bahan' then 'ri.bahan_id::text'
      when 'terbuang.alasan' then 'r.alasan::text'
      when 'barang_masuk.barang' then 'bi.satuan_beli_id::text'
      when 'pengeluaran.kategori' then 'e.kategori_id::text'
      when 'pengeluaran.sumber' then 'e.sumber::text'
      when 'tutup_toko.kasir' then 'coalesce(t.ditutup_oleh, t.dibuka_oleh)::text'
      when 'batal.kasir' then 'p.void_oleh::text'
      when 'batal.kanal' then 'p.metode::text'
      when 'untung_menu.menu' then 'i.menu_id::text'
      when 'untung_menu.kategori' then 'm.kategori::text'
      when 'untung_menu.varian' then 'coalesce(m.varian::text, ''-'')'
      when 'susut.bahan' then 'g.bahan_id::text'
    end
  end
$$;
