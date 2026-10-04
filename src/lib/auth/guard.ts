import type { Profile, Role } from '#lib/types/db.ts';

export type AksesKeputusan = { ok: true } | { ok: false; redirect: string };

/**
 * Rute aktif untuk hash router: diambil dari bagian # (seperti get_url_path di SvelteKit),
 * karena page.url.pathname selalu alamat situs ('/' atau '/kasir-dkriuk/').
 */
export function routePath(url: { readonly hash: string }): string {
	let hash = url.hash;
	try {
		hash = decodeURIComponent(hash);
	} catch {
		// hash rusak: pakai apa adanya
	}
	const p = hash.replace(/^#/, '').replace(/[?#].*$/, '');
	return normalisasi(p);
}

function normalisasi(path: string): string {
	const p = path.replace(/\/+$/, '');
	return p === '' ? '/' : p;
}

export function homePathFor(role: Role): '/admin' | '/kasir' {
	return role === 'admin' ? '/admin' : '/kasir';
}

export function cekAkses(path: string, profile: Pick<Profile, 'role' | 'aktif'> | null): AksesKeputusan {
	const p = normalisasi(path);
	const diLogin = p === '/login';
	if (!profile || !profile.aktif) return diLogin ? { ok: true } : { ok: false, redirect: '/login' };

	const beranda = homePathFor(profile.role);
	if (diLogin || p === '/') return { ok: false, redirect: beranda };
	const halamanAdmin = p === '/admin' || p.startsWith('/admin/');
	if (halamanAdmin && profile.role !== 'admin') return { ok: false, redirect: beranda };
	return { ok: true };
}
