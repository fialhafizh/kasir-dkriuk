import { describe, expect, it } from 'vitest';
import { CLIENT_OPTIONS } from './options';

describe('opsi client Supabase', () => {
	it('tidak membaca token sesi dari URL (cegah tautan yang memasukkan HP ke sesi orang lain)', () => {
		expect(CLIENT_OPTIONS.auth.detectSessionInUrl).toBe(false);
	});
	it('sesi disimpan di perangkat dan diperbarui otomatis', () => {
		expect(CLIENT_OPTIONS.auth.persistSession).toBe(true);
		expect(CLIENT_OPTIONS.auth.autoRefreshToken).toBe(true);
		expect(CLIENT_OPTIONS.auth.storageKey).toBe('dk-auth');
	});
});
