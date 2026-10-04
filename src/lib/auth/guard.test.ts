import { describe, expect, it } from 'vitest';
import { cekAkses, homePathFor, routePath } from './guard';

const admin = { role: 'admin' as const, aktif: true };
const kasir = { role: 'kasir' as const, aktif: true };
const u = (s: string) => new URL(s);

describe('routePath (hash router: rute ada di #, bukan di pathname)', () => {
	it('mengambil rute dari hash, bukan pathname situs', () => {
		expect(routePath(u('https://x.github.io/kasir-dkriuk/#/admin'))).toBe('/admin');
	});
	it('hash kosong atau hanya # berarti beranda', () => {
		expect(routePath(u('https://x.github.io/kasir-dkriuk/'))).toBe('/');
		expect(routePath(u('https://x.github.io/kasir-dkriuk/#'))).toBe('/');
	});
	it('membuang query, hash kedua, dan garis miring di akhir', () => {
		expect(routePath(u('http://localhost:5173/#/kasir/'))).toBe('/kasir');
		expect(routePath(u('http://localhost:5173/#/kasir?x=1'))).toBe('/kasir');
		expect(routePath(u('http://localhost:5173/#/admin#bagian'))).toBe('/admin');
	});
	it('mendekode karakter yang di-escape browser', () => {
		expect(routePath(u('http://localhost:5173/%23/login'))).toBe('/');
		expect(routePath(u('http://localhost:5173/#/log%69n'))).toBe('/login');
	});
});

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
		expect(cekAkses('/login/', admin)).toEqual({ ok: false, redirect: '/admin' });
	});
	it('kasir yang mengetik #/admin dialihkan ke /kasir', () => {
		expect(cekAkses('/admin', kasir)).toEqual({ ok: false, redirect: '/kasir' });
		expect(cekAkses('/admin/', kasir)).toEqual({ ok: false, redirect: '/kasir' });
		expect(cekAkses('/admin/akun', kasir)).toEqual({ ok: false, redirect: '/kasir' });
	});
	it('awalan mirip /admin bukan halaman admin', () => {
		expect(cekAkses('/administrasi', kasir)).toEqual({ ok: true });
	});
	it('admin boleh membuka halaman kasir', () => {
		expect(cekAkses('/kasir', admin)).toEqual({ ok: true });
		expect(cekAkses('/admin', admin)).toEqual({ ok: true });
	});
	it('profil nonaktif diperlakukan seperti tamu', () => {
		expect(cekAkses('/kasir', { role: 'kasir', aktif: false })).toEqual({ ok: false, redirect: '/login' });
		expect(cekAkses('/login', { role: 'kasir', aktif: false })).toEqual({ ok: true });
		expect(cekAkses('/admin', { role: 'admin', aktif: false })).toEqual({ ok: false, redirect: '/login' });
	});
});
