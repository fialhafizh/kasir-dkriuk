import { describe, expect, it } from 'vitest';
import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
import { hargaAwal, hargaOutlet, periksaBarangMasuk } from './masuk';

const s = (id: string, harga_tetap = true): SatuanBeli => ({ id, kode: id, nama: id, ambang: null, harga_tetap, urutan: 0, aktif: true });
const satuan = [s('ayam'), s('beras', false)];
const harga: HargaBeli[] = [
	{ outlet_id: 'bl', satuan_beli_id: 'ayam', harga: 40000, diubah_at: '' },
	{ outlet_id: 'bl', satuan_beli_id: 'beras', harga: 15000, diubah_at: '' }
];

describe('periksaBarangMasuk', () => {
	it('baris sah → item angka & total dibulatkan', () => {
		const r = periksaBarangMasuk(
			[
				{ satuan_beli_id: 'ayam', qty: '2', harga: '40.000' },
				{ satuan_beli_id: 'beras', qty: '1,5', harga: '15001' }
			],
			satuan
		);
		expect(r.galat).toEqual(['', '']);
		expect(r.item).toEqual([
			{ satuan_beli_id: 'ayam', qty: 2, harga: 40000 },
			{ satuan_beli_id: 'beras', qty: 1.5, harga: 15001 }
		]);
		expect(r.total).toBe(80000 + 22502);
	});
	it('galat per baris: jumlah salah, harga berubah-ubah 0/kosong, harga bukan angka', () => {
		expect(periksaBarangMasuk([{ satuan_beli_id: 'ayam', qty: '0', harga: '1' }], satuan).galat[0]).toMatch(/Jumlah/);
		expect(periksaBarangMasuk([{ satuan_beli_id: 'beras', qty: '1', harga: '0' }], satuan).galat[0]).toMatch(/wajib/);
		expect(periksaBarangMasuk([{ satuan_beli_id: 'beras', qty: '1', harga: '' }], satuan).galat[0]).toMatch(/wajib/);
		expect(periksaBarangMasuk([{ satuan_beli_id: 'ayam', qty: '1', harga: 'abc' }], satuan).galat[0]).toMatch(/Harga tidak sah/);
	});
	it('barang ganda: kedua baris ditandai, tidak ada item terkirim', () => {
		const r = periksaBarangMasuk(
			[
				{ satuan_beli_id: 'ayam', qty: '1', harga: '1' },
				{ satuan_beli_id: 'ayam', qty: '2', harga: '1' }
			],
			satuan
		);
		expect(r.galat.every((g) => /sudah ada/.test(g))).toBe(true);
		expect(r.item).toEqual([]);
	});
});

describe('harga awal', () => {
	it('harga tetap terisi dari harga outlet; harga berubah-ubah dikosongkan (acuan saja)', () => {
		expect(hargaAwal(satuan[0], harga, 'bl')).toBe('40.000');
		expect(hargaAwal(satuan[1], harga, 'bl')).toBe('');
		expect(hargaAwal(satuan[0], harga, 'kp')).toBe('');
		expect(hargaOutlet('beras', harga, 'bl')).toBe(15000);
		expect(hargaOutlet('beras', harga, 'kp')).toBeNull();
	});
});
