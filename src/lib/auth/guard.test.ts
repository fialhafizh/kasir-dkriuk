import { describe, expect, it } from 'vitest';
import { cekAkses, homePathFor } from './guard';

const admin = { role: 'admin' as const, aktif: true };
const kasir = { role: 'kasir' as const, aktif: true };

describe('homePathFor', () => {
	it('admin ke /admin, kasir ke /kasir', () => {
		expect(homePathFor('admin')).toBe('/admin');
		expect(homePathFor('kasir')).toBe('/kasir');
	});
});

describe('cekAkses', () => {
	it('tamu hanya boleh di /login', () => {
		expect(cekAkses('/login', null)).toEqual({ ok: true });
		expect(cekAkses('/admin', null)).toEqual({ ok: false, redirect: '/login' });
		expect(cekAkses('/', null)).toEqual({ ok: false, redirect: '/login' });
	});
	it('yang sudah login diarahkan dari / dan /login ke berandanya', () => {
		expect(cekAkses('/', kasir)).toEqual({ ok: false, redirect: '/kasir' });
		expect(cekAkses('/login', admin)).toEqual({ ok: false, redirect: '/admin' });
	});
	it('kasir yang mengetik #/admin dialihkan ke /kasir', () => {
		expect(cekAkses('/admin', kasir)).toEqual({ ok: false, redirect: '/kasir' });
		expect(cekAkses('/admin/akun', kasir)).toEqual({ ok: false, redirect: '/kasir' });
	});
	it('admin boleh membuka halaman kasir', () => {
		expect(cekAkses('/kasir', admin)).toEqual({ ok: true });
		expect(cekAkses('/admin', admin)).toEqual({ ok: true });
	});
	it('profil nonaktif diperlakukan seperti tamu', () => {
		expect(cekAkses('/kasir', { role: 'kasir', aktif: false })).toEqual({ ok: false, redirect: '/login' });
		expect(cekAkses('/login', { role: 'kasir', aktif: false })).toEqual({ ok: true });
	});
});
