import { describe, expect, it } from 'vitest';
import {
	buatKejadianBatal,
	buatKejadianBatalTransfer,
	buatKejadianBuka,
	buatKejadianHitung,
	buatKejadianJual,
	buatKejadianKasbon,
	buatKejadianKirim,
	buatKejadianPengeluaran,
	buatKejadianSetoran,
	buatKejadianTerima,
	buatKejadianTutup,
	buatKejadianUbah
} from './offline-kasir';

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

describe('kejadian 4b', () => {
	const it2 = [{ bahan_id: 'b1', qty: 2 }];
	it('batal: penjualan, alasan dirapikan, shift penjualan', () => {
		const b = buatKejadianBatal('o', 's', 'p1', '  salah input ', waktu);
		expect(b).toMatchObject({ jenis: 'batal_jual', outlet_id: 'o', shift_id: 's', waktu: '2026-10-08T05:00:00.000Z', data: { penjualan_id: 'p1', alasan: 'salah input' } });
	});
	it('kirim: id kejadian = id transfer; catatan kosong tidak dikirim', () => {
		const k = buatKejadianKirim('o', { id: 't1', keOutletId: 'o2', item: it2, catatan: '  ' }, waktu);
		expect(k).toMatchObject({ id: 't1', jenis: 'kirim_transfer', shift_id: null, data: { ke_outlet_id: 'o2', item: it2 } });
		expect(k.data).not.toHaveProperty('catatan');
		expect(buatKejadianKirim('o', { keOutletId: 'o2', item: it2, catatan: 'pagi' }, waktu).data.catatan).toBe('pagi');
	});
	it('ubah, batal, terima transfer membawa id transfer', () => {
		expect(buatKejadianUbah('o', 't1', it2, '', waktu)).toMatchObject({ jenis: 'ubah_transfer', data: { transfer_id: 't1', item: it2, catatan: null } });
		expect(buatKejadianBatalTransfer('o', 't1', ' tidak jadi ', waktu)).toMatchObject({ jenis: 'batal_transfer', data: { transfer_id: 't1', alasan: 'tidak jadi' } });
		expect(buatKejadianTerima('o', 't1', it2, waktu)).toMatchObject({ jenis: 'terima_transfer', outlet_id: 'o', data: { transfer_id: 't1', item: it2 } });
	});
	it('opname & stok awal: id = id hitungan, jam = jam hitung', () => {
		const o = buatKejadianHitung('opname', 'o', it2, waktu, 'h1');
		expect(o).toEqual({ id: 'h1', jenis: 'opname', outlet_id: 'o', shift_id: null, waktu: '2026-10-08T05:00:00.000Z', data: { item: it2 } });
		expect(buatKejadianHitung('stok_awal', 'o', it2, waktu).jenis).toBe('stok_awal');
	});
});

describe('kejadian 5a', () => {
	it('buka: modal tidak negatif; uang laci awal hanya bila diisi', () => {
		expect(buatKejadianBuka('o', -5, waktu).data).toEqual({ shift_id: expect.any(String), modal: 0 });
		expect(buatKejadianBuka('o', 100000, waktu, 100000).data).toMatchObject({ modal: 100000, laci_awal: 100000 });
	});
	it('batal membawa metode & total untuk saldo laci', () => {
		expect(buatKejadianBatal('o', 's', 'p', 'salah', waktu, { metode: 'cash', total: 5000 }).data).toEqual({ penjualan_id: 'p', alasan: 'salah', metode: 'cash', total: 5000 });
	});
	it('pengeluaran & setoran', () => {
		expect(buatKejadianPengeluaran('o', { kategoriId: 'k', jumlah: 25000, keterangan: ' ' }, waktu)).toMatchObject({ jenis: 'pengeluaran', shift_id: null, data: { kategori_id: 'k', jumlah: 25000 } });
		expect(buatKejadianSetoran('o', 2500000, ' ambil malam ', waktu)).toMatchObject({ jenis: 'setoran', data: { jumlah: 2500000, catatan: 'ambil malam' } });
		expect(buatKejadianSetoran('o', 1, '', waktu).data).not.toHaveProperty('catatan');
	});
});

describe('kejadian 5b', () => {
	it('kasbon membawa karyawan & nominal', () => {
		expect(buatKejadianKasbon('o', { karyawanId: 'k1', jumlah: 50000, keterangan: ' ' }, waktu)).toMatchObject({
			jenis: 'kasbon',
			shift_id: null,
			data: { karyawan_id: 'k1', jumlah: 50000 }
		});
	});
});
