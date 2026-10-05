import { describe, expect, it } from 'vitest';
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import { bentukIsian, kumpulkanIsian, parseHitung, teksDari } from './isian';

const b = (id: string, satuan: string, urutan: number): Bahan => ({ id, kode: id, nama: id.toUpperCase(), satuan, mode: 'otomatis', urutan, aktif: true });
const s = (id: string): SatuanBeli => ({ id, kode: id, nama: id, ambang: null, harga_tetap: true, urutan: 0, aktif: true });
const bahan = [b('dada', 'potong', 1), b('sayap', 'potong', 2), b('kemasan', 'pcs', 3), b('beras', 'kg', 4), b('cup', 'pcs', 5)];
const satuan = [s('pack_ori'), s('pack_kemasan'), s('beras_kg')];
const isi: IsiSatuanBeli[] = [
	{ satuan_beli_id: 'pack_ori', bahan_id: 'dada', qty: 3 },
	{ satuan_beli_id: 'pack_ori', bahan_id: 'sayap', qty: 2 },
	{ satuan_beli_id: 'pack_kemasan', bahan_id: 'kemasan', qty: 100 },
	{ satuan_beli_id: 'beras_kg', bahan_id: 'beras', qty: 1 }
];

describe('bentukIsian', () => {
	it('ayam per potong, pack satu-bahan = pack + lepas, kg desimal, tanpa satuan beli = satu kotak', () => {
		expect(bentukIsian(bahan, satuan, isi)).toEqual([
			{ bahan_id: 'dada', label: 'DADA', jenis: 'satu', satuan: 'potong', desimal: false },
			{ bahan_id: 'sayap', label: 'SAYAP', jenis: 'satu', satuan: 'potong', desimal: false },
			{ bahan_id: 'kemasan', label: 'KEMASAN', jenis: 'pack', satuan: 'pcs', isi: 100 },
			{ bahan_id: 'beras', label: 'BERAS', jenis: 'satu', satuan: 'kg', desimal: true },
			{ bahan_id: 'cup', label: 'CUP', jenis: 'satu', satuan: 'pcs', desimal: false }
		]);
	});
});

describe('parseHitung', () => {
	it.each([
		['0', false, 0],
		['12', false, 12],
		['12,5', true, 12.5],
		['0.25', true, 0.25]
	])('"%s" (desimal %s) → %s', (t, d, n) => expect(parseHitung(t, d)).toBe(n));
	it.each([
		['', false],
		['1,5', false],
		['-1', false],
		['1.000', true],
		['abc', true],
		['2000000', false]
	])('"%s" (desimal %s) → null', (t, d) => expect(parseHitung(t, d)).toBeNull());
});

describe('kumpulkanIsian & teksDari', () => {
	const f = bentukIsian(bahan, satuan, isi);
	it('pack + lepas dikonversi ke satuan dasar; kotak lepas kosong = 0', () => {
		const h = kumpulkanIsian(f, {
			dada: { a: '10', b: '' },
			sayap: { a: '0', b: '' },
			kemasan: { a: '3', b: '' },
			beras: { a: '7,5', b: '' },
			cup: { a: '40', b: '' }
		});
		expect(h.galat).toEqual({});
		expect(h.item).toEqual([
			{ bahan_id: 'dada', qty: 10 },
			{ bahan_id: 'sayap', qty: 0 },
			{ bahan_id: 'kemasan', qty: 300 },
			{ bahan_id: 'beras', qty: 7.5 },
			{ bahan_id: 'cup', qty: 40 }
		]);
	});
	it('kotak kosong dan isian salah diberi galat per bahan', () => {
		const h = kumpulkanIsian(f, {
			dada: { a: '', b: '' },
			sayap: { a: '1,5', b: '' },
			kemasan: { a: '', b: '' },
			beras: { a: '1', b: '' },
			cup: { a: '1', b: '' }
		});
		expect(Object.keys(h.galat).sort()).toEqual(['dada', 'kemasan', 'sayap']);
	});
	it('teksDari mengisi ulang formulir dari jumlah tersimpan', () => {
		const t = teksDari(f, new Map([
			['kemasan', 340],
			['beras', 7.5],
			['dada', 9]
		]));
		expect(t.kemasan).toEqual({ a: '3', b: '40' });
		expect(t.beras).toEqual({ a: '7,5', b: '' });
		expect(t.dada).toEqual({ a: '9', b: '' });
		expect(t.cup).toEqual({ a: '', b: '' });
	});
});

import { kumpulkanIsianOpsional } from './isian';

describe('kumpulkanIsianOpsional (rusak, transfer)', () => {
	const f = bentukIsian(bahan, satuan, isi);
	it('kotak kosong & 0 dilewati; pack + lepas dikonversi', () => {
		expect(kumpulkanIsianOpsional(f, { dada: { a: '3', b: '' }, kemasan: { a: '1', b: '20' }, beras: { a: '0', b: '' } })).toEqual({
			item: [
				{ bahan_id: 'dada', qty: 3 },
				{ bahan_id: 'kemasan', qty: 120 }
			],
			galat: {}
		});
	});
	it('isian salah tetap diberi galat', () => {
		expect(kumpulkanIsianOpsional(f, { dada: { a: '1,5', b: '' } }).galat).toHaveProperty('dada');
	});
});
