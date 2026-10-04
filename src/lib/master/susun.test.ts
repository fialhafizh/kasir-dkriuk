import { describe, expect, it } from 'vitest';
import { kunciHarga, petaHarga, teksIsi } from './susun';

describe('petaHarga', () => {
	it('mengelompokkan harga per outlet & item', () => {
		const peta = petaHarga(
			[
				{ outlet_id: 'o1', menu_id: 'm1', harga: 11000 },
				{ outlet_id: 'o2', menu_id: 'm1', harga: 10000 }
			],
			(b) => b.menu_id
		);
		expect(peta.get(kunciHarga('o1', 'm1'))).toBe(11000);
		expect(peta.get(kunciHarga('o2', 'm1'))).toBe(10000);
		expect(peta.get(kunciHarga('o3', 'm1'))).toBeUndefined();
	});
});

describe('teksIsi', () => {
	const bahan = [
		{ id: 'b1', nama: 'Dada Ori', satuan: 'potong' },
		{ id: 'b2', nama: 'Beras', satuan: 'kg' },
		{ id: 'b3', nama: 'Kertas Nasi', satuan: 'lembar' }
	];
	it('menuliskan isi dengan jumlah, satuan, dan nama, urut sesuai masukan', () => {
		expect(
			teksIsi(
				[
					{ bahan_id: 'b2', qty: 0.1 },
					{ bahan_id: 'b3', qty: 1 }
				],
				bahan
			)
		).toBe('0,1 kg Beras · 1 lembar Kertas Nasi');
	});
	it('bahan yang tidak dikenal ditandai, bukan dibuang diam-diam', () => {
		expect(teksIsi([{ bahan_id: 'x', qty: 2 }], bahan)).toBe('2 (bahan tidak dikenal)');
	});
	it('kosong', () => {
		expect(teksIsi([], bahan)).toBe('—');
	});
});

import { menuPemakai } from './susun';

describe('menuPemakai', () => {
	it('nama menu yang resepnya memakai bahan itu, urut sesuai menu', () => {
		const menu = [
			{ id: 'm1', nama: 'Nasi', urutan: 40 },
			{ id: 'm2', nama: 'Kulit Krispy', urutan: 30 }
		];
		const resep = [
			{ menu_id: 'm1', bahan_id: 'kertas', qty: 1 },
			{ menu_id: 'm2', bahan_id: 'kertas', qty: 1 },
			{ menu_id: 'm1', bahan_id: 'beras', qty: 0.1 }
		];
		expect(menuPemakai('kertas', resep, menu)).toEqual(['Kulit Krispy', 'Nasi']);
		expect(menuPemakai('tepung', resep, menu)).toEqual([]);
	});
});

describe('review Tugas 7: ringkasan resep menandai bahan yang harus diganti', () => {
	it('bahan nonaktif atau tidak otomatis diberi tanda (ganti)', () => {
		const b = [
			{ id: 'a', nama: 'Beras', satuan: 'kg', aktif: false, mode: 'otomatis' as const },
			{ id: 't', nama: 'Tepung A', satuan: 'kg', aktif: true, mode: 'analisis' as const }
		];
		expect(teksIsi([{ bahan_id: 'a', qty: 0.1 }, { bahan_id: 't', qty: 1 }], b)).toBe('0,1 kg Beras (ganti) · 1 kg Tepung A (ganti)');
	});
});
