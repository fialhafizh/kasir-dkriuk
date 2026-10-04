import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Outlet, Profile } from '#lib/types/db.ts';
import { pesanErrorLogin } from './login-error.ts';
import { usernameToEmail } from './username.ts';

type Status = 'loading' | 'guest' | 'ready';

/**
 * Status sesi login. Client Supabase disuntikkan supaya bisa diuji dengan client palsu.
 * Setiap perubahan sesi menaikkan #gen; hasil query dari sesi lama yang telat datang diabaikan.
 */
export class AuthState {
	status = $state<Status>('loading');
	profile = $state<Profile | null>(null);
	outlet = $state<Outlet | null>(null);
	/** Pesan untuk ditampilkan di halaman login (mis. akun dinonaktifkan). */
	notice = $state<string | null>(null);
	#started = false;
	#gen = 0;
	#client: SupabaseClient;

	constructor(client: SupabaseClient) {
		this.#client = client;
	}

	start() {
		if (this.#started) return;
		this.#started = true;
		this.#client.auth.onAuthStateChange((_event, session) => {
			const gen = ++this.#gen;
			// Ditunda: memanggil Supabase langsung di dalam callback ini bisa macet.
			setTimeout(() => void this.#apply(session, gen), 0);
		});
	}

	#keluarLokal(notice: string | null) {
		this.profile = null;
		this.outlet = null;
		this.notice = notice;
		this.status = 'guest';
	}

	async #apply(session: Session | null, gen: number) {
		if (gen !== this.#gen) return;
		if (!session) {
			this.profile = null;
			this.outlet = null;
			this.status = 'guest';
			return;
		}

		const res = await this.#client
			.from('profiles')
			.select('id, username, nama_tampilan, role, outlet_id, aktif')
			.eq('id', session.user.id)
			.maybeSingle<Profile>();
		if (gen !== this.#gen) return;
		if (res.error) return this.#keluarLokal(pesanErrorLogin(res.error));

		const profile = res.data;
		if (!profile || !profile.aktif) {
			this.#keluarLokal(profile ? 'Akun ini dinonaktifkan. Hubungi admin.' : 'Profil akun tidak ditemukan. Hubungi admin.');
			await this.#client.auth.signOut();
			return;
		}

		let outlet: Outlet | null = null;
		if (profile.outlet_id) {
			const o = await this.#client
				.from('outlets')
				.select('id, kode, nama, merek, alamat, telepon, aktif')
				.eq('id', profile.outlet_id)
				.maybeSingle<Outlet>();
			if (gen !== this.#gen) return;
			if (o.error || !o.data) return this.#keluarLokal(pesanErrorLogin(o.error) ?? 'Outlet akun tidak ditemukan. Hubungi admin.');
			outlet = o.data;
		}

		this.profile = profile;
		this.outlet = outlet;
		this.notice = null;
		this.status = 'ready';
	}

	async signIn(username: string, password: string): Promise<string | null> {
		this.notice = null;
		const { error } = await this.#client.auth.signInWithPassword({ email: usernameToEmail(username), password });
		return pesanErrorLogin(error);
	}

	async signOut() {
		this.#gen++;
		this.#keluarLokal(null);
		await this.#client.auth.signOut();
	}
}
