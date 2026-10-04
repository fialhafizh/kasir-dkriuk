import { describe, expect, it } from 'vitest';
import { pesanErrorData } from './pesan';

describe('pesanErrorData', () => {
	it('tanpa error → null', () => {
		expect(pesanErrorData(null)).toBeNull();
	});
	it('tidak berhak', () => {
		expect(pesanErrorData({ code: '42501', message: 'Hanya admin yang boleh mengubah resep' })).toBe(
			'Anda tidak punya izin untuk perubahan ini.'
		);
	});
	it('isian tidak sah dari database memakai pesan database bila berbahasa Indonesia', () => {
		expect(pesanErrorData({ code: '22023', message: 'Resep minimal satu bahan' })).toBe('Resep minimal satu bahan.');
	});
	it('data ganda', () => {
		expect(pesanErrorData({ code: '23505', message: 'duplicate key' })).toBe('Ada data ganda. Periksa isian Anda.');
	});
	it('melanggar batas (cek/angka)', () => {
		expect(pesanErrorData({ code: '23514', message: 'violates check constraint' })).toBe('Isian di luar batas yang diizinkan.');
	});
	it('jaringan putus', () => {
		expect(pesanErrorData({ message: 'TypeError: Failed to fetch' })).toBe(
			'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.'
		);
	});
	it('lainnya → pesan umum', () => {
		expect(pesanErrorData({ code: 'XX000', message: 'boom' })).toBe('Gagal menyimpan. Coba lagi beberapa saat lagi.');
	});
});
