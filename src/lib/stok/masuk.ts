// Validasi formulir barang masuk sebelum dikirim (server memeriksa lagi).
import { formatAngka, parseQty, parseRupiah } from '#lib/master/rupiah.ts';
import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
import type { KirimBarangMasuk } from './types.ts';

export interface BarisMasuk {
	satuan_beli_id: string;
	qty: string;
	harga: string;
}

export function hargaOutlet(satuanId: string, hargaBeli: HargaBeli[], outletId: string): number | null {
	return hargaBeli.find((h) => h.outlet_id === outletId && h.satuan_beli_id === satuanId)?.harga ?? null;
}

/** Harga tetap: diisi dari harga outlet. Harga berubah-ubah: kosong (wajib diketik tiap beli). */
export function hargaAwal(s: SatuanBeli, hargaBeli: HargaBeli[], outletId: string): string {
	const h = hargaOutlet(s.id, hargaBeli, outletId);
	return s.harga_tetap && h !== null ? formatAngka(h) : '';
}

export function periksaBarangMasuk(
	baris: BarisMasuk[],
	satuan: SatuanBeli[]
): { item: KirimBarangMasuk['item']; galat: string[]; total: number } {
	const item: KirimBarangMasuk['item'] = [];
	const galat = baris.map(() => '');
	const hitung = new Map<string, number>();
	for (const r of baris) hitung.set(r.satuan_beli_id, (hitung.get(r.satuan_beli_id) ?? 0) + 1);
	let total = 0;
	baris.forEach((r, i) => {
		const s = satuan.find((x) => x.id === r.satuan_beli_id);
		const qty = parseQty(r.qty, 3);
		const harga = r.harga.trim() === '' ? null : parseRupiah(r.harga);
		if (!s) galat[i] = 'Pilih barang.';
		else if ((hitung.get(r.satuan_beli_id) ?? 0) > 1) galat[i] = 'Barang ini sudah ada di baris lain; gabungkan jumlahnya.';
		else if (qty === null) galat[i] = 'Jumlah tidak sah (mis. 2 atau 1,5).';
		else if (!s.harga_tetap && (harga === null || harga === 0)) galat[i] = 'Harga wajib diisi (harganya berubah-ubah).';
		else if (harga === null) galat[i] = 'Harga tidak sah (mis. 40.000).';
		else {
			item.push({ satuan_beli_id: s.id, qty, harga });
			total += Math.round(qty * harga);
		}
	});
	return { item, galat, total };
}
