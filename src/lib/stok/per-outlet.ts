// Satuan beli per outlet (migrasi 0037): Kertapati memakai pack berbeda dan tidak menjual ayam Hot & kulit.
// Satuan beli tanpa baris outlet dipakai semua outlet.
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import { bentukIsian } from './isian.ts';
import { susunStok } from './tampil.ts';

export interface SatuanOutlet {
	satuan_beli_id: string;
	outlet_id: string;
}

export function satuanDiOutlet(sid: string, outletId: string, peta: readonly SatuanOutlet[]): boolean {
	const baris = peta.filter((x) => x.satuan_beli_id === sid);
	return baris.length === 0 || baris.some((x) => x.outlet_id === outletId);
}

/** Saring bahan, satuan beli, dan isi untuk satu outlet. Bahan tanpa satuan beli aktif tetap tampil. */
export function saringOutlet<T extends { bahan: Bahan[]; satuan: SatuanBeli[]; isi: IsiSatuanBeli[]; outletSatuan?: SatuanOutlet[] }>(
	d: T,
	outletId: string | null | undefined
): T {
	const peta = d.outletSatuan ?? [];
	if (!outletId || peta.length === 0) return d;
	const aktif = new Set(d.satuan.filter((s) => s.aktif).map((s) => s.id));
	const satuan = d.satuan.filter((s) => satuanDiOutlet(s.id, outletId, peta));
	const dipakai = new Set(satuan.map((s) => s.id));
	const isi = d.isi.filter((x) => dipakai.has(x.satuan_beli_id));
	const adaSatuan = new Set(d.isi.filter((x) => aktif.has(x.satuan_beli_id)).map((x) => x.bahan_id));
	const diOutlet = new Set(isi.filter((x) => aktif.has(x.satuan_beli_id)).map((x) => x.bahan_id));
	const bahan = d.bahan.filter((b) => !adaSatuan.has(b.id) || diOutlet.has(b.id));
	return { ...d, bahan, satuan, isi };
}

type DataSaring = { bahan: Bahan[]; satuan: SatuanBeli[]; isi: IsiSatuanBeli[] };
export const bentukIsianOutlet = (d: DataSaring) => bentukIsian(d.bahan, d.satuan, d.isi);
export const susunStokOutlet = (d: DataSaring, stok: ReadonlyMap<string, number>) => susunStok(d.bahan, d.satuan, d.isi, stok);
