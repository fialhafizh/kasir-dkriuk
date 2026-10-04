import { describe, expect, it } from 'vitest';
import { dataStrukDari } from './cetak';

describe('dataStrukDari', () => {
	it('menyusun data struk dari hasil server (total & nomor dari server, bukan keranjang)', () => {
		const d = dataStrukDari({
			outlet: { id: 'o', kode: 'BL', nama: 'Bukit Lama', merek: "D'Kriuk", alamat: 'Jl. X', telepon: '+62 1', aktif: true },
			kasir: 'Kasir BL',
			hasil: { id: 'p', nomor: 'BL-261005-001', total: 16000, kembalian: 4000, waktu: '2026-10-05T05:00:00Z', ulang: false },
			keranjang: [
				{ menu_id: 'a', nama: 'Dada Ori', harga: 11000, qty: 1 },
				{ menu_id: 'b', nama: 'Nasi', harga: 5000, qty: 1 }
			],
			metode: 'cash',
			diterima: 20000
		});
		expect(d).toMatchObject({ nomor: 'BL-261005-001', total: 16000, kembalian: 4000, diterima: 20000, kasir: 'Kasir BL' });
		expect(d.item).toEqual([
			{ nama: 'Dada Ori', harga: 11000, qty: 1 },
			{ nama: 'Nasi', harga: 5000, qty: 1 }
		]);
		expect(d.outlet).toEqual({ merek: "D'Kriuk", nama: 'Bukit Lama', alamat: 'Jl. X', telepon: '+62 1' });
	});
	it('non-cash tidak membawa uang diterima', () => {
		const d = dataStrukDari({
			outlet: { id: 'o', kode: 'BL', nama: 'B', merek: 'M', alamat: 'A', telepon: 'T', aktif: true },
			kasir: 'K',
			hasil: { id: 'p', nomor: 'N', total: 5000, kembalian: null, waktu: '2026-10-05T05:00:00Z', ulang: false },
			keranjang: [{ menu_id: 'b', nama: 'Nasi', harga: 5000, qty: 1 }],
			metode: 'qris',
			diterima: 50000
		});
		expect(d.diterima).toBeNull();
		expect(d.kembalian).toBeNull();
	});
});
