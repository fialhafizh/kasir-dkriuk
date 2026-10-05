// Langkah "sisa tidak terjual" di Tutup toko: isian per menu yang dimasak (ayam, kulit, nasi) → bahan.
import type { Bahan, Menu, Resep } from '#lib/master/types.ts';
import type { ItemHitung } from './types.ts';

export interface BarisSisa {
	kunci: string;
	label: string;
	satuan: string;
	/** Bahan yang terbuang per 1 satuan isian (nasi 1 porsi → beras 0,1 kg). */
	ke: { bahan_id: string; faktor: number }[];
}

/**
 * Ayam: satu baris per potongan (bahan resep menu ayam). Kulit: bahan porsi kulit saja (cup tidak terbuang).
 * Nasi: beras saja (kertas belum dipakai). Urut menurut urutan bahan.
 */
export function bentukSisa(bahan: Bahan[], menu: Menu[], resep: Resep[]): BarisSisa[] {
	const perId = new Map(bahan.filter((b) => b.aktif).map((b) => [b.id, b]));
	const resepMenu = (m: Menu) => resep.filter((r) => r.menu_id === m.id && perId.has(r.bahan_id));
	const hasil: (BarisSisa & { urutan: number })[] = [];
	for (const m of menu.filter((x) => x.aktif)) {
		if (m.kategori === 'ayam') {
			for (const r of resepMenu(m)) {
				const b = perId.get(r.bahan_id)!;
				if (b.satuan !== 'potong' || hasil.some((h) => h.kunci === b.id)) continue;
				hasil.push({ kunci: b.id, label: b.nama, satuan: 'potong', ke: [{ bahan_id: b.id, faktor: r.qty }], urutan: b.urutan });
			}
		} else if (m.kategori === 'kulit') {
			const r = resepMenu(m).find((x) => perId.get(x.bahan_id)!.satuan === 'porsi');
			if (r) hasil.push({ kunci: 'kulit', label: 'Kulit', satuan: 'porsi', ke: [{ bahan_id: r.bahan_id, faktor: r.qty }], urutan: perId.get(r.bahan_id)!.urutan });
		} else if (m.kategori === 'nasi') {
			const r = resepMenu(m).find((x) => perId.get(x.bahan_id)!.satuan === 'kg');
			if (r) hasil.push({ kunci: 'nasi', label: 'Nasi', satuan: 'porsi', ke: [{ bahan_id: r.bahan_id, faktor: r.qty }], urutan: perId.get(r.bahan_id)!.urutan });
		}
	}
	return hasil.sort((a, b) => a.urutan - b.urutan).map(({ urutan: _, ...x }) => x);
}

/** Bilangan bulat ≥ 0 per baris; kosong/0 dilewati; bahan sama digabung. */
export function kumpulkanSisa(baris: BarisSisa[], teks: Record<string, string>): { item: ItemHitung[]; galat: Record<string, string> } {
	const jumlah = new Map<string, number>();
	const galat: Record<string, string> = {};
	for (const r of baris) {
		const t = (teks[r.kunci] ?? '').trim();
		if (t === '') continue;
		if (!/^\d+$/.test(t) || Number(t) > 10000) {
			galat[r.kunci] = 'Isi angka bulat.';
			continue;
		}
		const n = Number(t);
		for (const k of r.ke) jumlah.set(k.bahan_id, Math.round(((jumlah.get(k.bahan_id) ?? 0) + n * k.faktor) * 10000) / 10000);
	}
	return { item: [...jumlah].filter(([, q]) => q > 0).map(([bahan_id, qty]) => ({ bahan_id, qty })), galat };
}
