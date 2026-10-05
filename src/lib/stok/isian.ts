// Formulir hitungan fisik (stok awal; nanti opname 3b): bentuk kotak per bahan & konversi ke satuan dasar.
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import type { ItemHitung } from './types.ts';

export type Isian =
	| { bahan_id: string; label: string; jenis: 'satu'; satuan: string; desimal: boolean }
	| { bahan_id: string; label: string; jenis: 'pack'; satuan: string; isi: number };

/** a = jumlah (atau pack utuh), b = satuan lepas (hanya untuk jenis 'pack'). */
export type TeksIsian = Record<string, { a: string; b: string }>;

/** Ayam (satuan beli berisi banyak bahan), kg/liter, dan bahan tanpa pack → satu kotak; selain itu pack + lepas. */
export function bentukIsian(bahan: Bahan[], satuan: SatuanBeli[], isi: IsiSatuanBeli[]): Isian[] {
	const satuanAktif = new Set(satuan.filter((s) => s.aktif).map((s) => s.id));
	const perSatuan = new Map<string, IsiSatuanBeli[]>();
	for (const x of isi) {
		if (!satuanAktif.has(x.satuan_beli_id)) continue;
		perSatuan.set(x.satuan_beli_id, [...(perSatuan.get(x.satuan_beli_id) ?? []), x]);
	}
	const dalamGrup = new Set<string>();
	const isiTunggal = new Map<string, number>();
	for (const baris of perSatuan.values()) {
		if (baris.length > 1) for (const x of baris) dalamGrup.add(x.bahan_id);
		else {
			const lama = isiTunggal.get(baris[0].bahan_id);
			if (lama === undefined || baris[0].qty < lama) isiTunggal.set(baris[0].bahan_id, baris[0].qty);
		}
	}
	return bahan
		.filter((b) => b.aktif)
		.sort((a, b) => a.urutan - b.urutan)
		.map((b): Isian => {
			const desimal = b.satuan === 'kg' || b.satuan === 'liter';
			const n = isiTunggal.get(b.id);
			if (dalamGrup.has(b.id) || desimal || n === undefined || n === 1) {
				return { bahan_id: b.id, label: b.nama, jenis: 'satu', satuan: b.satuan, desimal };
			}
			return { bahan_id: b.id, label: b.nama, jenis: 'pack', satuan: b.satuan, isi: n };
		});
}

/** Hitungan fisik: bulat (atau ≤3 desimal untuk kg/liter), 0..1.000.000. Kosong → null. "1.000" ditolak (ambigu). */
export function parseHitung(teks: string, desimal: boolean): number | null {
	const t = teks.trim();
	if (t === '' || /^\d{1,3}(\.\d{3})+$/.test(t)) return null;
	if (!(desimal ? /^\d+([.,]\d{1,3})?$/ : /^\d+$/).test(t)) return null;
	const n = Number(t.replace(',', '.'));
	return n <= 1_000_000 ? n : null;
}

export function kumpulkanIsian(isian: Isian[], teks: TeksIsian): { item: ItemHitung[]; galat: Record<string, string> } {
	const item: ItemHitung[] = [];
	const galat: Record<string, string> = {};
	for (const f of isian) {
		const t = teks[f.bahan_id] ?? { a: '', b: '' };
		if (f.jenis === 'satu') {
			const n = parseHitung(t.a, f.desimal);
			if (n === null) galat[f.bahan_id] = f.desimal ? 'Isi angka, mis. 12,5 (isi 0 bila habis).' : 'Isi angka bulat (isi 0 bila habis).';
			else item.push({ bahan_id: f.bahan_id, qty: n });
			continue;
		}
		if (t.a.trim() === '' && t.b.trim() === '') {
			galat[f.bahan_id] = 'Isi jumlah pack dan/atau yang lepas (isi 0 bila habis).';
			continue;
		}
		const pack = parseHitung(t.a.trim() === '' ? '0' : t.a, false);
		const lepas = parseHitung(t.b.trim() === '' ? '0' : t.b, false);
		if (pack === null || lepas === null) galat[f.bahan_id] = 'Isi angka bulat.';
		else item.push({ bahan_id: f.bahan_id, qty: pack * f.isi + lepas });
	}
	return { item, galat };
}

/** Mengisi ulang formulir dari jumlah tersimpan (admin memeriksa ajuan kasir). */
export function teksDari(isian: Isian[], qty: ReadonlyMap<string, number>): TeksIsian {
	const hasil: TeksIsian = {};
	for (const f of isian) {
		const n = qty.get(f.bahan_id);
		if (n === undefined) hasil[f.bahan_id] = { a: '', b: '' };
		else if (f.jenis === 'satu') hasil[f.bahan_id] = { a: String(n).replace('.', ','), b: '' };
		else {
			const pack = Math.floor(n / f.isi);
			hasil[f.bahan_id] = { a: String(pack), b: String(Math.round((n - pack * f.isi) * 1000) / 1000) };
		}
	}
	return hasil;
}
