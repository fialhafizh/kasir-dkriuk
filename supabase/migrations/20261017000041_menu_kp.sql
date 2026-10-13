-- Keputusan owner 13 Okt 2026: menu Box, Kemasan Kecil, Plastik Besar tidak dijual di Kertapati
-- (menu tanpa harga jual tidak tampil di kasir; penjualan lama tetap tersimpan).
delete from public.harga_jual h using public.menu m, public.outlets o
where h.menu_id = m.id and h.outlet_id = o.id and o.kode = 'KP' and m.kode in ('box', 'kemasan_kecil', 'plastik_besar');
