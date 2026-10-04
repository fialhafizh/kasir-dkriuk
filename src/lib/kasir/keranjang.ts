import type { BarisKeranjang, MenuJual } from './types.ts';

const MAKS = 999;

export function tambah(k: BarisKeranjang[], m: MenuJual, n = 1): BarisKeranjang[] {
	const ada = k.find((b) => b.menu_id === m.id);
	if (!ada) return [...k, { menu_id: m.id, nama: m.nama, harga: m.harga, qty: Math.min(n, MAKS) }];
	return k.map((b) => (b.menu_id === m.id ? { ...b, qty: Math.min(b.qty + n, MAKS) } : b));
}

export function ubahQty(k: BarisKeranjang[], menuId: string, qty: number): BarisKeranjang[] {
	if (qty <= 0) return k.filter((b) => b.menu_id !== menuId);
	return k.map((b) => (b.menu_id === menuId ? { ...b, qty: Math.min(Math.floor(qty), MAKS) } : b));
}

/** Pintasan "Nasi Box": nasi + box sekaligus (ayamnya dipilih terpisah). */
export function tambahNasiBox(k: BarisKeranjang[], nasi: MenuJual, box: MenuJual): BarisKeranjang[] {
	return tambah(tambah(k, nasi), box);
}

export function totalKeranjang(k: BarisKeranjang[]): number {
	return k.reduce((t, b) => t + b.harga * b.qty, 0);
}

export function jumlahItem(k: BarisKeranjang[]): number {
	return k.reduce((t, b) => t + b.qty, 0);
}
