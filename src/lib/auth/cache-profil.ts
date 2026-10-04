import type { Outlet, Profile } from '#lib/types/db.ts';

export interface Penyimpan {
	getItem(k: string): string | null;
	setItem(k: string, v: string): void;
	removeItem(k: string): void;
}

const KUNCI = 'dk-profil';

/** Profil & outlet terakhir yang berhasil dimuat, supaya kasir tetap bisa bekerja saat internet putus. */
export function simpanCache(s: Penyimpan, userId: string, profile: Profile, outlet: Outlet | null): void {
	try {
		s.setItem(KUNCI, JSON.stringify({ userId, profile, outlet }));
	} catch {
		// penyimpanan diblokir: aplikasi tetap jalan, hanya tanpa cadangan offline
	}
}

export function bacaCache(s: Penyimpan, userId: string): { profile: Profile; outlet: Outlet | null } | null {
	try {
		const isi = JSON.parse(s.getItem(KUNCI) ?? 'null') as { userId: string; profile: Profile; outlet: Outlet | null } | null;
		return isi && isi.userId === userId ? { profile: isi.profile, outlet: isi.outlet } : null;
	} catch {
		return null;
	}
}

export function hapusCache(s: Penyimpan): void {
	try {
		s.removeItem(KUNCI);
	} catch {
		// abaikan
	}
}

export function galatJaringan(e: { message?: string; status?: number; name?: string } | null): boolean {
	if (!e) return false;
	return e.name === 'AuthRetryableFetchError' || e.status === 0 || /failed to fetch|network|load failed/i.test(e.message ?? '');
}
