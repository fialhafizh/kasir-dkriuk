import { describe, expect, it } from 'vitest';
import { buatKejadianBuka, buatKejadianJual, buatKejadianTutup } from './offline-kasir';

const waktu = new Date('2026-10-08T05:00:00Z');
const keranjang = [
	{ menu_id: 'm1', nama: 'Dada Ori', harga: 11000, qty: 2 },
	{ menu_id: 'm2', nama: 'Nasi', harga: 5000, qty: 1 }
];

describe('kejadian kasir', () => {
	it('jual cash: total & kembalian lokal, item lengkap untuk riwayat/struk, kode struk dari id', () => {
		const r = buatKejadianJual({ id: '8f14e45f-ceea-467a-9e2b-1b2a3c4d5e6f', outletId: 'o', shiftId: 's', metode: 'cash', diterima: 30000, keranjang, waktu });
		expect(r.total).toBe(27000);
		expect(r.kembalian).toBe(3000);
		expect(r.kodeStruk).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
		expect(r.kejadian).toMatchObject({ jenis: 'jual', outlet_id: 'o', shift_id: 's', waktu: '2026-10-08T05:00:00.000Z' });
		expect(r.kejadian.data).toMatchObject({ metode: 'cash', diterima: 30000, total: 27000, kode_struk: r.kodeStruk });
		expect(r.kejadian.data.item).toEqual([
			{ menu_id: 'm1', nama: 'Dada Ori', harga: 11000, qty: 2 },
			{ menu_id: 'm2', nama: 'Nasi', harga: 5000, qty: 1 }
		]);
	});
	it('jual non-tunai: tanpa diterima & kembalian', () => {
		const r = buatKejadianJual({ id: crypto.randomUUID(), outletId: 'o', shiftId: 's', metode: 'qris', diterima: 30000, keranjang, waktu });
		expect(r.kembalian).toBeNull();
		expect(r.kejadian.data).not.toHaveProperty('diterima');
	});
	it('buka toko: id shift baru dipakai untuk kejadian & shift_id; tutup: shift_id = shift perangkat', () => {
		const b = buatKejadianBuka('o', 150000, waktu);
		expect(b.shift_id).toBe(b.data.shift_id);
		expect(b.data.modal).toBe(150000);
		const t = buatKejadianTutup('o', b.shift_id!, 160000, 'aman', waktu);
		expect(t).toMatchObject({ jenis: 'tutup_shift', shift_id: b.shift_id, data: { uang_fisik: 160000, catatan: 'aman' } });
	});
});
