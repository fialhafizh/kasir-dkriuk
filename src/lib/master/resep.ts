import { parseQty } from './rupiah.ts';
import type { BarisIsi } from './types.ts';

/** Memeriksa isian editor resep sebelum dikirim; aturan yang sama juga dijaga database. */
export function validasiResep(
	baris: { bahan_id: string; teks: string }[],
	diizinkan?: Set<string>
): { ok: true; isi: BarisIsi[] } | { ok: false; error: string } {
	if (baris.length === 0) return { ok: false, error: 'Resep minimal satu bahan.' };
	const isi: BarisIsi[] = [];
	for (const [i, r] of baris.entries()) {
		if (diizinkan && !diizinkan.has(r.bahan_id)) {
			return { ok: false, error: `Baris ${i + 1}: ganti bahan yang ditandai (nonaktif atau tidak dipotong otomatis).` };
		}
		const qty = parseQty(r.teks);
		if (qty === null) return { ok: false, error: 'Setiap jumlah harus angka lebih dari 0 (koma untuk desimal), mis. 0,1' };
		isi.push({ bahan_id: r.bahan_id, qty });
	}
	if (new Set(isi.map((i) => i.bahan_id)).size !== isi.length) return { ok: false, error: 'Bahan yang sama dipilih dua kali.' };
	return { ok: true, isi };
}
