import { describe, expect, it } from 'vitest';
import { jumlahItem, tambah, tambahNasiBox, totalKeranjang, ubahQty } from './keranjang';
import type { MenuJual } from './types';

const m = (kode: string, harga: number): MenuJual => ({ id: kode, kode, nama: kode, kategori: 'ayam', varian: 'ori', urutan: 0, harga });
const dada = m('dada', 11000);
const nasi = { ...m('nasi', 5000), kategori: 'nasi' as const, varian: null };
const box = { ...m('box', 1000), kategori: 'box' as const, varian: null };

describe('keranjang', () => {
	it('tambah menggabungkan menu yang sama', () => {
		const k = tambah(tambah([], dada), dada);
		expect(k).toEqual([{ menu_id: 'dada', nama: 'dada', harga: 11000, qty: 2 }]);
	});
	it('tidak mengubah keranjang lama (immutable)', () => {
		const a = tambah([], dada);
		tambah(a, dada);
		expect(a[0].qty).toBe(1);
	});
	it('ubahQty: 0 menghapus, dibatasi 999', () => {
		const k = tambah([], dada);
		expect(ubahQty(k, 'dada', 0)).toEqual([]);
		expect(ubahQty(k, 'dada', 5000)[0].qty).toBe(999);
	});
	it('Nasi Box menambah nasi dan box', () => {
		const k = tambahNasiBox(tambah([], dada), nasi, box);
		expect(k.map((b) => [b.menu_id, b.qty])).toEqual([
			['dada', 1],
			['nasi', 1],
			['box', 1]
		]);
	});
	it('total & jumlah item', () => {
		const k = tambahNasiBox(tambah(tambah([], dada), dada), nasi, box);
		expect(totalKeranjang(k)).toBe(28000);
		expect(jumlahItem(k)).toBe(4);
	});
});

describe('review Tugas 4: jumlah selalu bilangan bulat 1..999', () => {
	it('ubahQty pecahan/NaN', () => {
		const k = tambah([], dada);
		expect(ubahQty(k, 'dada', 0.5)).toEqual([]);
		expect(ubahQty(k, 'dada', Number.NaN)).toEqual([]);
		expect(ubahQty(k, 'dada', 2.7)[0].qty).toBe(2);
	});
	it('tambah dengan n tidak sah tidak menambah baris', () => {
		expect(tambah([], dada, 0)).toEqual([]);
		expect(tambah([], dada, -3)).toEqual([]);
	});
});

import { parseJumlah } from './keranjang';

describe('parseJumlah (kotak jumlah keranjang)', () => {
	it.each([
		['150', 150],
		[' 7 ', 7],
		['5000', 999],
		['1', 1]
	])('"%s" → %s', (t, n) => expect(parseJumlah(t)).toBe(n));
	it.each(['', '0', '00', '1,5', '-3', 'abc', '2.000'])('"%s" → null (baris tidak boleh terhapus)', (t) =>
		expect(parseJumlah(t)).toBeNull()
	);
});
