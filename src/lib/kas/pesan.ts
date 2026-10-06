import { pesanKasir } from '#lib/kasir/pesan.ts';

// Pesan resmi fungsi SQL kas (migrasi 0022–0023); hanya ini yang diteruskan apa adanya.
const PESAN_KAS =
	/^(Hanya admin yang boleh mengelola keuangan|Data pengeluaran tidak lengkap|Kategori pengeluaran tidak dikenal atau nonaktif|Jumlah pengeluaran tidak sah|Keterangan wajib diisi untuk kategori ini|Keterangan paling banyak 200 karakter|Outlet tidak ditemukan|Tanggal pengeluaran tidak sah|Pengeluaran tidak ditemukan|Pengeluaran sudah dibatalkan|Alasan pembatalan wajib diisi|Data setoran tidak lengkap|Jumlah setoran tidak sah|Catatan paling banyak 200 karakter|Setoran tidak ditemukan|Setoran sudah dibatalkan|Setoran sudah diterima|Setoran yang sudah diterima tidak bisa dibatalkan|Catatan wajib diisi bila jumlah yang diterima berbeda|Nama kategori 2–40 karakter|Nama kategori sudah dipakai|Kategori tidak ditemukan|Rentang tanggal tidak sah|Outlet ini nonaktif|Data shift tidak lengkap|Modal kembalian tidak sah|Toko kemarin belum ditutup)/;

type Galat = { code?: string; message?: string; status?: number; name?: string } | null;

export function pesanKas(err: Galat): string | null {
	if (!err) return null;
	const msg = err.message ?? '';
	if ((err.code === '22023' || err.code === '42501') && PESAN_KAS.test(msg)) return msg.endsWith('.') ? msg : `${msg}.`;
	return pesanKasir(err);
}
