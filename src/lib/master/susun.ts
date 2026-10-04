import type { Bahan } from './types.ts';
import { formatQty } from './rupiah.ts';

export function kunciHarga(outletId: string, id: string): string {
	return `${outletId}:${id}`;
}

export function petaHarga<T extends { outlet_id: string; harga: number }>(baris: T[], idDari: (b: T) => string): Map<string, number> {
	return new Map(baris.map((b) => [kunciHarga(b.outlet_id, idDari(b)), b.harga]));
}

export function teksIsi(
	isi: { bahan_id: string; qty: number }[],
	bahan: (Pick<Bahan, 'id' | 'nama' | 'satuan'> & Partial<Pick<Bahan, 'aktif' | 'mode'>>)[]
): string {
	if (isi.length === 0) return '—';
	const peta = new Map(bahan.map((b) => [b.id, b]));
	return isi
		.map((i) => {
			const b = peta.get(i.bahan_id);
			if (!b) return `${formatQty(i.qty)} (bahan tidak dikenal)`;
			const ganti = b.aktif === false || (b.mode !== undefined && b.mode !== 'otomatis');
			return `${formatQty(i.qty)} ${b.satuan} ${b.nama}${ganti ? ' (ganti)' : ''}`;
		})
		.join(' · ');
}

/** Nama menu yang resepnya memakai bahan tertentu (untuk peringatan sebelum bahan dinonaktifkan). */
export function menuPemakai(
	bahanId: string,
	resep: { menu_id: string; bahan_id: string }[],
	menu: { id: string; nama: string; urutan: number }[]
): string[] {
	const ids = new Set(resep.filter((r) => r.bahan_id === bahanId).map((r) => r.menu_id));
	return menu
		.filter((m) => ids.has(m.id))
		.sort((a, b) => a.urutan - b.urutan)
		.map((m) => m.nama);
}
