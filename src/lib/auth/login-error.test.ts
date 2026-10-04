import { describe, expect, it } from 'vitest';
import { pesanErrorLogin } from './login-error';

const PUTUS = 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.';

describe('pesanErrorLogin', () => {
	it('tanpa error → null', () => {
		expect(pesanErrorLogin(null)).toBeNull();
	});
	it('kredensial salah (kode resmi auth-js)', () => {
		expect(pesanErrorLogin({ name: 'AuthApiError', code: 'invalid_credentials', status: 400, message: 'x' })).toBe(
			'Username atau password salah.'
		);
	});
	it('kredensial salah (cadangan: pesan lama tanpa kode)', () => {
		expect(pesanErrorLogin({ message: 'Invalid login credentials', status: 400 })).toBe('Username atau password salah.');
	});
	it('internet putus dengan pesan browser apa pun bukan dianggap password salah', () => {
		expect(pesanErrorLogin({ name: 'AuthRetryableFetchError', status: 0, message: 'Load failed' })).toBe(PUTUS);
		expect(pesanErrorLogin({ message: 'Failed to fetch' })).toBe(PUTUS);
	});
	it('server sedang gangguan (5xx)', () => {
		expect(pesanErrorLogin({ name: 'AuthRetryableFetchError', status: 502, message: 'Bad Gateway' })).toBe(
			'Server sedang gangguan. Coba lagi beberapa saat lagi.'
		);
	});
	it('terlalu banyak percobaan', () => {
		const pesan = 'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.';
		expect(pesanErrorLogin({ message: 'Request rate limit reached', status: 429 })).toBe(pesan);
		expect(pesanErrorLogin({ code: 'over_request_rate_limit', status: 429 })).toBe(pesan);
	});
	it('akun diblokir atau belum aktif: mencoba lagi tidak akan membantu', () => {
		const pesan = 'Akun ini tidak bisa dipakai masuk. Hubungi admin.';
		expect(pesanErrorLogin({ name: 'AuthApiError', code: 'user_banned', status: 400 })).toBe(pesan);
		expect(pesanErrorLogin({ name: 'AuthApiError', code: 'email_not_confirmed', status: 400 })).toBe(pesan);
	});
	it('error lain → pesan umum', () => {
		expect(pesanErrorLogin({ message: 'boom', status: 500 })).toBe('Login gagal. Coba lagi beberapa saat lagi.');
	});
});
