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
