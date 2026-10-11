import { describe, expect, it } from 'vitest';
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import { saringOutlet, satuanDiOutlet } from './per-outlet.ts';

const bahan = (id: string): Bahan => ({ id, kode: id, nama: id, satuan: 'pcs', mode: 'otomatis', urutan: 1, aktif: true });
const satuan = (id: string): SatuanBeli => ({ id, kode: id, nama: id, ambang: null, harga_tetap: true, urutan: 1, aktif: true });
const isi = (sid: string, bid: string, qty: number): IsiSatuanBeli => ({ satuan_beli_id: sid, bahan_id: bid, qty });

const data = {
	bahan: [bahan('saus'), bahan('hot'), bahan('minyak')],
	satuan: [satuan('saus150'), satuan('saus25'), satuan('packHot')],
	isi: [isi('saus150', 'saus', 150), isi('saus25', 'saus', 25), isi('packHot', 'hot', 3)],
	outletSatuan: [
		{ satuan_beli_id: 'saus150', outlet_id: 'BL' },
		{ satuan_beli_id: 'packHot', outlet_id: 'BL' },
		{ satuan_beli_id: 'saus25', outlet_id: 'KP' }
	]
};

describe('satuan beli per outlet', () => {
	it('satuan tanpa baris outlet dipakai semua outlet', () => {
		expect(satuanDiOutlet('lain', 'KP', data.outletSatuan)).toBe(true);
		expect(satuanDiOutlet('saus150', 'KP', data.outletSatuan)).toBe(false);
	});

	it('Kertapati: saus isi 25 saja, tanpa ayam Hot; bahan tanpa satuan beli tetap tampil', () => {
		const kp = saringOutlet(data, 'KP');
		expect(kp.isi).toEqual([isi('saus25', 'saus', 25)]);
		expect(kp.bahan.map((b) => b.id)).toEqual(['saus', 'minyak']);
	});

	it('tanpa outlet atau tanpa peta: data utuh (salinan offline lama)', () => {
		expect(saringOutlet(data, null)).toBe(data);
		const lama = { bahan: data.bahan, satuan: data.satuan, isi: data.isi };
		expect(saringOutlet(lama, 'KP')).toBe(lama);
	});
});
