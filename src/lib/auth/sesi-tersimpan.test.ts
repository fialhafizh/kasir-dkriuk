import { describe, expect, it } from 'vitest';
import { userTersimpan } from './sesi-tersimpan';

const s = (isi: string | null) => ({ getItem: () => isi, setItem: () => {}, removeItem: () => {} });

describe('userTersimpan', () => {
	it('membaca id pengguna dari sesi auth tersimpan', () => {
		expect(userTersimpan(s(JSON.stringify({ access_token: 'x', refresh_token: 'y', user: { id: 'u1' } })))).toBe('u1');
	});
	it('tidak ada / rusak / tanpa refresh token → null', () => {
		expect(userTersimpan(s(null))).toBeNull();
		expect(userTersimpan(s('{rusak'))).toBeNull();
		expect(userTersimpan(s(JSON.stringify({ user: { id: 'u1' } })))).toBeNull();
	});
});
