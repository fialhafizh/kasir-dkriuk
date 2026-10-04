import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthState } from './auth-state.svelte.ts';

type Hasil = { data: unknown; error: { message: string; status?: number; name?: string } | null };

/** Client palsu: setiap query profil/outlet menunggu sampai tes memutuskan hasilnya. */
function clientPalsu() {
	let listener: (event: string, s: Session | null) => void = () => {};
	const antrian: { tabel: string; selesai: (h: Hasil) => void }[] = [];
	const signOut = vi.fn(async () => ({ error: null as { message: string } | null }));
	const client = {
		auth: {
			onAuthStateChange: (cb: typeof listener) => {
				listener = cb;
				return { data: { subscription: { unsubscribe() {} } } };
			},
			signOut,
			signInWithPassword: vi.fn(async () => ({ data: {}, error: null }))
		},
		from: (tabel: string) => ({
			select: () => ({
				eq: () => ({
					maybeSingle: () => new Promise<Hasil>((selesai) => antrian.push({ tabel, selesai }))
				})
			})
		})
	};
	return {
		client: client as unknown as SupabaseClient,
		signOut,
		emit: (s: Session | null) => listener(s ? 'SIGNED_IN' : 'SIGNED_OUT', s),
		/** Menunggu query berikutnya ke tabel itu lalu menjawabnya. */
		jawab: async (tabel: string, h: Hasil) => {
			await vi.waitFor(() => expect(antrian.some((q) => q.tabel === tabel)).toBe(true));
			const i = antrian.findIndex((q) => q.tabel === tabel);
			antrian.splice(i, 1)[0].selesai(h);
		},
		menunggu: () => antrian.length
	};
}

const sesi = (id: string) => ({ user: { id } }) as unknown as Session;
const kasir = { id: 'u1', username: 'kasir.bukitlama', nama_tampilan: 'K', role: 'kasir', outlet_id: 'o1', aktif: true };
const outlet = { id: 'o1', kode: 'BL', nama: 'Bukit Lama', merek: "D'Kriuk", alamat: 'x', telepon: 'y', aktif: true };
const putus = { message: 'Load failed', status: 0, name: 'AuthRetryableFetchError' };

describe('AuthState', () => {
	it('login normal: profil dan outlet termuat, status ready', async () => {
		const f = clientPalsu();
		const a = new AuthState(f.client);
		a.start();
		f.emit(sesi('u1'));
		await f.jawab('profiles', { data: kasir, error: null });
		await f.jawab('outlets', { data: outlet, error: null });
		await vi.waitFor(() => expect(a.status).toBe('ready'));
		expect(a.outlet?.kode).toBe('BL');
	});

	it('hasil profil lama yang telat datang tidak membatalkan Keluar', async () => {
		const f = clientPalsu();
		const a = new AuthState(f.client);
		a.start();
		f.emit(sesi('u1'));
		await vi.waitFor(() => expect(f.menunggu()).toBe(1));
		f.emit(null); // pengguna menekan Keluar saat profil masih dimuat
		await vi.waitFor(() => expect(a.status).toBe('guest'));
		await f.jawab('profiles', { data: kasir, error: null });
		await new Promise((r) => setTimeout(r, 10));
		expect(a.status).toBe('guest');
		expect(a.profile).toBeNull();
		expect(f.menunggu()).toBe(0); // tidak lanjut memuat outlet
	});

	it('profil gagal dimuat: state dibersihkan, bukan setengah keluar', async () => {
		const f = clientPalsu();
		const a = new AuthState(f.client);
		a.start();
		f.emit(sesi('u1'));
		await f.jawab('profiles', { data: kasir, error: null });
		await f.jawab('outlets', { data: outlet, error: null });
		await vi.waitFor(() => expect(a.status).toBe('ready'));

		f.emit(sesi('u1')); // mis. TOKEN_REFRESHED saat internet putus
		await f.jawab('profiles', { data: null, error: putus });
		await vi.waitFor(() => expect(a.status).toBe('guest'));
		expect(a.profile).toBeNull();
		expect(a.outlet).toBeNull();
		expect(a.notice).toMatch(/Tidak bisa terhubung/);
	});

	it('outlet kasir gagal dimuat diperlakukan sebagai gagal, bukan "pilih outlet"', async () => {
		const f = clientPalsu();
		const a = new AuthState(f.client);
		a.start();
		f.emit(sesi('u1'));
		await f.jawab('profiles', { data: kasir, error: null });
		await f.jawab('outlets', { data: null, error: putus });
		await vi.waitFor(() => expect(a.status).toBe('guest'));
		expect(a.profile).toBeNull();
		expect(a.notice).toMatch(/Tidak bisa terhubung/);
	});

	it('akun nonaktif: langsung dianggap keluar walau signOut gagal', async () => {
		const f = clientPalsu();
		f.signOut.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
		const a = new AuthState(f.client);
		a.start();
		f.emit(sesi('u1'));
		await f.jawab('profiles', { data: { ...kasir, aktif: false }, error: null });
		await vi.waitFor(() => expect(a.status).toBe('guest'));
		expect(a.profile).toBeNull();
		expect(a.notice).toBe('Akun ini dinonaktifkan. Hubungi admin.');
	});

	it('pesan lama dihapus saat keluar normal berikutnya', async () => {
		const f = clientPalsu();
		const a = new AuthState(f.client);
		a.start();
		a.notice = 'Tidak bisa terhubung ke server.';
		await a.signOut();
		expect(a.notice).toBeNull();
		expect(a.status).toBe('guest');
	});
});
