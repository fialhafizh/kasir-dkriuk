import { describe, expect, it } from 'vitest';
import { kunciSel, lembarBelanja, namaBarang, ringkas, teksBelanja, type Rencana } from './belanja';

const r: Rencana = {
	hari: 7,
	outlet: [
		{ id: 'bl', nama: 'Bukit Lama', kode: 'BL' },
		{ id: 'tk', nama: 'Talang Kerangga', kode: 'TK' }
	],
	barang: [
		{
			satuan_beli_id: 'ori',
			nama: 'Pack Ayam Ori (1 kg)',
			per_outlet: { bl: { stok: 10, pakai_hari: 11.43, dari_beli: false, harga: 4321, saran: 70 }, tk: { stok: 2, pakai_hari: 2, dari_beli: false, harga: 4321, saran: 12 } }
		},
		{ satuan_beli_id: 'kulit', nama: 'Pack Kulit Mentah', per_outlet: { bl: { stok: 0, pakai_hari: 0.5, dari_beli: false, harga: null, saran: 4 }, tk: { stok: 3, pakai_hari: 0, dari_beli: false, harga: null, saran: 0 } } },
		{ satuan_beli_id: 'box', nama: "Pack Box D'Kriuk", per_outlet: { bl: { stok: 5, pakai_hari: 0, dari_beli: false, harga: 1234, saran: 0 }, tk: { stok: 5, pakai_hari: 0, dari_beli: false, harga: 1234, saran: 0 } } }
	]
};
const SEL_14 = new Date('2026-10-14T03:00:00Z');

describe('rencana belanja', () => {
	it('nama ringkas', () => {
		expect(namaBarang('Pack Ayam Ori (1 kg)')).toBe('Ayam Ori');
		expect(namaBarang('Karung Tepung A (25 kg)')).toBe('Tepung A');
	});
	it('total per barang & nilai; isian admin menggantikan saran', () => {
		const s = ringkas(r, { [kunciSel('ori', 'tk')]: 10 });
		expect(s.barang[0]).toMatchObject({ nama: 'Ayam Ori', total: 80, harga: 4321, nilai: 80 * 4321 });
		expect(s.totalNilai).toBe(80 * 4321);
		expect(s.adaTanpaHarga).toBe(true);
	});
	it('teks WA hanya barang yang dipesan, pembagian per outlet & total', () => {
		expect(teksBelanja(ringkas(r, {}), SEL_14)).toBe(
			['Belanja stokis — Rab 14/10/2026', 'Ayam Ori: 82 (BL 70 · TK 12)', 'Kulit Mentah: 4 (BL 4)', `Total: Rp${(82 * 4321).toLocaleString('id-ID')} (sebagian barang belum ada harganya)`].join('\n')
		);
	});
	it('lembar Excel: kolom outlet & baris jumlah', () => {
		const l = lembarBelanja(r, ringkas(r, {}));
		expect(l.kolom).toEqual(['Barang', 'Total pesanan', 'Bukit Lama', 'Talang Kerangga', 'Harga satuan', 'Harga total']);
		expect(l.baris[0]).toEqual(['Ayam Ori', 82, 70, 12, 4321, 82 * 4321]);
		expect(l.baris.at(-1)).toEqual(['Jumlah', null, null, null, null, 82 * 4321]);
	});
});
