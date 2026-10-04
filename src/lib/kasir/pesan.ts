import { pesanErrorData } from '#lib/master/pesan.ts';

// Pesan resmi dari fungsi SQL kasir (migrasi 0009); hanya ini yang diteruskan apa adanya ke kasir.
const PESAN_KASIR =
	/^(Shift belum dibuka|Shift sudah ditutup|Shift tidak ditemukan|Uang diterima kurang dari total|Menu tidak tersedia di outlet ini|Jumlah item tidak sah|Jumlah uang di laci tidak sah|Penjualan minimal satu item|Penjualan sudah dibatalkan|Penjualan tidak ditemukan|Penjualan dari shift yang sudah ditutup hanya bisa dibatalkan admin|Alasan pembatalan wajib diisi|Modal kembalian tidak sah|Data penjualan tidak lengkap|Anda tidak berhak mengakses outlet ini)/;

export function pesanKasir(err: { code?: string; message?: string; status?: number; name?: string } | null): string | null {
	if (!err) return null;
	const msg = err.message ?? '';
	if ((err.code === '22023' || err.code === '42501') && PESAN_KASIR.test(msg)) return msg.endsWith('.') ? msg : `${msg}.`;
	return pesanErrorData(err);
}
