import { describe, expect, it } from 'vitest';
import { AUTH_EMAIL_DOMAIN } from './domain.js';
import { normalizeUsername, USERNAME_PATTERN, usernameToEmail, validateUsername } from './username';

describe('username', () => {
	it('dinormalisasi: spasi dibuang, huruf kecil', () => {
		expect(normalizeUsername('  Kasir.BukitLama ')).toBe('kasir.bukitlama');
	});
	it('diubah ke email sintetis', () => {
		expect(usernameToEmail(' Kasir.BukitLama ')).toBe(`kasir.bukitlama@${AUTH_EMAIL_DOMAIN}`);
	});
	it('domain sintetis tidak bisa didaftarkan orang lain (TLD .invalid, RFC 2606)', () => {
		expect(AUTH_EMAIL_DOMAIN.endsWith('.invalid')).toBe(true);
	});
	it('kosong ditolak dengan pesan jelas', () => {
		expect(validateUsername('   ')).toBe('Username wajib diisi.');
	});
	it('panjang 3–32 karakter', () => {
		expect(validateUsername('ab')).toBe('Username harus 3–32 karakter.');
		expect(validateUsername('a'.repeat(33))).toBe('Username harus 3–32 karakter.');
		expect(validateUsername('a'.repeat(32))).toBeNull();
	});
	it('karakter tidak sah ditolak dengan pesan khusus', () => {
		const pesan = 'Username hanya boleh huruf kecil, angka, titik, minus, atau garis bawah, diawali dan diakhiri huruf/angka.';
		expect(validateUsername('kasir bukit')).toBe(pesan);
		expect(validateUsername('a..b')).toBe(pesan);
		expect(validateUsername('.abc')).toBe(pesan);
		expect(validateUsername('abc.')).toBe(pesan);
		expect(validateUsername('---')).toBe(pesan);
	});
	it('username sah lolos, termasuk huruf besar yang dinormalisasi', () => {
		expect(validateUsername('Kasir.Kertapati')).toBeNull();
		expect(validateUsername('kasir.talangkerangga')).toBeNull();
		expect(validateUsername('admin')).toBeNull();
	});
	it('pola diekspor sama persis dengan constraint database', () => {
		expect(USERNAME_PATTERN).toBe('^[a-z0-9](?:[a-z0-9_-]|\\.(?!\\.)){1,30}[a-z0-9]$');
	});
});
