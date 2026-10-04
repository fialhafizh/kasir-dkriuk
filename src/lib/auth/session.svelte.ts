import type { Session } from '@supabase/supabase-js';
import { supabase } from '#lib/supabase/client.ts';
import type { Outlet, Profile } from '#lib/types/db.ts';
import { pesanErrorLogin } from './login-error.ts';
import { usernameToEmail } from './username.ts';

type Status = 'loading' | 'guest' | 'ready';

class AuthState {
	status = $state<Status>('loading');
	profile = $state<Profile | null>(null);
	outlet = $state<Outlet | null>(null);
	/** Pesan untuk ditampilkan di halaman login (mis. akun dinonaktifkan). */
	notice = $state<string | null>(null);
	#started = false;

	start() {
		if (this.#started) return;
		this.#started = true;
		supabase.auth.onAuthStateChange((_event, session) => {
			// Ditunda: memanggil Supabase langsung di dalam callback ini bisa macet.
			setTimeout(() => void this.#apply(session), 0);
		});
	}

	async #apply(session: Session | null) {
		if (!session) {
			this.profile = null;
			this.outlet = null;
			this.status = 'guest';
			return;
		}
		const { data: profile, error } = await supabase
			.from('profiles')
			.select('id, username, nama_tampilan, role, outlet_id, aktif')
			.eq('id', session.user.id)
			.maybeSingle<Profile>();

		if (error) {
			this.notice = pesanErrorLogin(error);
			this.status = 'guest';
			return;
		}
		if (!profile || !profile.aktif) {
			this.notice = profile ? 'Akun ini dinonaktifkan. Hubungi admin.' : 'Profil akun tidak ditemukan. Hubungi admin.';
			await supabase.auth.signOut();
			return;
		}

		let outlet: Outlet | null = null;
		if (profile.outlet_id) {
			const res = await supabase
				.from('outlets')
				.select('id, kode, nama, merek, alamat, telepon, aktif')
				.eq('id', profile.outlet_id)
				.maybeSingle<Outlet>();
			outlet = res.data ?? null;
		}
		this.profile = profile;
		this.outlet = outlet;
		this.notice = null;
		this.status = 'ready';
	}

	async signIn(username: string, password: string): Promise<string | null> {
		this.notice = null;
		const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
		return pesanErrorLogin(error);
	}

	async signOut() {
		await supabase.auth.signOut();
	}
}

export const auth = new AuthState();
