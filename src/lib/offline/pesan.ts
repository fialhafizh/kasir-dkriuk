import { pesanKasir } from '#lib/kasir/pesan.ts';
import { pesanStok } from '#lib/stok/pesan.ts';

// Pesan resmi fungsi offline (migrasi 0019 & 0021) yang belum ada di allowlist kasir/stok.
const PESAN_OFFLINE = /^(Data perangkat tidak lengkap|Data shift tidak lengkap|Toko kemarin belum ditutup|Kode struk tidak sah|Data opname tidak lengkap|Data stok awal tidak lengkap|Opname ini lebih lama dari hitungan stok terakhir)/;

type Galat = { code?: string; message?: string; status?: number; name?: string } | null;

/** Alasan penolakan untuk daftar "Perlu perhatian". */
export function pesanSinkron(err: Galat): string {
	const msg = err?.message ?? '';
	if ((err?.code === '22023' || err?.code === '42501') && PESAN_OFFLINE.test(msg)) return msg.endsWith('.') ? msg : `${msg}.`;
	const k = pesanKasir(err);
	if (k && k !== 'Isian tidak sah.') return k;
	return pesanStok(err) ?? 'Terjadi kesalahan.';
}
