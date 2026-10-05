import type { Penyimpan } from './cache-profil.ts';

/** Id pengguna dari sesi Supabase tersimpan (kunci 'dk-auth'), hanya bila masih punya refresh token. */
export function userTersimpan(s: Penyimpan): string | null {
	try {
		const isi = JSON.parse(s.getItem('dk-auth') ?? 'null') as { refresh_token?: string; user?: { id?: string } } | null;
		return isi?.refresh_token && isi.user?.id ? isi.user.id : null;
	} catch {
		return null;
	}
}
