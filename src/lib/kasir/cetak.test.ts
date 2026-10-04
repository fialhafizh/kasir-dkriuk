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

import { dataStrukRiwayat, sidikTransaksi } from './cetak';

describe('review Tugas 8: struk dari data server & sidik transaksi', () => {
	const outlet = { id: 'o', kode: 'BL', nama: 'Bukit Lama', merek: "D'Kriuk", alamat: 'Jl. X', telepon: '+62 1', aktif: true };
	it('struk dari penjualan tersimpan (bukan keranjang)', () => {
		const d = dataStrukRiwayat(outlet, 'Kasir BL', {
			id: 'p',
			nomor: 'BL-261005-001',
			waktu: '2026-10-05T05:00:00Z',
			metode: 'cash',
			total: 11000,
			diterima: 20000,
			kembalian: 9000,
			void_at: '2026-10-05T06:00:00Z',
			void_alasan: 'x',
			item: [{ nama: 'Dada Ori', harga: 11000, qty: 1 }]
		});
		expect(d).toMatchObject({ nomor: 'BL-261005-001', total: 11000, diterima: 20000, kembalian: 9000, batal: true });
		expect(d.item).toEqual([{ nama: 'Dada Ori', harga: 11000, qty: 1 }]);
	});
	it('sidik berubah bila keranjang, metode, atau uang diterima berubah; urutan item tidak berpengaruh', () => {
		const a = sidikTransaksi([{ menu_id: 'x', nama: 'X', harga: 1, qty: 1 }, { menu_id: 'y', nama: 'Y', harga: 1, qty: 2 }], 'cash', 5000);
		const b = sidikTransaksi([{ menu_id: 'y', nama: 'Y', harga: 1, qty: 2 }, { menu_id: 'x', nama: 'X', harga: 1, qty: 1 }], 'cash', 5000);
		expect(a).toBe(b);
		expect(sidikTransaksi([{ menu_id: 'x', nama: 'X', harga: 1, qty: 2 }], 'cash', 5000)).not.toBe(a);
		expect(sidikTransaksi([{ menu_id: 'x', nama: 'X', harga: 1, qty: 1 }, { menu_id: 'y', nama: 'Y', harga: 1, qty: 2 }], 'qris', null)).not.toBe(a);
	});
});
