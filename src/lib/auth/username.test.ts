import { describe, expect, it } from 'vitest';
import { normalizeUsername, usernameToEmail, validateUsername } from './username';

describe('username', () => {
	it('dinormalisasi: spasi dibuang, huruf kecil', () => {
		expect(normalizeUsername('  Kasir.BukitLama ')).toBe('kasir.bukitlama');
	});
	it('diubah ke email sintetis', () => {
		expect(usernameToEmail(' Kasir.BukitLama ')).toBe('kasir.bukitlama@kasir-dkriuk.app');
	});
	it('kosong ditolak dengan pesan jelas', () => {
		expect(validateUsername('   ')).toBe('Username wajib diisi.');
	});
	it('karakter tidak sah ditolak', () => {
		expect(validateUsername('kasir bukit')).toMatch(/3–32 karakter/);
		expect(validateUsername('ab')).toMatch(/3–32 karakter/);
	});
	it('username sah lolos', () => {
		expect(validateUsername('Kasir.Kertapati')).toBeNull();
	});
});
