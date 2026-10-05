import { pesanErrorData } from '#lib/master/pesan.ts';

// Pesan resmi fungsi SQL stok (migrasi 0011) + akses outlet (0009); hanya ini yang diteruskan apa adanya.
const PESAN_STOK =
	/^(Hanya admin yang boleh mengelola stok|Data barang masuk tidak lengkap|Outlet tidak ditemukan|Tanggal barang masuk|Catatan paling banyak 200 karakter|Barang masuk minimal satu barang|Barang tidak dikenal atau nonaktif|Barang yang sama tertulis dua kali|Jumlah barang tidak sah|Harga barang tidak sah|Harga barang yang harganya berubah-ubah wajib diisi|Barang masuk tidak ditemukan|Barang masuk sebelum stok|Barang belum punya isi bahan|Barang masuk sudah dibatalkan|Alasan pembatalan wajib diisi|Stok awal outlet ini|Isi minimal satu bahan|Bahan tidak dikenal atau nonaktif|Bahan yang sama tertulis dua kali|Jumlah stok tidak sah|Ajuan stok awal|Alasan penolakan wajib diisi|Data rusak tidak lengkap|Catatan wajib diisi untuk alasan lainnya|Catatan rusak|Data transfer tidak lengkap|Outlet tujuan|Transfer tidak ditemukan|Transfer sudah|Ada perbedaan jumlah\. Silakan hubungi outlet pengirim|Opname butuh stok awal|Opname outlet ini masih menunggu|Selesaikan kiriman\/penerimaan dulu|Ajuan opname|Anda tidak berhak mengakses outlet ini)/;

export function pesanStok(err: { code?: string; message?: string; status?: number; name?: string } | null): string | null {
	if (!err) return null;
	const msg = err.message ?? '';
	if ((err.code === '22023' || err.code === '42501') && PESAN_STOK.test(msg)) return msg.endsWith('.') ? msg : `${msg}.`;
	return pesanErrorData(err);
}
