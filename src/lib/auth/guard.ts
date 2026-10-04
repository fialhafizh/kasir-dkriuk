import type { Profile, Role } from '#lib/types/db.ts';

export type AksesKeputusan = { ok: true } | { ok: false; redirect: string };

export function homePathFor(role: Role): '/admin' | '/kasir' {
	return role === 'admin' ? '/admin' : '/kasir';
}

export function cekAkses(path: string, profile: Pick<Profile, 'role' | 'aktif'> | null): AksesKeputusan {
	const diLogin = path === '/login';
	if (!profile || !profile.aktif) return diLogin ? { ok: true } : { ok: false, redirect: '/login' };

	const beranda = homePathFor(profile.role);
	if (diLogin || path === '/') return { ok: false, redirect: beranda };
	if (path.startsWith('/admin') && profile.role !== 'admin') return { ok: false, redirect: beranda };
	return { ok: true };
}
