import { describe, expect, it } from 'vitest';
import { kembalian, labelMetode, METODE, tombolCepat } from './bayar';

describe('bayar', () => {
	it('lima metode sesuai spesifikasi', () => {
		expect(METODE.map((m) => m.kode)).toEqual(['cash', 'qris', 'gofood', 'grabfood', 'shopeefood']);
		expect(labelMetode('shopeefood')).toBe('ShopeeFood');
	});
	it('kembalian; uang kurang → null', () => {
		expect(kembalian(40000, 50000)).toBe(10000);
		expect(kembalian(40000, 40000)).toBe(0);
		expect(kembalian(40000, 39000)).toBeNull();
	});
	it('tombol cepat: uang pas lalu pecahan wajar di atasnya, tanpa duplikat', () => {
		expect(tombolCepat(40000)).toEqual([40000, 50000, 100000]);
		expect(tombolCepat(17000)).toEqual([17000, 20000, 50000, 100000]);
		expect(tombolCepat(9000)).toEqual([9000, 10000, 20000, 50000]);
		expect(tombolCepat(0)).toEqual([0]);
	});
});

describe('review Tugas 4: tombol cepat di atas 100 ribu', () => {
	it('pecahan 50rb/100rb, termasuk 200rb', () => {
		expect(tombolCepat(101000)).toEqual([101000, 150000, 200000]);
		expect(tombolCepat(250000)).toEqual([250000, 300000]);
		expect(tombolCepat(99000)).toEqual([99000, 100000]);
	});
});
