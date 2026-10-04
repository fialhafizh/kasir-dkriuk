import { describe, expect, it } from 'vitest';
import { AUTH_EMAIL_DOMAIN } from '../../src/lib/auth/domain.js';
import { validateUsername } from '../../src/lib/auth/username';
import { AKUN_AWAL, buatPassword, payloadBuatAkun } from '../../scripts/lib/akun-awal';

describe('daftar akun awal', () => {
	it('satu admin dan satu kasir untuk tiap outlet BL, TK, KP', () => {
		expect(AKUN_AWAL.filter((a) => a.role === 'admin')).toHaveLength(1);
		expect(AKUN_AWAL.filter((a) => a.role === 'kasir').map((a) => a.outlet_kode).sort()).toEqual(['BL', 'KP', 'TK']);
	});
	it('semua username lolos validasi aplikasi', () => {
		for (const a of AKUN_AWAL) expect(validateUsername(a.username), a.username).toBeNull();
	});
});

describe('payloadBuatAkun', () => {
	const kasir = AKUN_AWAL.find((a) => a.outlet_kode === 'BL')!;

	it('peran & outlet di app_metadata (hanya service role), bukan user_metadata', () => {
		const p = payloadBuatAkun(kasir, 'rahasia-123');
		expect(p.app_metadata).toEqual({
			username: 'kasir.bukitlama',
			nama_tampilan: 'Kasir Bukit Lama',
			role: 'kasir',
			outlet_kode: 'BL'
		});
		expect(p).not.toHaveProperty('user_metadata');
	});

	it('email sintetis memakai domain .invalid dan email langsung terkonfirmasi', () => {
		const p = payloadBuatAkun(kasir, 'rahasia-123');
		expect(p.email).toBe(`kasir.bukitlama@${AUTH_EMAIL_DOMAIN}`);
		expect(p.email_confirm).toBe(true);
		expect(p.password).toBe('rahasia-123');
	});

	it('menolak username tidak sah sebelum menghubungi server', () => {
		expect(() => payloadBuatAkun({ ...kasir, username: 'a..b' }, 'x')).toThrow(/a\.\.b/);
	});
});

describe('buatPassword', () => {
	it('panjang 12, aman untuk diketik (huruf/angka/-/_), dan acak', () => {
		const a = buatPassword();
		expect(a).toMatch(/^[A-Za-z0-9_-]{12}$/);
		expect(buatPassword()).not.toBe(a);
	});
});
