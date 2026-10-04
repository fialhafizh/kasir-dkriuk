import { describe, expect, it } from 'vitest';
import { formatAngka, formatQty, formatRupiah, parseQty, parseRupiah } from './rupiah';

describe('Rupiah', () => {
	it('format dengan titik ribuan', () => {
		expect(formatAngka(11000)).toBe('11.000');
		expect(formatAngka(33333)).toBe('33.333');
		expect(formatAngka(0)).toBe('0');
		expect(formatRupiah(9000)).toBe('Rp9.000');
	});

	it('parse format yang biasa diketik admin', () => {
		expect(parseRupiah('11.000')).toBe(11000);
		expect(parseRupiah('11000')).toBe(11000);
		expect(parseRupiah('Rp 11.000')).toBe(11000);
		expect(parseRupiah(' rp11.000 ')).toBe(11000);
		expect(parseRupiah('0')).toBe(0);
	});

	it('menolak yang bukan Rupiah bulat sah', () => {
		expect(parseRupiah('')).toBeNull();
		expect(parseRupiah('11rb')).toBeNull();
		expect(parseRupiah('-5')).toBeNull();
		expect(parseRupiah('11,5')).toBeNull();
		expect(parseRupiah('1.2.3a')).toBeNull();
		expect(parseRupiah('100.000.001')).toBeNull();
	});
});

describe('jumlah (qty)', () => {
	it('format desimal dengan koma, tanpa nol berlebih', () => {
		expect(formatQty(1.3)).toBe('1,3');
		expect(formatQty(17)).toBe('17');
		expect(formatQty(0.1)).toBe('0,1');
		expect(formatQty(19.5)).toBe('19,5');
	});

	it('parse koma atau titik desimal', () => {
		expect(parseQty('0,1')).toBe(0.1);
		expect(parseQty('1.3')).toBe(1.3);
		expect(parseQty('17')).toBe(17);
	});

	it('menolak nol, negatif, teks, dan lebih dari 4 desimal', () => {
		expect(parseQty('0')).toBeNull();
		expect(parseQty('-1')).toBeNull();
		expect(parseQty('abc')).toBeNull();
		expect(parseQty('0,00001')).toBeNull();
		expect(parseQty('')).toBeNull();
	});
});

describe('review Tugas 3: angka yang bisa salah diam-diam', () => {
	it('"1.000" pada jumlah ambigu (titik = ribuan di Indonesia) → ditolak', () => {
		expect(parseQty('1.000')).toBeNull();
		expect(parseQty('12.500')).toBeNull();
		expect(parseQty('1,000')).toBe(1);
	});
	it('jumlah desimal dibatasi sesuai kolom database', () => {
		expect(parseQty('0,0833', 3)).toBeNull();
		expect(parseQty('0,083', 3)).toBe(0.083);
		expect(parseQty('2,555', 2)).toBeNull();
		expect(parseQty('2,5', 2)).toBe(2.5);
	});
	it('awalan "Rp." juga diterima', () => {
		expect(parseRupiah('Rp. 11.000')).toBe(11000);
		expect(parseRupiah('Rp.11.000')).toBe(11000);
	});
	it('batas maksimal bisa diatur (harga jual ≤ 10 juta)', () => {
		expect(parseRupiah('10.000.001', 10_000_000)).toBeNull();
		expect(parseRupiah('10.000.000', 10_000_000)).toBe(10_000_000);
	});
});
