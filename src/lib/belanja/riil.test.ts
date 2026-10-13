import { describe, expect, it } from 'vitest';
import { kelompokBagi, lembarRiil, susunRiil, type MasukRiil } from './riil.ts';

const nota = (outlet_id: string, item: [string, number, number][]): MasukRiil => ({
	id: outlet_id + item.length,
	outlet_id,
	tanggal: '2026-10-12',
	waktu: '2026-10-12T03:00:00Z',
	total: item.reduce((t, [, q, h]) => t + q * h, 0),
	catatan: null,
	item: item.map(([s, qty, harga]) => ({ satuan_beli_id: s, nama: `Pack ${s}`, qty, harga, subtotal: qty * harga }))
});

describe('belanja riil per outlet', () => {
	it('contoh owner: beli 10 pack ayam Ori untuk Kertapati → uang keluar Kertapati langsung terhitung', () => {
		const s = susunRiil(
			[nota('KP', [['ori', 10, 4321]]), nota('BL', [['ori', 2, 4000], ['saus', 3, 123]]), nota('BL', [['ori', 1, 4600]])],
			[{ outlet_id: 'KP', jumlah: 777, waktu: '', keterangan: 'cabai' }],
			['BL', 'TK', 'KP']
		);
		expect(s.masukOutlet).toEqual({ BL: 8000 + 369 + 4600, TK: 0, KP: 43210 });
		expect(s.lainOutlet).toEqual({ BL: 0, TK: 0, KP: 777 });
		expect(s.totalOutlet.KP).toBe(43987);
		expect(s.total).toBe(12969 + 43987);
		expect(s.jumlahNota).toEqual({ BL: 2, TK: 0, KP: 1 });
		const ori = s.barang.find((b) => b.satuan_beli_id === 'ori')!;
		expect(ori.per_outlet).toEqual({ KP: { qty: 10, rupiah: 43210 }, BL: { qty: 3, rupiah: 12600 } });
		expect(ori.qty).toBe(13);
		expect(ori.hargaRata).toBe(Math.round(55810 / 13));
		expect(s.barang[0].satuan_beli_id).toBe('ori'); // urut dari rupiah terbesar
	});

	it('saringan outlet & lembar Excel', () => {
		const s = susunRiil([nota('KP', [['ori', 1, 4321]]), nota('BL', [['ori', 1, 1234]])], [], ['KP']);
		expect(s.total).toBe(4321);
		const [l] = lembarRiil(s, [{ id: 'KP', nama: 'Kertapati' }]);
		expect(l.baris.at(-1)).toEqual(['Jumlah', null, null, 4321, null, 4321]);
		expect(l.baris.at(-2)).toEqual(['Pengeluaran lainnya (dibagi rata)', null, null, 0, null, 0]);
	});

	it('pengeluaran lainnya dibagi rata dikelompokkan per catatan dan masuk uang keluar tiap outlet', () => {
		const baris = (outlet_id: string, jumlah: number) => ({ outlet_id, jumlah, waktu: '2026-10-12T05:00:00Z', keterangan: 'Iklan', bagi_id: 'b1', kategori: { nama: 'Lain-lain admin' } });
		const bagi = kelompokBagi([baris('BL', 4115), baris('TK', 4115), baris('KP', 4115)]);
		expect(bagi).toEqual([{ bagi_id: 'b1', waktu: '2026-10-12T05:00:00Z', keterangan: 'Iklan', kategori: 'Lain-lain admin', total: 12345, per_outlet: { BL: 4115, TK: 4115, KP: 4115 } }]);
		const s = susunRiil([nota('KP', [['ori', 1, 4321]])], [], ['BL', 'TK', 'KP'], bagi);
		expect(s.bagiOutlet).toEqual({ BL: 4115, TK: 4115, KP: 4115 });
		expect(s.totalOutlet).toEqual({ BL: 4115, TK: 4115, KP: 4321 + 4115 });
		expect(s.total).toBe(4321 + 12345);
	});
});
