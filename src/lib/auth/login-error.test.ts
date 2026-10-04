import { describe, expect, it } from 'vitest';
import { pesanErrorLogin } from './login-error';

describe('pesanErrorLogin', () => {
	it('tanpa error → null', () => {
		expect(pesanErrorLogin(null)).toBeNull();
	});
	it('kredensial salah', () => {
		expect(pesanErrorLogin({ message: 'Invalid login credentials', status: 400 })).toBe('Username atau password salah.');
	});
	it('internet putus bukan dianggap password salah', () => {
		expect(pesanErrorLogin({ message: 'Failed to fetch' })).toBe(
			'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.'
		);
	});
	it('terlalu banyak percobaan', () => {
		expect(pesanErrorLogin({ message: 'Request rate limit reached', status: 429 })).toBe(
			'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.'
		);
	});
	it('error lain → pesan umum', () => {
		expect(pesanErrorLogin({ message: 'boom', status: 500 })).toBe('Login gagal. Coba lagi beberapa saat lagi.');
	});
});
