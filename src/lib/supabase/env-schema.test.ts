import { describe, expect, it } from 'vitest';
import { cekKunciPublik, cekSupabaseUrl } from './env-schema';

describe('cekSupabaseUrl', () => {
	it('menerima URL project Supabase', () => {
		expect(cekSupabaseUrl('https://uijaqfdgdxfarhmivtmg.supabase.co')).toBe('https://uijaqfdgdxfarhmivtmg.supabase.co');
	});
	it('membuang garis miring di akhir', () => {
		expect(cekSupabaseUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co');
	});
	it('menolak kosong, http, dan placeholder contoh', () => {
		expect(() => cekSupabaseUrl(undefined)).toThrow(/PUBLIC_SUPABASE_URL/);
		expect(() => cekSupabaseUrl('http://abc.supabase.co')).toThrow(/https/);
		expect(() => cekSupabaseUrl('https://xxxxxxxx.supabase.co')).toThrow(/contoh/);
	});
});

describe('cekKunciPublik', () => {
	it('menerima kunci publishable dan anon lama', () => {
		expect(cekKunciPublik('sb_publishable_abc123')).toBe('sb_publishable_abc123');
		expect(cekKunciPublik('eyJhbGciOiJIUzI1NiJ9.e30.x')).toBe('eyJhbGciOiJIUzI1NiJ9.e30.x');
	});
	it('menolak kunci rahasia agar tidak bocor ke browser', () => {
		expect(() => cekKunciPublik('sb_secret_abc123')).toThrow(/rahasia/);
	});
	it('menolak kunci service_role lama (JWT) agar tidak bocor ke browser', () => {
		const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
		expect(() => cekKunciPublik(`eyJhbGciOiJIUzI1NiJ9.${payload}.sig`)).toThrow(/rahasia/);
	});
	it('menolak kosong dan placeholder', () => {
		expect(() => cekKunciPublik(undefined)).toThrow(/PUBLIC_SUPABASE_ANON_KEY/);
		expect(() => cekKunciPublik('sb_publishable_...')).toThrow(/contoh/);
	});
});
