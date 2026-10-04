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
});

describe('review Tugas 3: pesan yang tidak menyesatkan', () => {
	it('baris tidak ditemukan / ditolak aturan akses (PGRST116) → coba lagi tidak akan membantu', () => {
		expect(pesanErrorData({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe(
			'Data tidak ditemukan atau Anda tidak punya izin mengubahnya. Muat ulang halaman.'
		);
	});
	it('sesi kedaluwarsa', () => {
		expect(pesanErrorData({ code: 'PGRST301', message: 'JWT expired' })).toBe('Sesi berakhir. Silakan keluar lalu masuk lagi.');
		expect(pesanErrorData({ code: 'PGRST303', message: 'JWT expired' })).toBe('Sesi berakhir. Silakan keluar lalu masuk lagi.');
	});
	it('data rujukan sudah tidak ada (23503)', () => {
		expect(pesanErrorData({ code: '23503', message: 'violates foreign key' })).toBe('Bahan, menu, atau outlet terkait sudah tidak ada. Muat ulang halaman.');
	});
	it('22023 berbahasa Inggris dari Postgres tidak diteruskan mentah', () => {
		expect(pesanErrorData({ code: '22023', message: 'cannot extract elements from an object' })).toBe('Isian tidak sah.');
	});
	it('pesan cadangan netral (dipakai untuk memuat maupun menyimpan)', () => {
		expect(pesanErrorData({ code: 'XX000', message: 'boom' })).toBe('Terjadi kesalahan di server. Coba lagi beberapa saat lagi.');
	});
});
