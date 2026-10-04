import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Outlet, Profile } from '#lib/types/db.ts';
import { bacaCache, galatJaringan, hapusCache, simpanCache, type Penyimpan } from './cache-profil.ts';
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
	/** true bila data dipakai dari perangkat karena server tidak terjangkau. */
	offline = $state(false);
	#penyimpan: Penyimpan | null;
	#sesiTerakhir: Session | null = null;

	constructor(client: SupabaseClient, penyimpan: Penyimpan | null = null) {
		this.#client = client;
		this.#penyimpan = penyimpan;
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
		this.#sesiTerakhir = null;
		if (this.#penyimpan) hapusCache(this.#penyimpan);
		this.offline = false;
		this.profile = null;
		this.outlet = null;
		this.notice = notice;
		this.status = 'guest';
	}

	async #apply(session: Session | null, gen: number) {
		if (gen !== this.#gen) return;
		this.#sesiTerakhir = session;
		if (!session) {
			if (this.#penyimpan) hapusCache(this.#penyimpan);
			this.offline = false;
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
		if (res.error) return this.#gagalMuat({ ...res.error, status: res.status }, session.user.id);

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
			if (o.error) return this.#gagalMuat({ ...o.error, status: o.status }, session.user.id);
			if (!o.data) return this.#keluarLokal('Outlet akun tidak ditemukan. Hubungi admin.');
			outlet = o.data;
		}

		if (this.#penyimpan) simpanCache(this.#penyimpan, session.user.id, profile, outlet);
		this.offline = false;
		this.profile = profile;
		this.outlet = outlet;
		this.notice = null;
		this.status = 'ready';
	}

	#gagalMuat(err: { message?: string; status?: number; name?: string }, userId: string) {
		const cache = this.#penyimpan && galatJaringan(err) ? bacaCache(this.#penyimpan, userId) : null;
		if (!cache) return this.#keluarLokal(pesanErrorLogin(err));
		this.profile = cache.profile;
		this.outlet = cache.outlet;
		this.offline = true;
		this.status = 'ready';
	}

	/** Dipanggil saat koneksi kembali: muat ulang profil dari server. */
	cobaLagi() {
		// Hanya memulihkan saat sedang offline; tidak pernah menghidupkan lagi sesi yang sudah Keluar.
		if (!this.offline || !this.#sesiTerakhir) return;
		const gen = ++this.#gen;
		const sesi = this.#sesiTerakhir;
		setTimeout(() => void this.#apply(sesi, gen), 0);
	}

	async signIn(username: string, password: string): Promise<string | null> {
		this.notice = null;
		const { error } = await this.#client.auth.signInWithPassword({ email: usernameToEmail(username), password });
		return pesanErrorLogin(error);
	}

	async signOut() {
		this.#gen++;
		this.#keluarLokal(null);
		const { error } = await this.#client.auth.signOut();
		// Offline dengan token kedaluwarsa, auth-js tidak menghapus sesi tersimpan: hapus sendiri.
		if (error && this.#penyimpan) {
			try {
				this.#penyimpan.removeItem('dk-auth');
			} catch {
				// abaikan
			}
		}
	}

}
