import { describe, expect, it } from 'vitest';
import type { Bahan, Menu, Resep } from '#lib/master/types.ts';
import { bentukSisa, kumpulkanSisa } from './sisa';

const b = (id: string, nama: string, satuan: string, urutan: number): Bahan => ({ id, kode: id, nama, satuan, mode: 'otomatis', urutan, aktif: true });
const m = (id: string, nama: string, kategori: Menu['kategori'], varian: Menu['varian'] = null): Menu => ({ id, kode: id, nama, kategori, varian, urutan: 0, aktif: true });
const bahan = [b('dada', 'Dada Ori', 'potong', 10), b('sayap_hot', 'Sayap Hot', 'potong', 23), b('kulit', 'Kulit Mentah', 'porsi', 30), b('cup', 'Cup Kulit', 'pcs', 31), b('beras', 'Beras', 'kg', 40), b('kertas', 'Kertas Nasi', 'lembar', 41)];
const menu = [m('m_dada', 'Dada Ori', 'ayam', 'ori'), m('m_sayap', 'Sayap Hot', 'ayam', 'hot'), m('m_kulit', 'Kulit Krispy', 'kulit'), m('m_nasi', 'Nasi', 'nasi'), m('m_box', 'Box', 'box')];
const resep: Resep[] = [
	{ menu_id: 'm_dada', bahan_id: 'dada', qty: 1 },
	{ menu_id: 'm_sayap', bahan_id: 'sayap_hot', qty: 1 },
	{ menu_id: 'm_kulit', bahan_id: 'kulit', qty: 1 },
	{ menu_id: 'm_kulit', bahan_id: 'cup', qty: 1 },
	{ menu_id: 'm_nasi', bahan_id: 'beras', qty: 0.1 },
	{ menu_id: 'm_nasi', bahan_id: 'kertas', qty: 1 }
];

describe('bentukSisa', () => {
	it('ayam per potongan, kulit (tanpa cup), nasi → beras saja (tanpa kertas)', () => {
		expect(bentukSisa(bahan, menu, resep)).toEqual([
			{ kunci: 'dada', label: 'Dada Ori', satuan: 'potong', ke: [{ bahan_id: 'dada', faktor: 1 }] },
			{ kunci: 'sayap_hot', label: 'Sayap Hot', satuan: 'potong', ke: [{ bahan_id: 'sayap_hot', faktor: 1 }] },
			{ kunci: 'kulit', label: 'Kulit', satuan: 'porsi', ke: [{ bahan_id: 'kulit', faktor: 1 }] },
			{ kunci: 'nasi', label: 'Nasi', satuan: 'porsi', ke: [{ bahan_id: 'beras', faktor: 0.1 }] }
		]);
	});
});

describe('kumpulkanSisa', () => {
	const f = bentukSisa(bahan, menu, resep);
	it('kosong dilewati; nasi porsi → kg beras', () => {
		expect(kumpulkanSisa(f, { dada: '2', nasi: '3', kulit: '' })).toEqual({
			item: [
				{ bahan_id: 'dada', qty: 2 },
				{ bahan_id: 'beras', qty: 0.3 }
			],
			galat: {}
		});
	});
	it('bukan bilangan bulat → galat', () => {
		expect(kumpulkanSisa(f, { dada: '1,5' }).galat).toHaveProperty('dada');
	});
});
