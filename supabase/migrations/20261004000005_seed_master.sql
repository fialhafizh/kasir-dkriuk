-- Data master awal. Harga beli TIDAK di sini (data bisnis; diisi lewat aplikasi / script lokal).

insert into public.bahan (kode, nama, satuan, mode, urutan) values
  ('ori_dada', 'Dada Ori', 'potong', 'otomatis', 10),
  ('ori_paha_atas', 'Paha Atas Ori', 'potong', 'otomatis', 11),
  ('ori_paha_bawah', 'Paha Bawah Ori', 'potong', 'otomatis', 12),
  ('ori_sayap', 'Sayap Ori', 'potong', 'otomatis', 13),
  ('hot_dada', 'Dada Hot', 'potong', 'otomatis', 20),
  ('hot_paha_atas', 'Paha Atas Hot', 'potong', 'otomatis', 21),
  ('hot_paha_bawah', 'Paha Bawah Hot', 'potong', 'otomatis', 22),
  ('hot_sayap', 'Sayap Hot', 'potong', 'otomatis', 23),
  ('kulit', 'Kulit Mentah', 'porsi', 'otomatis', 30),
  ('cup_kulit', 'Cup Kulit', 'pcs', 'otomatis', 31),
  ('beras', 'Beras', 'kg', 'otomatis', 40),
  ('kertas_nasi', 'Kertas Nasi', 'lembar', 'otomatis', 41),
  ('box', 'Box D''Kriuk', 'pcs', 'otomatis', 42),
  ('kemasan_besar', 'Kemasan Besar', 'pcs', 'otomatis', 50),
  ('kemasan_kecil', 'Kemasan Kecil', 'pcs', 'otomatis', 51),
  ('plastik_besar', 'Plastik Besar', 'pcs', 'otomatis', 52),
  ('plastik_kecil', 'Plastik Kecil', 'pcs', 'otomatis', 53),
  ('plastik_merah', 'Plastik Merah', 'pcs', 'catat', 54),
  ('saus_sambal', 'Saus Sambal', 'sachet', 'otomatis', 60),
  ('saus_tomat', 'Saus Tomat', 'sachet', 'otomatis', 61),
  ('tepung_dkriuk', 'Tepung D''Kriuk', 'kg', 'analisis', 70),
  ('tepung_a', 'Tepung A', 'kg', 'analisis', 71),
  ('minyak', 'Minyak Goreng', 'liter', 'analisis', 72);

insert into public.satuan_beli (kode, nama, ambang, harga_tetap, urutan) values
  ('pack_ayam_ori', 'Pack Ayam Ori (1 kg)', 10, true, 10),
  ('pack_ayam_hot', 'Pack Ayam Hot (1 kg)', 5, true, 11),
  ('pack_kulit', 'Pack Kulit Mentah', null, true, 20),
  ('pack_cup_kulit', 'Pack Cup Kulit', 1, true, 21),
  ('beras_kg', 'Beras (per kg)', null, false, 30),
  ('pack_kertas_nasi', 'Pack Kertas Nasi', null, true, 31),
  ('pack_box', 'Pack Box D''Kriuk', null, true, 32),
  ('pack_kemasan_besar', 'Pack Kemasan Besar', 2, true, 40),
  ('pack_kemasan_kecil', 'Pack Kemasan Kecil', 2, true, 41),
  ('pack_plastik_besar', 'Pack Plastik Besar 36/25', null, true, 42),
  ('pack_plastik_kecil', 'Pack Plastik Kecil 25/15', null, true, 43),
  ('pack_plastik_merah', 'Pack Plastik Merah', null, true, 44),
  ('pack_saus_sambal', 'Pack Saus Sambal', null, true, 50),
  ('pack_saus_tomat', 'Pack Saus Tomat', null, true, 51),
  ('pack_tepung_dkriuk', 'Pack Tepung D''Kriuk (1,3 kg)', null, true, 60),
  ('karung_tepung_dkriuk', 'Karung Tepung D''Kriuk (19,5 kg)', null, true, 61),
  ('karung_tepung_a', 'Karung Tepung A (25 kg)', null, false, 62),
  ('minyak_liter', 'Minyak Goreng (per liter)', null, false, 70);

insert into public.satuan_beli_isi (satuan_beli_id, bahan_id, qty)
select s.id, b.id, v.qty
from (values
  ('pack_ayam_ori', 'ori_dada', 3), ('pack_ayam_ori', 'ori_paha_atas', 2),
  ('pack_ayam_ori', 'ori_paha_bawah', 2), ('pack_ayam_ori', 'ori_sayap', 2),
  ('pack_ayam_hot', 'hot_dada', 3), ('pack_ayam_hot', 'hot_paha_atas', 2),
  ('pack_ayam_hot', 'hot_paha_bawah', 2), ('pack_ayam_hot', 'hot_sayap', 2),
  ('pack_kulit', 'kulit', 17),
  ('pack_cup_kulit', 'cup_kulit', 50),
  ('beras_kg', 'beras', 1),
  ('pack_kertas_nasi', 'kertas_nasi', 100),
  ('pack_box', 'box', 100),
  ('pack_kemasan_besar', 'kemasan_besar', 100),
  ('pack_kemasan_kecil', 'kemasan_kecil', 100),
  ('pack_plastik_besar', 'plastik_besar', 50),
  ('pack_plastik_kecil', 'plastik_kecil', 100),
  ('pack_plastik_merah', 'plastik_merah', 50),
  ('pack_saus_sambal', 'saus_sambal', 100),
  ('pack_saus_tomat', 'saus_tomat', 100),
  ('pack_tepung_dkriuk', 'tepung_dkriuk', 1.3),
  ('karung_tepung_dkriuk', 'tepung_dkriuk', 19.5),
  ('karung_tepung_a', 'tepung_a', 25),
  ('minyak_liter', 'minyak', 1)
) as v (satuan, bahan, qty)
join public.satuan_beli s on s.kode = v.satuan
join public.bahan b on b.kode = v.bahan;

insert into public.menu (kode, nama, kategori, varian, urutan) values
  ('ori_dada', 'Dada Ori', 'ayam', 'ori', 10),
  ('ori_paha_atas', 'Paha Atas Ori', 'ayam', 'ori', 11),
  ('ori_paha_bawah', 'Paha Bawah Ori', 'ayam', 'ori', 12),
  ('ori_sayap', 'Sayap Ori', 'ayam', 'ori', 13),
  ('hot_dada', 'Dada Hot', 'ayam', 'hot', 20),
  ('hot_paha_atas', 'Paha Atas Hot', 'ayam', 'hot', 21),
  ('hot_paha_bawah', 'Paha Bawah Hot', 'ayam', 'hot', 22),
  ('hot_sayap', 'Sayap Hot', 'ayam', 'hot', 23),
  ('kulit', 'Kulit Krispy', 'kulit', null, 30),
  ('nasi', 'Nasi', 'nasi', null, 40),
  ('box', 'Box', 'box', null, 41),
  ('kemasan_besar', 'Kemasan Besar', 'pelengkap', null, 50),
  ('kemasan_kecil', 'Kemasan Kecil', 'pelengkap', null, 51),
  ('plastik_besar', 'Plastik Besar', 'pelengkap', null, 52),
  ('plastik_kecil', 'Plastik Kecil', 'pelengkap', null, 53),
  ('saus_sambal', 'Saus Sambal', 'pelengkap', null, 54),
  ('saus_tomat', 'Saus Tomat', 'pelengkap', null, 55);

insert into public.resep (menu_id, bahan_id, qty)
select m.id, b.id, v.qty
from (values
  ('ori_dada', 'ori_dada', 1), ('ori_paha_atas', 'ori_paha_atas', 1),
  ('ori_paha_bawah', 'ori_paha_bawah', 1), ('ori_sayap', 'ori_sayap', 1),
  ('hot_dada', 'hot_dada', 1), ('hot_paha_atas', 'hot_paha_atas', 1),
  ('hot_paha_bawah', 'hot_paha_bawah', 1), ('hot_sayap', 'hot_sayap', 1),
  ('kulit', 'kulit', 1), ('kulit', 'cup_kulit', 1),
  ('nasi', 'beras', 0.1), ('nasi', 'kertas_nasi', 1),
  ('box', 'box', 1),
  ('kemasan_besar', 'kemasan_besar', 1), ('kemasan_kecil', 'kemasan_kecil', 1),
  ('plastik_besar', 'plastik_besar', 1), ('plastik_kecil', 'plastik_kecil', 1),
  ('saus_sambal', 'saus_sambal', 1), ('saus_tomat', 'saus_tomat', 1)
) as v (menu, bahan, qty)
join public.menu m on m.kode = v.menu
join public.bahan b on b.kode = v.bahan;

-- Harga jual standar; Kertapati −Rp1.000 untuk ayam & kulit.
insert into public.harga_jual (outlet_id, menu_id, harga)
select o.id, m.id,
  case when o.kode = 'KP' and m.kategori in ('ayam', 'kulit') then h.harga - 1000 else h.harga end
from (values
  ('ori_dada', 11000), ('ori_paha_atas', 11000), ('ori_paha_bawah', 9000), ('ori_sayap', 9000),
  ('hot_dada', 11000), ('hot_paha_atas', 11000), ('hot_paha_bawah', 9000), ('hot_sayap', 9000),
  ('kulit', 9000), ('nasi', 5000), ('box', 1000),
  ('kemasan_besar', 0), ('kemasan_kecil', 0), ('plastik_besar', 0), ('plastik_kecil', 0),
  ('saus_sambal', 0), ('saus_tomat', 0)
) as h (kode, harga)
join public.menu m on m.kode = h.kode
cross join public.outlets o;
