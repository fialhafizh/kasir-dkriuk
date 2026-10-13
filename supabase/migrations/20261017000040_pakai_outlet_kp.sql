-- Keputusan owner 13 Okt 2026: plastik besar, kemasan kecil, kertas nasi, box D'Kriuk, dan plastik merah tidak dipakai
-- di Kertapati (hanya Bukit Lama & Talang Kerangga). Saus sambal & tomat isi 25 tetap khusus Kertapati.
delete from public.satuan_beli_outlet so using public.satuan_beli s
where so.satuan_beli_id = s.id and s.kode in ('pack_plastik_besar', 'pack_kemasan_kecil', 'pack_kertas_nasi', 'pack_box', 'pack_plastik_merah');
insert into public.satuan_beli_outlet (satuan_beli_id, outlet_id)
select s.id, o.id from public.satuan_beli s cross join public.outlets o
where s.kode in ('pack_plastik_besar', 'pack_kemasan_kecil', 'pack_kertas_nasi', 'pack_box', 'pack_plastik_merah') and o.kode in ('BL', 'TK');
