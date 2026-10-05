-- Nilai jenis gerakan untuk Tahap 3b. File tersendiri: nilai enum baru tidak bisa dipakai
-- di transaksi yang sama dengan penambahannya.
alter type public.jenis_gerakan add value 'rusak';
alter type public.jenis_gerakan add value 'rusak_batal';
alter type public.jenis_gerakan add value 'transfer_keluar';
alter type public.jenis_gerakan add value 'transfer_masuk';
alter type public.jenis_gerakan add value 'opname';
