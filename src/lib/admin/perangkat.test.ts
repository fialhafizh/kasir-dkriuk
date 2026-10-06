import { describe, expect, it } from 'vitest';
import { ringkasData, statusSinkron } from './perangkat';

describe('statusSinkron', () => {
	const sekarang = new Date('2026-10-09T12:00:00Z');
	it('belum / baru / lama (> 24 jam)', () => {
		expect(statusSinkron(null, sekarang)).toBe('belum');
		expect(statusSinkron('2026-10-09T01:00:00Z', sekarang)).toBe('baru');
		expect(statusSinkron('2026-10-08T12:00:00Z', sekarang)).toBe('baru');
		expect(statusSinkron('2026-10-08T11:59:00Z', sekarang)).toBe('lama');
	});
});

describe('ringkasData', () => {
	it('jualan: nomor sementara, kode struk, total', () => {
		expect(ringkasData('jual', { nomor_sementara: 'S1-012', kode_struk: 'K7Q2MX', total: 25000 })).toBe('S1-012 · kode K7Q2MX · Rp25.000');
	});
	it('buka/tutup toko, stok & batal', () => {
		expect(ringkasData('buka_shift', { modal: 100000 })).toBe('modal Rp100.000');
		expect(ringkasData('tutup_shift', { uang_fisik: 250000 })).toBe('uang laci Rp250.000');
		expect(ringkasData('rusak', { item: [{}, {}], alasan: 'gosong' })).toBe('2 bahan · alasan: gosong');
		expect(ringkasData('batal_jual', { penjualan_id: 'x', alasan: 'salah input' })).toBe('alasan: salah input');
		expect(ringkasData('lain', {})).toBe('');
	});
});
