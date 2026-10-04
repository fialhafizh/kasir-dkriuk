import { describe, expect, it, vi } from 'vitest';
import { Transaksi, type ApiTransaksi } from './transaksi';
import type { BarisKeranjang, HasilJual, PenjualanRiwayat } from './types';

const dada: BarisKeranjang = { menu_id: 'dada', nama: 'Dada', harga: 11000, qty: 1 };
const nasi: BarisKeranjang = { menu_id: 'nasi', nama: 'Nasi', harga: 5000, qty: 1 };

function hasil(id: string, total: number, extra: Partial<HasilJual> = {}): HasilJual {
	return { id, nomor: `BL-1-${id}`, total, kembalian: null, waktu: 'w', ulang: false, ...extra };
}
function tersimpan(id: string): PenjualanRiwayat {
	return { id, nomor: `BL-1-${id}`, waktu: 'w', metode: 'qris', total: 11000, diterima: null, kembalian: null, void_at: null, void_alasan: null, item: [] };
}
function siap() {
	let n = 0;
	const t = new Transaksi(() => `id${++n}`);
	const api = { catat: vi.fn(), muat: vi.fn() } satisfies ApiTransaksi;
	return { t, api };
}
const args = (kirim: BarisKeranjang[], metode: 'cash' | 'qris' = 'qris', diterima: number | null = null) => ({ outletId: 'o', kirim, metode, diterima });

describe('Transaksi.bayar', () => {
	it('normal: satu kiriman, struk dari keranjang, tanpa peringatan', async () => {
		const { t, api } = siap();
		api.catat.mockResolvedValueOnce(hasil('id1', 11000));
		const r = await t.bayar(args([dada]), api);
		expect(api.catat).toHaveBeenCalledWith(expect.objectContaining({ id: 'id1', outlet_id: 'o', item: [{ menu_id: 'dada', qty: 1 }] }));
		expect(api.catat.mock.calls[0][0]).not.toHaveProperty('waktu');
		expect(r.tersimpan).toBeNull();
		expect(r.peringatan).toEqual([]);
	});

	it('gagal lalu coba lagi dengan isi sama → id sama (server idempoten)', async () => {
		const { t, api } = siap();
		api.catat.mockRejectedValueOnce(new Error('putus')).mockResolvedValueOnce(hasil('id1', 11000, { ulang: true }));
		api.muat.mockResolvedValueOnce(tersimpan('id1'));
		await expect(t.bayar(args([dada]), api)).rejects.toThrow('putus');
		const r = await t.bayar(args([dada]), api);
		expect(api.catat.mock.calls.map((c) => c[0].id)).toEqual(['id1', 'id1']);
		expect(r.tersimpan?.id).toBe('id1');
	});

	it('gagal, isi diubah, ternyata yang lama tercatat → peringatan, keranjang BARU tetap dicatat dengan id baru', async () => {
		const { t, api } = siap();
		api.catat.mockRejectedValueOnce(new Error('putus')).mockResolvedValueOnce(hasil('id2', 16000));
		api.muat.mockResolvedValueOnce(tersimpan('id1'));
		await expect(t.bayar(args([dada]), api)).rejects.toThrow();
		const r = await t.bayar(args([dada, nasi]), api);
		expect(api.catat.mock.calls[1][0].id).toBe('id2');
		expect(r.hasil.id).toBe('id2');
		expect(r.peringatan[0]).toMatch(/BL-1-id1.*sudah tercatat/);
	});

	it('gagal, isi diubah, yang lama tidak tercatat → id baru tanpa peringatan', async () => {
		const { t, api } = siap();
		api.catat.mockRejectedValueOnce(new Error('putus')).mockResolvedValueOnce(hasil('id2', 16000));
		api.muat.mockResolvedValueOnce(null);
		await expect(t.bayar(args([dada]), api)).rejects.toThrow();
		const r = await t.bayar(args([dada, nasi]), api);
		expect(api.catat.mock.calls[1][0].id).toBe('id2');
		expect(r.peringatan).toEqual([]);
	});

	it('harga berubah di server → struk dari data tersimpan + peringatan', async () => {
		const { t, api } = siap();
		api.catat.mockResolvedValueOnce(hasil('id1', 12000));
		api.muat.mockResolvedValueOnce(tersimpan('id1'));
		const r = await t.bayar(args([dada]), api);
		expect(r.tersimpan?.id).toBe('id1');
		expect(r.hargaBerubah).toBe(true);
		expect(r.peringatan.join(' ')).toMatch(/Harga menu baru saja diubah/);
	});

	it('kiriman ulang dari transaksi yang sudah dibatalkan → peringatan batal', async () => {
		const { t, api } = siap();
		api.catat.mockResolvedValueOnce(hasil('id1', 11000, { ulang: true, batal: true }));
		api.muat.mockResolvedValueOnce(tersimpan('id1'));
		const r = await t.bayar(args([dada]), api);
		expect(r.peringatan.join(' ')).toMatch(/sudah dibatalkan/);
	});

	it('reset (Kosongkan/Transaksi baru) memberi id baru dan melupakan kegagalan', async () => {
		const { t, api } = siap();
		api.catat.mockRejectedValueOnce(new Error('putus')).mockResolvedValueOnce(hasil('id2', 5000));
		await expect(t.bayar(args([dada]), api)).rejects.toThrow();
		t.reset();
		await t.bayar(args([nasi]), api);
		expect(api.muat).not.toHaveBeenCalled();
		expect(api.catat.mock.calls[1][0].id).toBe('id2');
	});
});
