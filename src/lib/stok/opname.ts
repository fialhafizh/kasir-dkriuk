// Opname: penanda selisih besar & pengingat mingguan (WIB, minggu dimulai hari Minggu).
import type { IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';

const WIB_MS = 7 * 3_600_000;

/** Isi terkecil dari satuan beli aktif yang memuat bahan (1 pack-setara per bahan). */
export function isiPerBahan(satuan: SatuanBeli[], isi: IsiSatuanBeli[]): Map<string, number> {
	const aktif = new Set(satuan.filter((s) => s.aktif).map((s) => s.id));
	const hasil = new Map<string, number>();
	for (const x of isi) {
		if (!aktif.has(x.satuan_beli_id)) continue;
		const lama = hasil.get(x.bahan_id);
		if (lama === undefined || x.qty < lama) hasil.set(x.bahan_id, x.qty);
	}
	return hasil;
}

/** Selisih besar: ≥ 1 pack-setara (bila diketahui) atau ≥ 10% dari angka sistem. */
export function selisihBesar(hitung: number, sistem: number, isiPack?: number): boolean {
	const d = Math.abs(hitung - sistem);
	if (d < 1e-9) return false;
	if (isiPack !== undefined && d >= isiPack - 1e-9) return true;
	return sistem === 0 || d >= Math.abs(sistem) * 0.1 - 1e-9;
}

/** Minggu 00:00 WIB terakhir (≤ sekarang). */
export function awalMingguWib(sekarang: Date): Date {
	const wib = new Date(sekarang.getTime() + WIB_MS);
	const tengahMalam = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - WIB_MS;
	return new Date(tengahMalam - wib.getUTCDay() * 86_400_000);
}

/**
 * Pengingat tampil sejak Minggu sampai ada opname (diajukan/disetujui) yang dihitung minggu ini.
 * Tidak tampil bila stok awal belum disetujui, stok awal baru dihitung minggu ini, atau masih ada opname menunggu.
 */
export function perluOpname(sekarang: Date, stokAwalAt: string | null, opname: { status: string; dihitung_at: string }[]): boolean {
	if (!stokAwalAt) return false;
	const awal = awalMingguWib(sekarang).getTime();
	if (new Date(stokAwalAt).getTime() >= awal) return false;
	if (opname.some((o) => o.status === 'diajukan')) return false;
	return !opname.some((o) => o.status !== 'ditolak' && new Date(o.dihitung_at).getTime() >= awal);
}
