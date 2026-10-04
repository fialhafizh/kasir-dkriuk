# Tahap 2 — Layar Kasir Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kasir bisa berjualan: modal kembalian di awal hari, pilih menu dengan tombol besar, bayar (Cash/QRIS/GoFood/GrabFood/ShopeeFood) dengan kembalian otomatis, struk tercetak di printer thermal 58 mm, riwayat & void dalam shift, dan tutup toko dengan hitungan selisih kas.

**Architecture:** Tabel `shift`, `penjualan`, `penjualan_item`, `nomor_harian` (migrasi 0008). Pengguna login hanya bisa MEMBACA (RLS: outlet sendiri / admin semua); semua penulisan lewat fungsi SQL `security definer` yang memeriksa hak akses, **menghitung harga dari `harga_jual` di server** (harga dari klien diabaikan), memberi nomor berurutan per outlet per hari (WIB), dan idempoten berdasarkan ID transaksi yang dibuat di perangkat (persiapan offline Tahap 4). Logika keranjang, pembayaran, struk, dan ESC/POS adalah modul murni yang diuji Vitest. Printer: Web Bluetooth (BLE) dengan cadangan aplikasi RawBT. `AuthState` dibuat tahan internet putus (profil disimpan di perangkat).

**Tech Stack:** SvelteKit 3 + Svelte 5, Tailwind 4, Supabase (Postgres RLS + fungsi SQL), Vitest + PGlite, Web Bluetooth (`@types/web-bluetooth`), ESC/POS.

**Spec:** `docs/superpowers/specs/2026-10-04-kasir-dkriuk-design.md` §5 (kasir, shift, struk), §9 (offline — sebagian). Rancangan Tahap 2 disetujui owner 5 Okt 2026: modal kembalian lewat kotak kecil saat pertama jualan (terisi modal terakhir), "Tutup toko" di akhir hari, shift kemarin yang belum ditutup harus ditutup dulu; struk otomatis tercetak bila printer tersambung; ojol cukup metode bayar; printer **OKAY 58B, kertas 58 mm** (ESC/POS; BLE bila didukung, cadangan RawBT). Wajib baca "Catatan wajib" di `docs/superpowers/plans/2026-10-04-00-roadmap.md`.

## Global Constraints

- **SvelteKit 3**: impor `#lib/...` selalu dengan ekstensi; env via `$app/env/public`; hash router (`href()`, `routePath(page.url)`); tanpa `+layout.ts`.
- Migrasi 0001–0007 sudah di server: **jangan diubah**; perubahan = migrasi baru (0008+).
- Tabel transaksi baru: FK ke tabel master/profil/outlet **`on delete restrict`**; tidak ada hak tulis langsung untuk `anon`/`authenticated` (hanya lewat fungsi); `service_role` diberi hak eksplisit.
- Harga & total **selalu dihitung server** dari `harga_jual` outlet; klien hanya mengirim `menu_id` + `qty`.
- Waktu bisnis WIB (Asia/Jakarta). Nomor transaksi `{KODE}-{YYMMDD}-{NNN}` per outlet per hari WIB.
- Uang Rupiah bulat (integer). UI Bahasa Indonesia. ≤1000 baris/file, satu tanggung jawab per file.
- Target sentuh ≥ 48 px; tombol menu kasir besar (≥ 72 px tinggi). Tablet landscape & HP portrait.
- Simpan dari UI tidak boleh saling menimpa; galat ditampilkan dekat sumbernya.
- Struk hanya karakter ASCII (printer murah tidak mendukung Unicode); lebar 32 karakter (58 mm, font A).
- Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Kasir mengirim harga palsu atau menu outlet lain/menu nonaktif lewat API → ditolak, total selalu dari harga server. Diuji Task 3 (`penjualan.test.ts`).
2. Transaksi yang sama terkirim dua kali (sinyal putus, tombol Bayar ditekan dua kali) → tercatat sekali dengan nomor yang sama. Diuji Task 3.
3. Cash dengan uang diterima kurang dari total → ditolak; kembalian tepat. Diuji Task 3 & Task 4.
4. Kasir membatalkan transaksi dari shift yang sudah ditutup atau outlet lain → ditolak; admin boleh. Diuji Task 3.
5. Internet putus saat kasir sudah login (token diperbarui tiap jam) → kasir tetap di layar jualan, bukan dilempar ke login. Diuji Task 1 (`auth-state.test.ts`).

---

## File Structure

```
supabase/migrations/20261005000008_penjualan.sql   # metode_bayar, shift, penjualan, penjualan_item, nomor_harian, RLS, hak
supabase/migrations/20261005000009_fungsi_kasir.sql # buka_shift, catat_penjualan, void_penjualan, tutup_shift, ringkasan_shift
tests/db/harness-kasir.ts                           # bantuan tes: shift & penjualan cepat
tests/db/penjualan-skema.test.ts                    # skema, RLS baca, hak tulis
tests/db/penjualan.test.ts                          # fungsi kasir
src/lib/auth/auth-state.svelte.ts                   # (ubah) tahan offline: cache profil/outlet
src/lib/auth/cache-profil.ts                        # simpan/baca cache profil (+test)
src/lib/kasir/
  types.ts                                          # Metode, BarisKeranjang, MenuJual, Shift, Penjualan, Ringkasan
  keranjang.ts (+test)                              # tambah/kurang/nasi box/total
  bayar.ts (+test)                                  # METODE, kembalian, tombol cepat
  waktu.ts (+test)                                  # format WIB, tanggal WIB, shift kedaluwarsa
  struk.ts (+test)                                  # susun baris struk 32 kolom ASCII
  escpos.ts (+test)                                 # ESC/POS bytes, potong per paket BLE, URL RawBT
  printer.svelte.ts                                 # sambung BLE & cetak; status
  api.ts                                            # panggilan Supabase (menu+harga outlet, shift, penjualan)
  pos.svelte.ts                                     # status bersama halaman kasir (outlet aktif, shift)
src/lib/components/kasir/
  KasirNav.svelte, PilihOutlet.svelte, ModalShift.svelte, MenuGrid.svelte,
  Keranjang.svelte, BayarPanel.svelte, Selesai.svelte, PrinterChip.svelte
src/routes/kasir/+layout.svelte                     # AppShell + KasirNav + pilih outlet (admin)
src/routes/kasir/+page.svelte                       # jualan
src/routes/kasir/riwayat/+page.svelte               # riwayat shift + void
src/routes/kasir/tutup/+page.svelte                 # tutup toko
scripts/uji-kasir.ts                                # E2E server (outlet & akun sementara, dibersihkan)
```

---

### Task 1: Sesi tahan internet putus

**Files:**
- Create: `src/lib/auth/cache-profil.ts`, `src/lib/auth/cache-profil.test.ts`
- Modify: `src/lib/auth/auth-state.svelte.ts`, `src/lib/auth/auth-state.test.ts`, `src/lib/auth/session.svelte.ts`

**Interfaces:**
- Produces:
  - `interface Penyimpan { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }`
  - `simpanCache(s: Penyimpan, userId: string, profile: Profile, outlet: Outlet | null): void`, `bacaCache(s: Penyimpan, userId: string): { profile: Profile; outlet: Outlet | null } | null`, `hapusCache(s: Penyimpan): void`, `galatJaringan(e: { message?: string; status?: number; name?: string } | null): boolean`
  - `new AuthState(client, penyimpan?: Penyimpan)`; field baru `offline: boolean`; metode `cobaLagi(): void`.

- [ ] **Step 1: Tes cache (gagal dulu)**

`src/lib/auth/cache-profil.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { bacaCache, galatJaringan, hapusCache, simpanCache, type Penyimpan } from './cache-profil';

function memori(): Penyimpan & { isi: Map<string, string> } {
	const isi = new Map<string, string>();
	return { isi, getItem: (k) => isi.get(k) ?? null, setItem: (k, v) => void isi.set(k, v), removeItem: (k) => void isi.delete(k) };
}
const profile = { id: 'u1', username: 'kasir.bukitlama', nama_tampilan: 'K', role: 'kasir' as const, outlet_id: 'o1', aktif: true };
const outlet = { id: 'o1', kode: 'BL', nama: 'Bukit Lama', merek: "D'Kriuk", alamat: 'x', telepon: 'y', aktif: true };

describe('cache profil', () => {
	it('menyimpan dan membaca untuk user yang sama', () => {
		const s = memori();
		simpanCache(s, 'u1', profile, outlet);
		expect(bacaCache(s, 'u1')).toEqual({ profile, outlet });
	});
	it('tidak dipakai untuk user lain', () => {
		const s = memori();
		simpanCache(s, 'u1', profile, outlet);
		expect(bacaCache(s, 'u2')).toBeNull();
	});
	it('isi rusak atau penyimpanan gagal → null, tidak melempar', () => {
		const s = memori();
		s.setItem('dk-profil', '{rusak');
		expect(bacaCache(s, 'u1')).toBeNull();
		const gagal: Penyimpan = {
			getItem: () => {
				throw new Error('diblokir');
			},
			setItem: () => {
				throw new Error('diblokir');
			},
			removeItem: () => {}
		};
		expect(() => simpanCache(gagal, 'u1', profile, outlet)).not.toThrow();
		expect(bacaCache(gagal, 'u1')).toBeNull();
	});
	it('hapus', () => {
		const s = memori();
		simpanCache(s, 'u1', profile, outlet);
		hapusCache(s);
		expect(bacaCache(s, 'u1')).toBeNull();
	});
});

describe('galatJaringan', () => {
	it('mengenali putus koneksi dari PostgREST/auth-js', () => {
		expect(galatJaringan({ message: 'TypeError: Failed to fetch' })).toBe(true);
		expect(galatJaringan({ message: 'Load failed' })).toBe(true);
		expect(galatJaringan({ name: 'AuthRetryableFetchError', status: 0, message: 'x' })).toBe(true);
		expect(galatJaringan({ message: 'permission denied', status: 403 })).toBe(false);
		expect(galatJaringan(null)).toBe(false);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/auth/cache-profil.test.ts`
Expected: FAIL, modul belum ada.

- [ ] **Step 3: Implementasi cache**

`src/lib/auth/cache-profil.ts`:
```ts
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
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src/lib/auth/cache-profil.test.ts`
Expected: PASS.

- [ ] **Step 5: Tes AuthState offline (gagal dulu)**

Tambahkan di akhir `src/lib/auth/auth-state.test.ts`:
```ts
describe('Tahap 2: tetap bekerja saat internet putus', () => {
	function memori() {
		const isi = new Map<string, string>();
		return { getItem: (k: string) => isi.get(k) ?? null, setItem: (k: string, v: string) => void isi.set(k, v), removeItem: (k: string) => void isi.delete(k) };
	}

	it('profil gagal dimuat karena jaringan, tapi ada cache → tetap ready & offline', async () => {
		const f = clientPalsu();
		const s = memori();
		const a = new AuthState(f.client, s);
		a.start();
		f.emit(sesi('u1'));
		await f.jawab('profiles', { data: kasir, error: null });
		await f.jawab('outlets', { data: outlet, error: null });
		await vi.waitFor(() => expect(a.status).toBe('ready'));

		f.emit(sesi('u1')); // TOKEN_REFRESHED saat internet putus
		await f.jawab('profiles', { data: null, error: putus });
		await vi.waitFor(() => expect(a.offline).toBe(true));
		expect(a.status).toBe('ready');
		expect(a.profile?.username).toBe('kasir.bukitlama');
		expect(a.outlet?.kode).toBe('BL');
	});

	it('tanpa cache (pertama kali di perangkat ini) → keluar dengan pesan koneksi', async () => {
		const f = clientPalsu();
		const a = new AuthState(f.client, memori());
		a.start();
		f.emit(sesi('u1'));
		await f.jawab('profiles', { data: null, error: putus });
		await vi.waitFor(() => expect(a.status).toBe('guest'));
		expect(a.notice).toMatch(/Tidak bisa terhubung/);
	});

	it('galat bukan jaringan (mis. izin) tidak memakai cache', async () => {
		const f = clientPalsu();
		const s = memori();
		const a = new AuthState(f.client, s);
		a.start();
		f.emit(sesi('u1'));
		await f.jawab('profiles', { data: kasir, error: null });
		await f.jawab('outlets', { data: outlet, error: null });
		await vi.waitFor(() => expect(a.status).toBe('ready'));
		f.emit(sesi('u1'));
		await f.jawab('profiles', { data: null, error: { message: 'permission denied', status: 403 } });
		await vi.waitFor(() => expect(a.status).toBe('guest'));
	});

	it('keluar menghapus cache', async () => {
		const f = clientPalsu();
		const s = memori();
		const a = new AuthState(f.client, s);
		a.start();
		f.emit(sesi('u1'));
		await f.jawab('profiles', { data: kasir, error: null });
		await f.jawab('outlets', { data: outlet, error: null });
		await vi.waitFor(() => expect(a.status).toBe('ready'));
		await a.signOut();
		expect(s.getItem('dk-profil')).toBeNull();
	});
});
```

- [ ] **Step 6: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/auth/auth-state.test.ts`
Expected: FAIL pada test baru (`offline` undefined / status guest).

- [ ] **Step 7: Ubah AuthState**

Di `src/lib/auth/auth-state.svelte.ts`:

1. Tambah impor: `import { bacaCache, galatJaringan, hapusCache, simpanCache, type Penyimpan } from './cache-profil.ts';`
2. Tambah field & konstruktor:
```ts
	/** true bila data dipakai dari perangkat karena server tidak terjangkau. */
	offline = $state(false);
	#penyimpan: Penyimpan | null;
	#sesiTerakhir: Session | null = null;

	constructor(client: SupabaseClient, penyimpan: Penyimpan | null = null) {
		this.#client = client;
		this.#penyimpan = penyimpan;
	}
```
(ganti konstruktor lama.)
3. Di `#apply`, simpan sesi: tepat setelah `if (gen !== this.#gen) return;` pertama, tambahkan `this.#sesiTerakhir = session;`.
4. Ganti `if (res.error) return this.#keluarLokal(pesanErrorLogin(res.error));` dengan:
```ts
		if (res.error) return this.#gagalMuat(res.error, session.user.id);
```
dan ganti `if (o.error || !o.data) return this.#keluarLokal(pesanErrorLogin(o.error) ?? 'Outlet akun tidak ditemukan. Hubungi admin.');` dengan:
```ts
			if (o.error) return this.#gagalMuat(o.error, session.user.id);
			if (!o.data) return this.#keluarLokal('Outlet akun tidak ditemukan. Hubungi admin.');
```
5. Tepat sebelum `this.profile = profile;` di akhir `#apply`, tambahkan:
```ts
		if (this.#penyimpan) simpanCache(this.#penyimpan, session.user.id, profile, outlet);
		this.offline = false;
```
6. Tambah metode privat & publik:
```ts
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
		if (!this.#sesiTerakhir) return;
		const gen = ++this.#gen;
		setTimeout(() => void this.#apply(this.#sesiTerakhir, gen), 0);
	}
```
7. Di `#keluarLokal`, tambahkan di awal: `if (this.#penyimpan) hapusCache(this.#penyimpan);` dan `this.offline = false;`.

`src/lib/auth/session.svelte.ts` (ganti seluruh isi):
```ts
import { supabase } from '#lib/supabase/client.ts';
import { AuthState } from './auth-state.svelte.ts';

const penyimpan = typeof localStorage === 'undefined' ? null : localStorage;

/** Satu-satunya status sesi aplikasi, terhubung ke project Supabase sungguhan. */
export const auth = new AuthState(supabase, penyimpan);

if (typeof window !== 'undefined') {
	window.addEventListener('online', () => auth.cobaLagi());
}
```

- [ ] **Step 8: Jalankan, pastikan lulus; suite; commit**

Run: `npx vitest run src/lib/auth && npm test && npm run check`
Expected: PASS, 0 error.

```bash
git add src/lib/auth
git commit -m "feat(auth): tetap login saat internet putus (profil disimpan di perangkat)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Skema penjualan, shift, nomor harian + RLS baca

**Files:**
- Create: `supabase/migrations/20261005000008_penjualan.sql`, `tests/db/harness-kasir.ts`, `tests/db/penjualan-skema.test.ts`

**Interfaces:**
- Produces (SQL): enum `metode_bayar` (`cash`,`qris`,`gofood`,`grabfood`,`shopeefood`); tabel `shift(id, outlet_id, dibuka_oleh, dibuka_at, modal, ditutup_oleh, ditutup_at, uang_fisik, catatan)` (maks satu terbuka per outlet); `penjualan(id, outlet_id, shift_id, kasir_id, nomor unik, waktu, metode, total, diterima, kembalian, void_at, void_oleh, void_alasan)`; `penjualan_item(penjualan_id, menu_id, nama, harga, qty, subtotal generated)`; `nomor_harian(outlet_id, tanggal, terakhir)`; fungsi `tanggal_wib(timestamptz) returns date`.
- Produces (test helper `tests/db/harness-kasir.ts`): `idOutlet(db, kode)`, `idMenu(db, kode)`, `shiftLangsung(db, outletKode, olehId, modal?)` (insert sebagai superuser, untuk menyiapkan data).

- [ ] **Step 1: Tes skema (gagal dulu)**

`tests/db/harness-kasir.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';

export async function idOutlet(db: PGlite, kode: string): Promise<string> {
	return (await db.query<{ id: string }>('select id from public.outlets where kode = $1', [kode])).rows[0].id;
}
export async function idMenu(db: PGlite, kode: string): Promise<string> {
	return (await db.query<{ id: string }>('select id from public.menu where kode = $1', [kode])).rows[0].id;
}
/** Menyiapkan shift terbuka langsung (superuser) untuk tes yang tidak menguji buka_shift. */
export async function shiftLangsung(db: PGlite, outletKode: string, olehId: string, modal = 0): Promise<string> {
	const o = await idOutlet(db, outletKode);
	return (
		await db.query<{ id: string }>('insert into public.shift (outlet_id, dibuka_oleh, modal) values ($1, $2, $3) returning id', [o, olehId, modal])
	).rows[0].id;
}
```

`tests/db/penjualan-skema.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';
import { idMenu, idOutlet, shiftLangsung } from './harness-kasir';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
});

async function penjualanLangsung(outlet: string, shift: string, kasir: string, nomor: string) {
	const o = await idOutlet(db, outlet);
	const id = crypto.randomUUID();
	await db.query(
		`insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, metode, total) values ($1, $2, $3, $4, $5, 'qris', 11000)`,
		[id, o, shift, kasir, nomor]
	);
	await db.query(`insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty) values ($1, $2, 'Dada Ori', 11000, 1)`, [
		id,
		await idMenu(db, 'ori_dada')
	]);
	return id;
}

describe('skema penjualan', () => {
	it('tanggal_wib: 17:30 UTC = keesokan hari di WIB', async () => {
		const { rows } = await db.query<{ d: string }>(`select public.tanggal_wib('2026-10-04 17:30:00+00')::text as d`);
		expect(rows[0].d).toBe('2026-10-05');
	});

	it('hanya satu shift terbuka per outlet', async () => {
		await shiftLangsung(db, 'BL', kasirBL);
		await expect(shiftLangsung(db, 'BL', kasirBL)).rejects.toThrow(/shift_satu_terbuka/);
		await expect(shiftLangsung(db, 'TK', kasirTK)).resolves.toBeTruthy();
	});

	it('subtotal dihitung database', async () => {
		const s = await shiftLangsung(db, 'BL', kasirBL);
		const p = await penjualanLangsung('BL', s, kasirBL, 'BL-261005-001');
		await db.query('update public.penjualan_item set qty = 3 where penjualan_id = $1', [p]);
		const { rows } = await db.query<{ subtotal: number }>('select subtotal from public.penjualan_item where penjualan_id = $1', [p]);
		expect(rows[0].subtotal).toBe(33000);
	});

	it('cash wajib mencatat uang diterima ≥ total', async () => {
		const s = await shiftLangsung(db, 'BL', kasirBL);
		const o = await idOutlet(db, 'BL');
		await expect(
			db.query(
				`insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, metode, total, diterima, kembalian) values ($1, $2, $3, $4, 'BL-X', 'cash', 11000, 10000, 0)`,
				[crypto.randomUUID(), o, s, kasirBL]
			)
		).rejects.toThrow(/penjualan_cash_check/);
	});
});

describe('RLS baca penjualan', () => {
	it('kasir hanya melihat shift & penjualan outletnya; admin semua', async () => {
		const sBL = await shiftLangsung(db, 'BL', kasirBL);
		const sTK = await shiftLangsung(db, 'TK', kasirTK);
		await penjualanLangsung('BL', sBL, kasirBL, 'BL-261005-001');
		await penjualanLangsung('TK', sTK, kasirTK, 'TK-261005-001');
		const bl = await sebagai(db, kasirBL, async () => [
			(await db.query('select 1 from public.shift')).rows.length,
			(await db.query<{ nomor: string }>('select nomor from public.penjualan')).rows.map((r) => r.nomor),
			(await db.query('select 1 from public.penjualan_item')).rows.length
		]);
		expect(bl).toEqual([1, ['BL-261005-001'], 1]);
		const adm = await sebagai(db, adminId, async () => (await db.query('select 1 from public.penjualan')).rows.length);
		expect(adm).toBe(2);
	});

	it('tidak ada yang bisa menulis langsung (hanya lewat fungsi)', async () => {
		const s = await shiftLangsung(db, 'BL', kasirBL);
		await expect(sebagai(db, kasirBL, () => db.query('update public.shift set modal = 1 where id = $1', [s]))).rejects.toThrow(
			/permission denied/
		);
		await expect(sebagai(db, adminId, () => db.query('delete from public.shift where id = $1', [s]))).rejects.toThrow(/permission denied/);
		await expect(sebagai(db, kasirBL, () => db.query('select 1 from public.nomor_harian'))).rejects.toThrow(/permission denied/);
	});

	it('pengunjung tanpa login tidak punya izin', async () => {
		await expect(sebagaiAnon(db, () => db.query('select 1 from public.penjualan'))).rejects.toThrow(/permission denied/);
	});

	it('menu yang sudah terjual tidak bisa dihapus (riwayat aman)', async () => {
		const s = await shiftLangsung(db, 'BL', kasirBL);
		await penjualanLangsung('BL', s, kasirBL, 'BL-261005-001');
		await expect(db.query(`delete from public.menu where kode = 'ori_dada'`)).rejects.toThrow(/penjualan_item_menu_id_fkey/);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/penjualan-skema.test.ts`
Expected: FAIL (`function public.tanggal_wib` / `relation public.shift` tidak ada).

- [ ] **Step 3: Migrasi skema**

`supabase/migrations/20261005000008_penjualan.sql`:
```sql
-- Penjualan kasir: shift (modal & tutup toko), penjualan + item, nomor harian per outlet.
-- Pengguna login hanya MEMBACA (RLS); semua penulisan lewat fungsi di migrasi 0009.

create type public.metode_bayar as enum ('cash', 'qris', 'gofood', 'grabfood', 'shopeefood');

-- Tanggal bisnis WIB (UTC+7, tanpa musim panas).
create function public.tanggal_wib(t timestamptz) returns date
language sql immutable set search_path = '' as $$
  select (t at time zone 'Asia/Jakarta')::date
$$;

create table public.shift (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  dibuka_oleh uuid not null references public.profiles (id) on delete restrict,
  dibuka_at timestamptz not null default now(),
  modal integer not null default 0 check (modal >= 0 and modal <= 100000000),
  ditutup_oleh uuid references public.profiles (id) on delete restrict,
  ditutup_at timestamptz,
  uang_fisik integer check (uang_fisik is null or (uang_fisik >= 0 and uang_fisik <= 1000000000)),
  catatan text check (catatan is null or length(catatan) <= 500),
  constraint shift_tutup_lengkap check ((ditutup_at is null) = (ditutup_oleh is null) and (ditutup_at is null) = (uang_fisik is null))
);
create unique index shift_satu_terbuka on public.shift (outlet_id) where ditutup_at is null;

create table public.penjualan (
  id uuid primary key,
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  shift_id uuid not null references public.shift (id) on delete restrict,
  kasir_id uuid not null references public.profiles (id) on delete restrict,
  nomor text not null unique,
  waktu timestamptz not null default now(),
  metode public.metode_bayar not null,
  total integer not null check (total >= 0),
  diterima integer,
  kembalian integer,
  void_at timestamptz,
  void_oleh uuid references public.profiles (id) on delete restrict,
  void_alasan text,
  constraint penjualan_cash check (
    (metode = 'cash' and diterima is not null and diterima >= total and kembalian = diterima - total)
    or (metode <> 'cash' and diterima is null and kembalian is null)
  ),
  constraint penjualan_void_lengkap check (
    (void_at is null and void_oleh is null and void_alasan is null)
    or (void_at is not null and void_oleh is not null and length(trim(void_alasan)) >= 3)
  )
);
create index penjualan_outlet_waktu on public.penjualan (outlet_id, waktu);
create index penjualan_shift on public.penjualan (shift_id);

create table public.penjualan_item (
  penjualan_id uuid not null references public.penjualan (id) on delete restrict,
  menu_id uuid not null references public.menu (id) on delete restrict,
  nama text not null,
  harga integer not null check (harga >= 0),
  qty integer not null check (qty between 1 and 999),
  subtotal integer generated always as (harga * qty) stored,
  primary key (penjualan_id, menu_id)
);

create table public.nomor_harian (
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  tanggal date not null,
  terakhir integer not null,
  primary key (outlet_id, tanggal)
);

alter table public.shift enable row level security;
alter table public.penjualan enable row level security;
alter table public.penjualan_item enable row level security;
alter table public.nomor_harian enable row level security;

revoke all on public.shift, public.penjualan, public.penjualan_item, public.nomor_harian from anon, authenticated;
grant select on public.shift, public.penjualan, public.penjualan_item to authenticated;
grant all on public.shift, public.penjualan, public.penjualan_item, public.nomor_harian to service_role;

create policy shift_baca on public.shift for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy penjualan_baca on public.penjualan for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy penjualan_item_baca on public.penjualan_item for select to authenticated
  using (exists (select 1 from public.penjualan p where p.id = penjualan_id));
```

- [ ] **Step 4: Jalankan, pastikan lulus; suite; commit**

Run: `npx vitest run tests/db/penjualan-skema.test.ts && npm test`
Expected: PASS.

```bash
git add supabase/migrations/20261005000008_penjualan.sql tests/db/harness-kasir.ts tests/db/penjualan-skema.test.ts
git commit -m "feat(db): skema shift, penjualan, item, nomor harian + RLS baca

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Fungsi kasir di database

**Files:**
- Create: `supabase/migrations/20261005000009_fungsi_kasir.sql`, `tests/db/penjualan.test.ts`

**Interfaces:**
- Consumes: tabel Task 2; `is_admin()`, `my_outlet_id()`; `harga_jual`, `menu`, `outlets`.
- Produces (RPC, semua `security definer`, hak `execute` hanya `authenticated`):
  - `buka_shift(p_outlet uuid, p_modal integer) returns uuid` — idempoten: bila sudah ada shift terbuka, mengembalikan id-nya.
  - `catat_penjualan(p jsonb) returns jsonb` — `p = {id, outlet_id, metode, diterima?, waktu?, item: [{menu_id, qty}]}`; kembali `{id, nomor, total, kembalian, waktu, ulang}`.
  - `void_penjualan(p_id uuid, p_alasan text) returns void`
  - `tutup_shift(p_shift uuid, p_uang_fisik integer, p_catatan text) returns jsonb` (ringkasan)
  - `ringkasan_shift(p_shift uuid) returns jsonb` — `{shift_id, outlet_id, modal, dibuka_at, ditutup_at, jumlah_transaksi, jumlah_void, total, per_metode: {cash|qris|gofood|grabfood|shopeefood: {jumlah, total}}, cash_seharusnya, uang_fisik, selisih}`

- [ ] **Step 1: Tes fungsi (gagal dulu)**

`tests/db/penjualan.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai } from './harness';
import { idMenu, idOutlet } from './harness-kasir';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
});

type Hasil = { id: string; nomor: string; total: number; kembalian: number | null; ulang: boolean };

async function rpc<T>(oleh: string, sql: string, params: unknown[]): Promise<T> {
	return sebagai(db, oleh, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0].r);
}
const buka = (oleh: string, outlet: string, modal = 200000) => rpc<string>(oleh, 'public.buka_shift($1, $2)', [outlet, modal]);
const jual = (oleh: string, p: Record<string, unknown>) => rpc<Hasil>(oleh, 'public.catat_penjualan($1::jsonb)', [JSON.stringify(p)]);

async function pesanan(outletKode: string, item: [string, number][], metode = 'qris', diterima?: number) {
	return {
		id: crypto.randomUUID(),
		outlet_id: await idOutlet(db, outletKode),
		metode,
		...(diterima !== undefined ? { diterima } : {}),
		item: await Promise.all(item.map(async ([kode, qty]) => ({ menu_id: await idMenu(db, kode), qty })))
	};
}

describe('buka_shift', () => {
	it('kasir membuka shift outletnya; panggilan kedua mengembalikan shift yang sama', async () => {
		const bl = await idOutlet(db, 'BL');
		const a = await buka(kasirBL, bl);
		const b = await buka(kasirBL, bl, 999);
		expect(b).toBe(a);
		const { rows } = await db.query<{ modal: number }>('select modal from public.shift where id = $1', [a]);
		expect(rows[0].modal).toBe(200000);
	});
	it('kasir tidak bisa membuka shift outlet lain', async () => {
		await expect(buka(kasirBL, await idOutlet(db, 'TK'))).rejects.toThrow(/tidak berhak/);
	});
	it('modal negatif ditolak', async () => {
		await expect(buka(kasirBL, await idOutlet(db, 'BL'), -1)).rejects.toThrow(/Modal/);
	});
});

describe('catat_penjualan', () => {
	beforeEach(async () => {
		await buka(kasirBL, await idOutlet(db, 'BL'));
	});

	it('harga & total dihitung server dari harga outlet; harga dari klien diabaikan', async () => {
		const p = await pesanan('BL', [
			['ori_dada', 2],
			['nasi', 1],
			['box', 1]
		]);
		(p.item[0] as Record<string, unknown>).harga = 1;
		const r = await jual(kasirBL, { ...p, total: 5 });
		expect(r.total).toBe(2 * 11000 + 5000 + 1000);
		expect(r.nomor).toMatch(/^BL-\d{6}-001$/);
		const { rows } = await db.query<{ harga: number; qty: number }>(
			'select harga, qty from public.penjualan_item where penjualan_id = $1 order by harga desc',
			[p.id]
		);
		expect(rows).toEqual([
			{ harga: 11000, qty: 2 },
			{ harga: 5000, qty: 1 },
			{ harga: 1000, qty: 1 }
		]);
	});

	it('item menu yang sama digabung', async () => {
		const p = await pesanan('BL', [
			['ori_dada', 1],
			['ori_dada', 2]
		]);
		const r = await jual(kasirBL, p);
		expect(r.total).toBe(33000);
		const { rows } = await db.query<{ qty: number }>('select qty from public.penjualan_item where penjualan_id = $1', [p.id]);
		expect(rows).toEqual([{ qty: 3 }]);
	});

	it('cash: kembalian dihitung; uang kurang ditolak', async () => {
		const r = await jual(kasirBL, await pesanan('BL', [['ori_dada', 1]], 'cash', 20000));
		expect(r.kembalian).toBe(9000);
		await expect(jual(kasirBL, await pesanan('BL', [['ori_dada', 1]], 'cash', 10000))).rejects.toThrow(/kurang dari total/);
		await expect(jual(kasirBL, await pesanan('BL', [['ori_dada', 1]], 'cash'))).rejects.toThrow(/kurang dari total/);
	});

	it('non-cash tidak menyimpan uang diterima', async () => {
		const p = await pesanan('BL', [['ori_dada', 1]], 'gofood', 50000);
		const r = await jual(kasirBL, p);
		expect(r.kembalian).toBeNull();
		const { rows } = await db.query<{ diterima: number | null }>('select diterima from public.penjualan where id = $1', [p.id]);
		expect(rows[0].diterima).toBeNull();
	});

	it('terkirim dua kali → tercatat sekali, nomor sama', async () => {
		const p = await pesanan('BL', [['ori_dada', 1]]);
		const a = await jual(kasirBL, p);
		const b = await jual(kasirBL, p);
		expect(b.nomor).toBe(a.nomor);
		expect(b.ulang).toBe(true);
		const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.penjualan');
		expect(rows[0].n).toBe(1);
	});

	it('nomor berurutan per outlet per hari', async () => {
		const a = await jual(kasirBL, await pesanan('BL', [['nasi', 1]]));
		const b = await jual(kasirBL, await pesanan('BL', [['nasi', 1]]));
		expect([a.nomor.slice(-3), b.nomor.slice(-3)]).toEqual(['001', '002']);
	});

	it('kasir tidak bisa mencatat untuk outlet lain', async () => {
		await buka(kasirTK, await idOutlet(db, 'TK'));
		await expect(jual(kasirBL, await pesanan('TK', [['nasi', 1]]))).rejects.toThrow(/tidak berhak/);
	});

	it('menu nonaktif atau tanpa harga di outlet ditolak', async () => {
		await db.query(`update public.menu set aktif = false where kode = 'box'`);
		await expect(jual(kasirBL, await pesanan('BL', [['box', 1]]))).rejects.toThrow(/Menu tidak tersedia/);
		await db.query(`update public.menu set aktif = true where kode = 'box'`);
		await db.query(`delete from public.harga_jual where outlet_id = $1 and menu_id = $2`, [await idOutlet(db, 'BL'), await idMenu(db, 'box')]);
		await expect(jual(kasirBL, await pesanan('BL', [['box', 1]]))).rejects.toThrow(/Menu tidak tersedia/);
	});

	it('jumlah tidak sah atau keranjang kosong ditolak', async () => {
		await expect(jual(kasirBL, await pesanan('BL', [['nasi', 0]]))).rejects.toThrow(/Jumlah item/);
		await expect(jual(kasirBL, { ...(await pesanan('BL', [])) })).rejects.toThrow(/minimal satu item/);
	});

	it('tanpa shift terbuka ditolak', async () => {
		await expect(jual(kasirTK, await pesanan('TK', [['nasi', 1]]))).rejects.toThrow(/Shift belum dibuka/);
	});

	it('waktu dari perangkat dipakai bila wajar, diganti waktu server bila tidak', async () => {
		const tadi = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		const p1 = await pesanan('BL', [['nasi', 1]]);
		await jual(kasirBL, { ...p1, waktu: tadi });
		const p2 = await pesanan('BL', [['nasi', 1]]);
		await jual(kasirBL, { ...p2, waktu: '2020-01-01T00:00:00Z' });
		const { rows } = await db.query<{ id: string; lama: boolean }>(
			`select id, waktu < now() - interval '30 minutes' as lama from public.penjualan`
		);
		const lama = Object.fromEntries(rows.map((r) => [r.id, r.lama]));
		expect(lama[p1.id]).toBe(true);
		expect(lama[p2.id]).toBe(false);
	});
});

describe('void_penjualan', () => {
	let jualId: string;
	beforeEach(async () => {
		await buka(kasirBL, await idOutlet(db, 'BL'));
		const p = await pesanan('BL', [['ori_dada', 1]], 'cash', 11000);
		await jual(kasirBL, p);
		jualId = p.id;
	});

	it('kasir membatalkan dalam shift yang sama dengan alasan', async () => {
		await rpc(kasirBL, 'public.void_penjualan($1, $2)', [jualId, 'Salah input']);
		const { rows } = await db.query<{ void_alasan: string }>('select void_alasan from public.penjualan where id = $1', [jualId]);
		expect(rows[0].void_alasan).toBe('Salah input');
	});
	it('alasan wajib dan tidak bisa dibatalkan dua kali', async () => {
		await expect(rpc(kasirBL, 'public.void_penjualan($1, $2)', [jualId, ' '])).rejects.toThrow(/Alasan/);
		await rpc(kasirBL, 'public.void_penjualan($1, $2)', [jualId, 'Salah input']);
		await expect(rpc(kasirBL, 'public.void_penjualan($1, $2)', [jualId, 'Lagi'])).rejects.toThrow(/sudah dibatalkan/);
	});
	it('kasir outlet lain ditolak', async () => {
		await expect(rpc(kasirTK, 'public.void_penjualan($1, $2)', [jualId, 'Coba'])).rejects.toThrow(/tidak ditemukan|tidak berhak/);
	});
	it('setelah shift ditutup hanya admin yang boleh', async () => {
		const { rows } = await db.query<{ id: string }>('select shift_id as id from public.penjualan where id = $1', [jualId]);
		await rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [rows[0].id, 211000, null]);
		await expect(rpc(kasirBL, 'public.void_penjualan($1, $2)', [jualId, 'Telat'])).rejects.toThrow(/hanya bisa dibatalkan admin/);
		await rpc(adminId, 'public.void_penjualan($1, $2)', [jualId, 'Koreksi admin']);
	});
});

describe('tutup_shift & ringkasan', () => {
	it('ringkasan per metode, void tidak dihitung, selisih kas', async () => {
		const shift = await buka(kasirBL, await idOutlet(db, 'BL'), 100000);
		await jual(kasirBL, await pesanan('BL', [['ori_dada', 1]], 'cash', 20000));
		await jual(kasirBL, await pesanan('BL', [['nasi', 2]], 'qris'));
		const batal = await pesanan('BL', [['kulit', 1]], 'cash', 9000);
		await jual(kasirBL, batal);
		await rpc(kasirBL, 'public.void_penjualan($1, $2)', [batal.id, 'Salah input']);
		const r = await rpc<Record<string, unknown>>(kasirBL, 'public.tutup_shift($1, $2, $3)', [shift, 110000, 'Kurang seribu']);
		expect(r).toMatchObject({
			modal: 100000,
			jumlah_transaksi: 2,
			jumlah_void: 1,
			total: 21000,
			cash_seharusnya: 111000,
			uang_fisik: 110000,
			selisih: -1000
		});
		expect((r.per_metode as Record<string, { jumlah: number; total: number }>).cash).toEqual({ jumlah: 1, total: 11000 });
		expect((r.per_metode as Record<string, { jumlah: number; total: number }>).qris).toEqual({ jumlah: 1, total: 10000 });
		expect((r.per_metode as Record<string, { jumlah: number; total: number }>).gofood).toEqual({ jumlah: 0, total: 0 });
	});
	it('shift yang sudah ditutup tidak bisa ditutup lagi; setelah tutup bisa buka baru', async () => {
		const bl = await idOutlet(db, 'BL');
		const s = await buka(kasirBL, bl);
		await rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [s, 0, null]);
		await expect(rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [s, 0, null])).rejects.toThrow(/sudah ditutup/);
		const s2 = await buka(kasirBL, bl);
		expect(s2).not.toBe(s);
	});
	it('kasir tidak bisa menutup shift outlet lain', async () => {
		const s = await buka(kasirTK, await idOutlet(db, 'TK'));
		await expect(rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [s, 0, null])).rejects.toThrow(/tidak ditemukan|tidak berhak/);
	});
});

describe('hak fungsi', () => {
	it('fungsi bantu internal tidak bisa dipanggil pengguna', async () => {
		await expect(rpc(kasirBL, 'public._cek_akses_outlet($1)', [await idOutlet(db, 'BL')])).rejects.toThrow(/permission denied/);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/penjualan.test.ts`
Expected: FAIL (`function public.buka_shift does not exist`).

- [ ] **Step 3: Migrasi fungsi**

`supabase/migrations/20261005000009_fungsi_kasir.sql`:
```sql
-- Fungsi kasir. security definer karena tabel transaksi tidak bisa ditulis langsung;
-- setiap fungsi memeriksa hak akses pemanggil sendiri.

create function public._cek_akses_outlet(p_outlet uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_outlet is null or not (public.is_admin() or public.my_outlet_id() = p_outlet) then
    raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
  end if;
end
$$;

create function public.buka_shift(p_outlet uuid, p_modal integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public._cek_akses_outlet(p_outlet);
  if p_modal is null or p_modal < 0 or p_modal > 100000000 then
    raise exception 'Modal kembalian tidak sah' using errcode = '22023';
  end if;
  insert into public.shift (outlet_id, dibuka_oleh, modal)
  values (p_outlet, auth.uid(), p_modal)
  on conflict (outlet_id) where ditutup_at is null do nothing;
  select id into v_id from public.shift where outlet_id = p_outlet and ditutup_at is null;
  return v_id;
end
$$;

create function public.catat_penjualan(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_metode public.metode_bayar := (p ->> 'metode')::public.metode_bayar;
  v_diterima integer := (p ->> 'diterima')::integer;
  v_waktu timestamptz := coalesce((p ->> 'waktu')::timestamptz, now());
  v_ada public.penjualan;
  v_shift uuid;
  v_minta integer;
  v_cocok integer;
  v_qty_sah boolean;
  v_total integer;
  v_kembalian integer;
  v_kode text;
  v_urut integer;
  v_nomor text;
begin
  if v_id is null or v_outlet is null or v_metode is null then
    raise exception 'Data penjualan tidak lengkap' using errcode = '22023';
  end if;
  perform public._cek_akses_outlet(v_outlet);

  -- Idempoten: ID dibuat di perangkat; kiriman ulang mengembalikan hasil pertama.
  select * into v_ada from public.penjualan where id = v_id;
  if found then
    return jsonb_build_object('id', v_ada.id, 'nomor', v_ada.nomor, 'total', v_ada.total,
      'kembalian', v_ada.kembalian, 'waktu', v_ada.waktu, 'ulang', true);
  end if;

  -- Waktu dari perangkat dipakai bila wajar (persiapan offline), selain itu waktu server.
  if v_waktu > now() + interval '5 minutes' or v_waktu < now() - interval '7 days' then
    v_waktu := now();
  end if;

  select id into v_shift from public.shift where outlet_id = v_outlet and ditutup_at is null;
  if v_shift is null then
    raise exception 'Shift belum dibuka' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'item') is distinct from 'array' or jsonb_array_length(p -> 'item') = 0 then
    raise exception 'Penjualan minimal satu item' using errcode = '22023';
  end if;

  with i as (
    select menu_id, sum(qty)::integer as qty, bool_and(qty between 1 and 999) as sah
    from jsonb_to_recordset(p -> 'item') as x (menu_id uuid, qty integer)
    group by menu_id
  )
  select count(*), count(h.menu_id), coalesce(bool_and(i.sah and i.qty <= 999), false), coalesce(sum(h.harga * i.qty), 0)
  into v_minta, v_cocok, v_qty_sah, v_total
  from i
  left join public.menu m on m.id = i.menu_id and m.aktif
  left join public.harga_jual h on h.menu_id = m.id and h.outlet_id = v_outlet;

  if not v_qty_sah then
    raise exception 'Jumlah item tidak sah' using errcode = '22023';
  end if;
  if v_cocok <> v_minta then
    raise exception 'Menu tidak tersedia di outlet ini' using errcode = '22023';
  end if;

  if v_metode = 'cash' then
    if v_diterima is null or v_diterima < v_total then
      raise exception 'Uang diterima kurang dari total' using errcode = '22023';
    end if;
    v_kembalian := v_diterima - v_total;
  else
    v_diterima := null;
    v_kembalian := null;
  end if;

  select kode into v_kode from public.outlets where id = v_outlet;
  insert into public.nomor_harian (outlet_id, tanggal, terakhir)
  values (v_outlet, public.tanggal_wib(v_waktu), 1)
  on conflict (outlet_id, tanggal) do update set terakhir = public.nomor_harian.terakhir + 1
  returning terakhir into v_urut;
  v_nomor := v_kode || '-' || to_char(v_waktu at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || lpad(v_urut::text, 3, '0');

  insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, metode, total, diterima, kembalian)
  values (v_id, v_outlet, v_shift, auth.uid(), v_nomor, v_waktu, v_metode, v_total, v_diterima, v_kembalian);

  insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty)
  select v_id, m.id, m.nama, h.harga, sum(x.qty)::integer
  from jsonb_to_recordset(p -> 'item') as x (menu_id uuid, qty integer)
  join public.menu m on m.id = x.menu_id
  join public.harga_jual h on h.menu_id = m.id and h.outlet_id = v_outlet
  group by m.id, m.nama, h.harga;

  return jsonb_build_object('id', v_id, 'nomor', v_nomor, 'total', v_total,
    'kembalian', v_kembalian, 'waktu', v_waktu, 'ulang', false);
end
$$;

create function public.void_penjualan(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.penjualan;
  v_tutup timestamptz;
begin
  select * into v from public.penjualan where id = p_id;
  if not found or not (public.is_admin() or public.my_outlet_id() = v.outlet_id) then
    raise exception 'Penjualan tidak ditemukan' using errcode = '22023';
  end if;
  if v.void_at is not null then
    raise exception 'Penjualan sudah dibatalkan' using errcode = '22023';
  end if;
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  select ditutup_at into v_tutup from public.shift where id = v.shift_id;
  if v_tutup is not null and not public.is_admin() then
    raise exception 'Penjualan dari shift yang sudah ditutup hanya bisa dibatalkan admin' using errcode = '42501';
  end if;
  update public.penjualan
  set void_at = now(), void_oleh = auth.uid(), void_alasan = trim(p_alasan)
  where id = p_id;
end
$$;

create function public.ringkasan_shift(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.shift;
  v_metode jsonb;
  v_jumlah integer;
  v_void integer;
  v_total integer;
  v_cash integer;
begin
  select * into s from public.shift where id = p_shift;
  if not found or not (public.is_admin() or public.my_outlet_id() = s.outlet_id) then
    raise exception 'Shift tidak ditemukan' using errcode = '22023';
  end if;
  select jsonb_object_agg(m.metode, jsonb_build_object('jumlah', coalesce(x.jumlah, 0), 'total', coalesce(x.total, 0)))
  into v_metode
  from unnest(enum_range(null::public.metode_bayar)) as m (metode)
  left join (
    select metode, count(*)::integer as jumlah, sum(total)::integer as total
    from public.penjualan where shift_id = p_shift and void_at is null group by metode
  ) x on x.metode = m.metode;
  select count(*) filter (where void_at is null), count(*) filter (where void_at is not null),
         coalesce(sum(total) filter (where void_at is null), 0),
         coalesce(sum(total) filter (where void_at is null and metode = 'cash'), 0)
  into v_jumlah, v_void, v_total, v_cash
  from public.penjualan where shift_id = p_shift;
  return jsonb_build_object(
    'shift_id', s.id, 'outlet_id', s.outlet_id, 'modal', s.modal, 'dibuka_at', s.dibuka_at, 'ditutup_at', s.ditutup_at,
    'jumlah_transaksi', v_jumlah, 'jumlah_void', v_void, 'total', v_total, 'per_metode', v_metode,
    'cash_seharusnya', s.modal + v_cash, 'uang_fisik', s.uang_fisik,
    'selisih', case when s.uang_fisik is null then null else s.uang_fisik - (s.modal + v_cash) end
  );
end
$$;

create function public.tutup_shift(p_shift uuid, p_uang_fisik integer, p_catatan text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.shift;
begin
  select * into s from public.shift where id = p_shift for update;
  if not found or not (public.is_admin() or public.my_outlet_id() = s.outlet_id) then
    raise exception 'Shift tidak ditemukan' using errcode = '22023';
  end if;
  if s.ditutup_at is not null then
    raise exception 'Shift sudah ditutup' using errcode = '22023';
  end if;
  if p_uang_fisik is null or p_uang_fisik < 0 or p_uang_fisik > 1000000000 then
    raise exception 'Jumlah uang di laci tidak sah' using errcode = '22023';
  end if;
  update public.shift
  set ditutup_at = now(), ditutup_oleh = auth.uid(), uang_fisik = p_uang_fisik,
      catatan = nullif(trim(coalesce(p_catatan, '')), '')
  where id = p_shift;
  return public.ringkasan_shift(p_shift);
end
$$;

revoke execute on function public._cek_akses_outlet(uuid) from public, anon, authenticated;
revoke execute on function public.buka_shift(uuid, integer) from public, anon;
revoke execute on function public.catat_penjualan(jsonb) from public, anon;
revoke execute on function public.void_penjualan(uuid, text) from public, anon;
revoke execute on function public.ringkasan_shift(uuid) from public, anon;
revoke execute on function public.tutup_shift(uuid, integer, text) from public, anon;
grant execute on function public.buka_shift(uuid, integer) to authenticated;
grant execute on function public.catat_penjualan(jsonb) to authenticated;
grant execute on function public.void_penjualan(uuid, text) to authenticated;
grant execute on function public.ringkasan_shift(uuid) to authenticated;
grant execute on function public.tutup_shift(uuid, integer, text) to authenticated;
```

- [ ] **Step 4: Jalankan, pastikan lulus; suite; commit**

Run: `npx vitest run tests/db && npm test`
Expected: PASS.

```bash
git add supabase/migrations/20261005000009_fungsi_kasir.sql tests/db/penjualan.test.ts
git commit -m "feat(db): fungsi kasir — buka shift, catat penjualan (harga server, idempoten, nomor harian), void, tutup shift

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Logika murni kasir (keranjang, bayar, waktu)

**Files:**
- Create: `src/lib/kasir/types.ts`, `src/lib/kasir/keranjang.ts`, `src/lib/kasir/bayar.ts`, `src/lib/kasir/waktu.ts`
- Test: `src/lib/kasir/keranjang.test.ts`, `src/lib/kasir/bayar.test.ts`, `src/lib/kasir/waktu.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `type Metode = 'cash'|'qris'|'gofood'|'grabfood'|'shopeefood'`; `interface MenuJual { id; kode; nama; kategori: KategoriMenu; varian: 'ori'|'hot'|null; urutan; harga: number }`; `interface BarisKeranjang { menu_id; nama; harga; qty }`; `interface Shift { id; outlet_id; dibuka_at; modal; ditutup_at: string|null }`; `interface PenjualanRiwayat { id; nomor; waktu; metode: Metode; total; diterima: number|null; kembalian: number|null; void_at: string|null; void_alasan: string|null; item: { nama: string; harga: number; qty: number }[] }`; `interface Ringkasan { shift_id; outlet_id; modal; dibuka_at; ditutup_at: string|null; jumlah_transaksi; jumlah_void; total; per_metode: Record<Metode, { jumlah: number; total: number }>; cash_seharusnya; uang_fisik: number|null; selisih: number|null }`; `interface HasilJual { id; nomor; total; kembalian: number|null; waktu: string; ulang: boolean }`
  - `keranjang.ts`: `tambah(k, m: MenuJual, n = 1)`, `ubahQty(k, menuId, qty)`, `tambahNasiBox(k, nasi: MenuJual, box: MenuJual)`, `totalKeranjang(k)`, `jumlahItem(k)` — semuanya immutable, qty dibatasi 1..999.
  - `bayar.ts`: `METODE: readonly { kode: Metode; label: string }[]`, `labelMetode(m: Metode): string`, `kembalian(total, diterima): number | null`, `tombolCepat(total): number[]`
  - `waktu.ts`: `formatWaktuWib(iso: string | Date): string` (`dd/MM/yy HH:mm:ss`), `tanggalWib(iso: string | Date): string` (`YYYY-MM-DD`), `shiftKedaluwarsa(dibukaAt: string, sekarang: Date): boolean`

- [ ] **Step 1: Tes (gagal dulu)**

`src/lib/kasir/keranjang.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { jumlahItem, tambah, tambahNasiBox, totalKeranjang, ubahQty } from './keranjang';
import type { MenuJual } from './types';

const m = (kode: string, harga: number): MenuJual => ({ id: kode, kode, nama: kode, kategori: 'ayam', varian: 'ori', urutan: 0, harga });
const dada = m('dada', 11000);
const nasi = { ...m('nasi', 5000), kategori: 'nasi' as const, varian: null };
const box = { ...m('box', 1000), kategori: 'box' as const, varian: null };

describe('keranjang', () => {
	it('tambah menggabungkan menu yang sama', () => {
		const k = tambah(tambah([], dada), dada);
		expect(k).toEqual([{ menu_id: 'dada', nama: 'dada', harga: 11000, qty: 2 }]);
	});
	it('tidak mengubah keranjang lama (immutable)', () => {
		const a = tambah([], dada);
		tambah(a, dada);
		expect(a[0].qty).toBe(1);
	});
	it('ubahQty: 0 menghapus, dibatasi 999', () => {
		const k = tambah([], dada);
		expect(ubahQty(k, 'dada', 0)).toEqual([]);
		expect(ubahQty(k, 'dada', 5000)[0].qty).toBe(999);
	});
	it('Nasi Box menambah nasi dan box', () => {
		const k = tambahNasiBox(tambah([], dada), nasi, box);
		expect(k.map((b) => [b.menu_id, b.qty])).toEqual([
			['dada', 1],
			['nasi', 1],
			['box', 1]
		]);
	});
	it('total & jumlah item', () => {
		const k = tambahNasiBox(tambah(tambah([], dada), dada), nasi, box);
		expect(totalKeranjang(k)).toBe(28000);
		expect(jumlahItem(k)).toBe(4);
	});
});
```

`src/lib/kasir/bayar.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { kembalian, labelMetode, METODE, tombolCepat } from './bayar';

describe('bayar', () => {
	it('lima metode sesuai spesifikasi', () => {
		expect(METODE.map((m) => m.kode)).toEqual(['cash', 'qris', 'gofood', 'grabfood', 'shopeefood']);
		expect(labelMetode('shopeefood')).toBe('ShopeeFood');
	});
	it('kembalian; uang kurang → null', () => {
		expect(kembalian(40000, 50000)).toBe(10000);
		expect(kembalian(40000, 40000)).toBe(0);
		expect(kembalian(40000, 39000)).toBeNull();
	});
	it('tombol cepat: uang pas lalu pecahan wajar di atasnya, tanpa duplikat', () => {
		expect(tombolCepat(40000)).toEqual([40000, 50000, 100000]);
		expect(tombolCepat(17000)).toEqual([17000, 20000, 50000, 100000]);
		expect(tombolCepat(9000)).toEqual([9000, 10000, 20000, 50000]);
		expect(tombolCepat(0)).toEqual([0]);
	});
});
```

`src/lib/kasir/waktu.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatWaktuWib, shiftKedaluwarsa, tanggalWib } from './waktu';

describe('waktu WIB', () => {
	it('format struk dd/MM/yy HH:mm:ss dalam WIB', () => {
		expect(formatWaktuWib('2026-10-05T05:31:07Z')).toBe('05/10/26 12:31:07');
	});
	it('tanggal WIB berganti pukul 00:00 WIB (17:00 UTC)', () => {
		expect(tanggalWib('2026-10-04T16:59:59Z')).toBe('2026-10-04');
		expect(tanggalWib('2026-10-04T17:00:00Z')).toBe('2026-10-05');
	});
	it('shift dari hari WIB sebelumnya dianggap kedaluwarsa', () => {
		const sekarang = new Date('2026-10-05T02:00:00Z'); // 09:00 WIB 5 Okt
		expect(shiftKedaluwarsa('2026-10-05T00:30:00Z', sekarang)).toBe(false);
		expect(shiftKedaluwarsa('2026-10-04T13:00:00Z', sekarang)).toBe(true);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/kasir`
Expected: FAIL, modul belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/kasir/types.ts`:
```ts
import type { KategoriMenu } from '#lib/master/types.ts';

export type Metode = 'cash' | 'qris' | 'gofood' | 'grabfood' | 'shopeefood';

export interface MenuJual {
	id: string;
	kode: string;
	nama: string;
	kategori: KategoriMenu;
	varian: 'ori' | 'hot' | null;
	urutan: number;
	harga: number;
}

export interface BarisKeranjang {
	menu_id: string;
	nama: string;
	harga: number;
	qty: number;
}

export interface Shift {
	id: string;
	outlet_id: string;
	dibuka_at: string;
	modal: number;
	ditutup_at: string | null;
}

export interface PenjualanRiwayat {
	id: string;
	nomor: string;
	waktu: string;
	metode: Metode;
	total: number;
	diterima: number | null;
	kembalian: number | null;
	void_at: string | null;
	void_alasan: string | null;
	item: { nama: string; harga: number; qty: number }[];
}

export interface Ringkasan {
	shift_id: string;
	outlet_id: string;
	modal: number;
	dibuka_at: string;
	ditutup_at: string | null;
	jumlah_transaksi: number;
	jumlah_void: number;
	total: number;
	per_metode: Record<Metode, { jumlah: number; total: number }>;
	cash_seharusnya: number;
	uang_fisik: number | null;
	selisih: number | null;
}

export interface HasilJual {
	id: string;
	nomor: string;
	total: number;
	kembalian: number | null;
	waktu: string;
	ulang: boolean;
}
```

`src/lib/kasir/keranjang.ts`:
```ts
import type { BarisKeranjang, MenuJual } from './types.ts';

const MAKS = 999;

export function tambah(k: BarisKeranjang[], m: MenuJual, n = 1): BarisKeranjang[] {
	const ada = k.find((b) => b.menu_id === m.id);
	if (!ada) return [...k, { menu_id: m.id, nama: m.nama, harga: m.harga, qty: Math.min(n, MAKS) }];
	return k.map((b) => (b.menu_id === m.id ? { ...b, qty: Math.min(b.qty + n, MAKS) } : b));
}

export function ubahQty(k: BarisKeranjang[], menuId: string, qty: number): BarisKeranjang[] {
	if (qty <= 0) return k.filter((b) => b.menu_id !== menuId);
	return k.map((b) => (b.menu_id === menuId ? { ...b, qty: Math.min(Math.floor(qty), MAKS) } : b));
}

/** Pintasan "Nasi Box": nasi + box sekaligus (ayamnya dipilih terpisah). */
export function tambahNasiBox(k: BarisKeranjang[], nasi: MenuJual, box: MenuJual): BarisKeranjang[] {
	return tambah(tambah(k, nasi), box);
}

export function totalKeranjang(k: BarisKeranjang[]): number {
	return k.reduce((t, b) => t + b.harga * b.qty, 0);
}

export function jumlahItem(k: BarisKeranjang[]): number {
	return k.reduce((t, b) => t + b.qty, 0);
}
```

`src/lib/kasir/bayar.ts`:
```ts
import type { Metode } from './types.ts';

export const METODE: readonly { kode: Metode; label: string }[] = [
	{ kode: 'cash', label: 'Cash' },
	{ kode: 'qris', label: 'QRIS' },
	{ kode: 'gofood', label: 'GoFood' },
	{ kode: 'grabfood', label: 'GrabFood' },
	{ kode: 'shopeefood', label: 'ShopeeFood' }
];

export function labelMetode(m: Metode): string {
	return METODE.find((x) => x.kode === m)?.label ?? m;
}

export function kembalian(total: number, diterima: number): number | null {
	return diterima >= total ? diterima - total : null;
}

/** Uang pas, lalu pecahan yang biasa diterima (dibulatkan ke 5rb/10rb/20rb/50rb/100rb), maksimal 4 tombol. */
export function tombolCepat(total: number): number[] {
	if (total <= 0) return [0];
	const naik = [5000, 10000, 20000, 50000, 100000].map((p) => Math.ceil(total / p) * p);
	return [total, ...new Set(naik.filter((n) => n > total))].sort((a, b) => a - b).slice(0, 4);
}
```

`src/lib/kasir/waktu.ts`:
```ts
const BAGIAN = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Asia/Jakarta',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

function bagian(t: string | Date): Record<string, string> {
	return Object.fromEntries(BAGIAN.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
}

/** Waktu pada struk: dd/MM/yy HH:mm:ss (WIB). */
export function formatWaktuWib(t: string | Date): string {
	const b = bagian(t);
	return `${b.day}/${b.month}/${b.year.slice(-2)} ${b.hour}:${b.minute}:${b.second}`;
}

export function tanggalWib(t: string | Date): string {
	const b = bagian(t);
	return `${b.year}-${b.month}-${b.day}`;
}

/** Shift yang dibuka pada hari WIB sebelumnya harus ditutup dulu sebelum jualan hari ini. */
export function shiftKedaluwarsa(dibukaAt: string, sekarang: Date): boolean {
	return tanggalWib(dibukaAt) < tanggalWib(sekarang);
}
```

- [ ] **Step 4: Jalankan, pastikan lulus; commit**

Run: `npx vitest run src/lib/kasir && npm run check`
Expected: PASS, 0 error.

```bash
git add src/lib/kasir
git commit -m "feat(kasir): logika keranjang, pembayaran & tombol cepat, waktu WIB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Struk 58 mm & ESC/POS

**Files:**
- Create: `src/lib/kasir/struk.ts`, `src/lib/kasir/escpos.ts`
- Test: `src/lib/kasir/struk.test.ts`, `src/lib/kasir/escpos.test.ts`

**Interfaces:**
- Consumes: `formatWaktuWib` (Task 4), `labelMetode` (Task 4), `formatAngka` (`#lib/master/rupiah.ts`).
- Produces:
  - `struk.ts`: `interface DataStruk { outlet: { merek: string; nama: string; alamat: string; telepon: string }; nomor: string; waktu: string; kasir: string; item: { nama: string; harga: number; qty: number }[]; total: number; metode: Metode; diterima: number | null; kembalian: number | null; cetakUlang?: boolean; batal?: boolean }`, `keAscii(s: string): string`, `barisStruk(d: DataStruk, lebar = 32): string[]`
  - `escpos.ts`: `encodeStruk(baris: string[]): Uint8Array`, `potong(bytes: Uint8Array, ukuran: number): Uint8Array[]`, `urlRawBT(bytes: Uint8Array): string`

- [ ] **Step 1: Tes (gagal dulu)**

`src/lib/kasir/struk.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { barisStruk, keAscii, type DataStruk } from './struk';

const data: DataStruk = {
	outlet: { merek: "D'Kriuk", nama: 'Bukit Lama', alamat: 'Jl. Sultan M. Mansyur No.1137, Bukit Lama, Palembang', telepon: '+62 821-8388-6369' },
	nomor: 'BL-261005-012',
	waktu: '2026-10-05T05:31:07Z',
	kasir: 'Kasir Bukit Lama',
	item: [
		{ nama: 'Dada Hot', harga: 11000, qty: 1 },
		{ nama: 'Nasi', harga: 5000, qty: 2 },
		{ nama: 'Saus Sambal', harga: 0, qty: 2 }
	],
	total: 21000,
	metode: 'cash',
	diterima: 50000,
	kembalian: 29000
};

// Baris rata kiri-kanan selebar 32 kolom.
const kk = (kiri: string, kanan: string) => kiri.padEnd(32 - kanan.length) + kanan;

describe('struk 58 mm', () => {
	const b = barisStruk(data);
	it('tidak ada baris lebih dari 32 karakter, semua ASCII', () => {
		for (const x of b) {
			expect(x.length).toBeLessThanOrEqual(32);
			expect(/^[\x20-\x7e]*$/.test(x)).toBe(true);
		}
	});
	it('kepala: nama outlet di tengah, alamat terbungkus, WA', () => {
		expect(b[0].trim()).toBe("D'KRIUK BUKIT LAMA");
		expect(b[0].length - b[0].trimStart().length).toBe(Math.floor((32 - "D'KRIUK BUKIT LAMA".length) / 2));
		expect(b.some((x) => x.includes('WA +62 821-8388-6369'))).toBe(true);
	});
	it('nomor & waktu WIB, item dengan jumlah × harga dan subtotal rata kanan', () => {
		expect(b).toContain(kk('BL-261005-012', '05/10/26 12:31:07'));
		expect(b).toContain('Dada Hot');
		expect(b).toContain(kk('  1 x 11.000', '11.000'));
		expect(b).toContain(kk('  2 x 5.000', '10.000'));
		expect(b).toContain(kk('  2 x 0', '0'));
	});
	it('total, metode, diterima, kembalian, ucapan', () => {
		expect(b).toContain(kk('TOTAL', '21.000'));
		expect(b).toContain(kk('Cash', '50.000'));
		expect(b).toContain(kk('Kembali', '29.000'));
		expect(b.some((x) => x.trim() === 'Terima kasih!')).toBe(true);
	});
	it('non-cash tanpa baris kembali; cetak ulang & batal ditandai', () => {
		const q = barisStruk({ ...data, metode: 'qris', diterima: null, kembalian: null, cetakUlang: true, batal: true });
		expect(q.some((x) => x.startsWith('Kembali'))).toBe(false);
		expect(q).toContain(kk('QRIS', '21.000'));
		expect(q.some((x) => x.includes('CETAK ULANG'))).toBe(true);
		expect(q.some((x) => x.includes('DIBATALKAN'))).toBe(true);
	});
	it('nama menu panjang dibungkus, bukan terpotong', () => {
		const p = barisStruk({ ...data, item: [{ nama: 'Paket Spesial Ayam Dada Hot Jumbo Sekali', harga: 1000, qty: 1 }] });
		expect(p).toContain('Paket Spesial Ayam Dada Hot');
		expect(p).toContain('Jumbo Sekali');
	});
});

describe('keAscii', () => {
	it('mengganti tanda baca Unicode dan membuang aksen', () => {
		expect(keAscii('D’Kriuk — Café · 1×')).toBe("D'Kriuk - Cafe - 1x");
	});
});
```

`src/lib/kasir/escpos.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { encodeStruk, potong, urlRawBT } from './escpos';

describe('ESC/POS', () => {
	it('diawali inisialisasi printer, tiap baris diakhiri LF, diakhiri umpan kertas', () => {
		const b = encodeStruk(['AB', 'C']);
		expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40]);
		expect([...b.slice(2, 8)]).toEqual([0x41, 0x42, 0x0a, 0x43, 0x0a, 0x1b]);
		expect([...b.slice(-3)]).toEqual([0x1b, 0x64, 4]);
	});
	it('karakter non-ASCII diganti "?" agar printer tidak mencetak sampah', () => {
		expect([...encodeStruk(['é']).slice(2, 4)]).toEqual([0x3f, 0x0a]);
	});
	it('potong menjadi paket BLE berukuran tetap', () => {
		const p = potong(new Uint8Array(250), 100);
		expect(p.map((x) => x.length)).toEqual([100, 100, 50]);
	});
	it('URL RawBT base64', () => {
		expect(urlRawBT(new Uint8Array([0x1b, 0x40]))).toBe('rawbt:base64,G0A=');
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/kasir/struk.test.ts src/lib/kasir/escpos.test.ts`
Expected: FAIL, modul belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/kasir/struk.ts`:
```ts
import { formatAngka } from '#lib/master/rupiah.ts';
import { labelMetode } from './bayar.ts';
import type { Metode } from './types.ts';
import { formatWaktuWib } from './waktu.ts';

export interface DataStruk {
	outlet: { merek: string; nama: string; alamat: string; telepon: string };
	nomor: string;
	waktu: string;
	kasir: string;
	item: { nama: string; harga: number; qty: number }[];
	total: number;
	metode: Metode;
	diterima: number | null;
	kembalian: number | null;
	cetakUlang?: boolean;
	batal?: boolean;
}

/** Printer thermal murah hanya mencetak ASCII. */
export function keAscii(s: string): string {
	return s
		.replace(/[‘’ʼ]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[–—·•]/g, '-')
		.replace(/×/g, 'x')
		.normalize('NFKD')
		.replace(/[^\x20-\x7e]/g, '');
}

function bungkus(teks: string, lebar: number): string[] {
	const hasil: string[] = [];
	let baris = '';
	for (const kata of keAscii(teks).split(/\s+/).filter(Boolean)) {
		if (!baris) baris = kata.slice(0, lebar);
		else if (baris.length + 1 + kata.length <= lebar) baris += ` ${kata}`;
		else {
			hasil.push(baris);
			baris = kata.slice(0, lebar);
		}
	}
	if (baris) hasil.push(baris);
	return hasil;
}

const tengah = (s: string, lebar: number) => ' '.repeat(Math.max(0, Math.floor((lebar - s.length) / 2))) + s;
const kiriKanan = (kiri: string, kanan: string, lebar: number) =>
	kiri + ' '.repeat(Math.max(1, lebar - kiri.length - kanan.length)) + kanan;

export function barisStruk(d: DataStruk, lebar = 32): string[] {
	const garis = '-'.repeat(lebar);
	const b: string[] = [];
	for (const x of bungkus(`${d.outlet.merek} ${d.outlet.nama}`.toUpperCase(), lebar)) b.push(tengah(x, lebar));
	for (const x of bungkus(d.outlet.alamat, lebar)) b.push(tengah(x, lebar));
	b.push(tengah(keAscii(`WA ${d.outlet.telepon}`), lebar));
	if (d.cetakUlang) b.push(tengah('** CETAK ULANG **', lebar));
	if (d.batal) b.push(tengah('** DIBATALKAN **', lebar));
	b.push(garis);
	b.push(kiriKanan(d.nomor, formatWaktuWib(d.waktu), lebar));
	b.push(...bungkus(`Kasir: ${d.kasir}`, lebar));
	b.push(garis);
	for (const i of d.item) {
		b.push(...bungkus(i.nama, lebar));
		b.push(kiriKanan(`  ${i.qty} x ${formatAngka(i.harga)}`, formatAngka(i.harga * i.qty), lebar));
	}
	b.push(garis);
	b.push(kiriKanan('TOTAL', formatAngka(d.total), lebar));
	if (d.metode === 'cash' && d.diterima !== null) {
		b.push(kiriKanan(labelMetode('cash'), formatAngka(d.diterima), lebar));
		b.push(kiriKanan('Kembali', formatAngka(d.kembalian ?? 0), lebar));
	} else {
		b.push(kiriKanan(labelMetode(d.metode), formatAngka(d.total), lebar));
	}
	b.push(garis);
	b.push(tengah('Terima kasih!', lebar));
	return b;
}
```

`src/lib/kasir/escpos.ts`:
```ts
const ESC = 0x1b;
const LF = 0x0a;

/** Perintah ESC/POS paling dasar yang didukung hampir semua printer thermal 58 mm. */
export function encodeStruk(baris: string[]): Uint8Array {
	const out: number[] = [ESC, 0x40]; // inisialisasi
	for (const b of baris) {
		for (const ch of b) {
			const c = ch.charCodeAt(0);
			out.push(c >= 0x20 && c <= 0x7e ? c : 0x3f);
		}
		out.push(LF);
	}
	out.push(ESC, 0x64, 4); // umpan 4 baris agar mudah disobek
	return new Uint8Array(out);
}

/** BLE mengirim data dalam paket kecil. */
export function potong(bytes: Uint8Array, ukuran: number): Uint8Array[] {
	const hasil: Uint8Array[] = [];
	for (let i = 0; i < bytes.length; i += ukuran) hasil.push(bytes.slice(i, i + ukuran));
	return hasil;
}

/** Cadangan: aplikasi Android RawBT mencetak lewat Bluetooth klasik. */
export function urlRawBT(bytes: Uint8Array): string {
	let biner = '';
	for (const x of bytes) biner += String.fromCharCode(x);
	return `rawbt:base64,${btoa(biner)}`;
}
```

- [ ] **Step 4: Jalankan, pastikan lulus; commit**

Run: `npx vitest run src/lib/kasir && npm run check`
Expected: PASS.

```bash
git add src/lib/kasir/struk.ts src/lib/kasir/struk.test.ts src/lib/kasir/escpos.ts src/lib/kasir/escpos.test.ts
git commit -m "feat(kasir): struk 58 mm ASCII & perintah ESC/POS, cadangan RawBT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Printer Bluetooth & lapisan data kasir

**Files:**
- Create: `src/lib/kasir/printer.svelte.ts`, `src/lib/kasir/api.ts`, `src/lib/kasir/pos.svelte.ts`
- Modify: `package.json` (devDependency `@types/web-bluetooth`), `tsconfig.json` (types)

**Interfaces:**
- Consumes: `encodeStruk`, `potong`, `urlRawBT` (Task 5); `supabase`; `pesanErrorData`; tipe Task 4.
- Produces:
  - `printer` (instance `PrinterState`): `status: 'tidak' | 'menyambung' | 'siap' | 'gagal'`, `nama: string`, `pesan: string`, `didukung: boolean`, `sambung(): Promise<void>`, `cetak(bytes: Uint8Array): Promise<void>`, `putus(): void`.
  - `api.ts`: `muatMenuOutlet(outletId): Promise<MenuJual[]>`, `shiftTerbuka(outletId): Promise<Shift | null>`, `modalTerakhir(outletId): Promise<number>`, `bukaShift(outletId, modal): Promise<string>`, `catatPenjualan(p: { id: string; outlet_id: string; metode: Metode; diterima?: number; waktu: string; item: { menu_id: string; qty: number }[] }): Promise<HasilJual>`, `daftarPenjualanShift(shiftId): Promise<PenjualanRiwayat[]>`, `voidPenjualan(id, alasan): Promise<void>`, `ringkasanShift(shiftId): Promise<Ringkasan>`, `tutupShift(shiftId, uangFisik, catatan): Promise<Ringkasan>`
  - `pos` (instance `PosState`): `outlet: Outlet | null`, `pilihOutlet(o: Outlet): void` (admin; disimpan di perangkat), `outletTersimpan(): string | null`, `shift: Shift | null`, `status: 'memuat' | 'siap' | 'gagal'`, `pesan: string`, `muatShift(): Promise<void>`

- [ ] **Step 1: Pasang tipe Web Bluetooth**

Run: `npm install -D @types/web-bluetooth`
Lalu di `tsconfig.json`, ubah `"types": ["$app/types", "node"]` menjadi `"types": ["$app/types", "node", "web-bluetooth"]`.

- [ ] **Step 2: Printer**

`src/lib/kasir/printer.svelte.ts`:
```ts
import { potong } from './escpos.ts';

// Layanan BLE yang umum dipakai printer thermal murah (termasuk banyak varian 58 mm).
const LAYANAN: BluetoothServiceUUID[] = [
	0x18f0,
	0xff00,
	0xffe0,
	0xfee7,
	'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
	'49535343-fe7d-4ae5-8fa9-9fafd205e455'
];

class PrinterState {
	status = $state<'tidak' | 'menyambung' | 'siap' | 'gagal'>('tidak');
	nama = $state('');
	pesan = $state('');
	#tulis: BluetoothRemoteGATTCharacteristic | null = null;
	#perangkat: BluetoothDevice | null = null;

	get didukung(): boolean {
		return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
	}

	async sambung(): Promise<void> {
		if (!this.didukung) {
			this.status = 'gagal';
			this.pesan = 'Browser ini tidak mendukung Bluetooth. Pakai Chrome di Android, atau cetak lewat RawBT.';
			return;
		}
		this.status = 'menyambung';
		this.pesan = '';
		try {
			const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: LAYANAN });
			const gatt = await d.gatt!.connect();
			for (const s of await gatt.getPrimaryServices()) {
				for (const c of await s.getCharacteristics()) {
					if (c.properties.write || c.properties.writeWithoutResponse) {
						this.#tulis = c;
						break;
					}
				}
				if (this.#tulis) break;
			}
			if (!this.#tulis) throw new Error('tanpa karakteristik tulis');
			this.#perangkat = d;
			this.nama = d.name ?? 'Printer';
			d.addEventListener('gattserverdisconnected', () => {
				this.#tulis = null;
				this.status = 'tidak';
				this.pesan = 'Printer terputus. Sambungkan lagi.';
			});
			this.status = 'siap';
		} catch (e) {
			this.#tulis = null;
			this.status = 'gagal';
			this.pesan =
				(e as Error).name === 'NotFoundError'
					? 'Tidak ada printer dipilih.'
					: 'Printer tidak bisa disambungkan lewat Bluetooth Chrome. Coba cetak lewat aplikasi RawBT.';
		}
	}

	async cetak(bytes: Uint8Array): Promise<void> {
		const c = this.#tulis;
		if (!c) throw new Error('Printer belum tersambung.');
		for (const paket of potong(bytes, 100)) {
			if (c.properties.writeWithoutResponse) await c.writeValueWithoutResponse(paket);
			else await c.writeValueWithResponse(paket);
		}
	}

	putus(): void {
		this.#perangkat?.gatt?.disconnect();
		this.#tulis = null;
		this.status = 'tidak';
	}
}

export const printer = new PrinterState();
```

- [ ] **Step 3: Lapisan data kasir**

`src/lib/kasir/api.ts`:
```ts
import { pesanErrorData } from '#lib/master/pesan.ts';
import { supabase } from '#lib/supabase/client.ts';
import type { HasilJual, MenuJual, Metode, PenjualanRiwayat, Ringkasan, Shift } from './types.ts';

type Galat = Parameters<typeof pesanErrorData>[0];
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanErrorData(res.error) ?? 'Terjadi kesalahan.');
	return res.data as T;
}

/** Menu aktif beserta harga outlet ini (menu tanpa harga di outlet tidak ditampilkan). */
export async function muatMenuOutlet(outletId: string): Promise<MenuJual[]> {
	const [menu, harga] = await Promise.all([
		supabase.from('menu').select('id, kode, nama, kategori, varian, urutan').eq('aktif', true).order('urutan'),
		supabase.from('harga_jual').select('menu_id, harga').eq('outlet_id', outletId)
	]);
	const peta = new Map(periksa(harga).map((h: { menu_id: string; harga: number }) => [h.menu_id, h.harga]));
	return (periksa(menu) as Omit<MenuJual, 'harga'>[])
		.filter((m) => peta.has(m.id))
		.map((m) => ({ ...m, harga: peta.get(m.id)! }));
}

export async function shiftTerbuka(outletId: string): Promise<Shift | null> {
	return periksa(
		await supabase
			.from('shift')
			.select('id, outlet_id, dibuka_at, modal, ditutup_at')
			.eq('outlet_id', outletId)
			.is('ditutup_at', null)
			.maybeSingle()
	);
}

export async function modalTerakhir(outletId: string): Promise<number> {
	const s = periksa(
		await supabase
			.from('shift')
			.select('modal')
			.eq('outlet_id', outletId)
			.order('dibuka_at', { ascending: false })
			.limit(1)
			.maybeSingle()
	) as { modal: number } | null;
	return s?.modal ?? 0;
}

export async function bukaShift(outletId: string, modal: number): Promise<string> {
	return periksa(await supabase.rpc('buka_shift', { p_outlet: outletId, p_modal: modal })) as string;
}

export async function catatPenjualan(p: {
	id: string;
	outlet_id: string;
	metode: Metode;
	diterima?: number;
	waktu: string;
	item: { menu_id: string; qty: number }[];
}): Promise<HasilJual> {
	return periksa(await supabase.rpc('catat_penjualan', { p })) as HasilJual;
}

export async function daftarPenjualanShift(shiftId: string): Promise<PenjualanRiwayat[]> {
	return periksa(
		await supabase
			.from('penjualan')
			.select('id, nomor, waktu, metode, total, diterima, kembalian, void_at, void_alasan, item:penjualan_item(nama, harga, qty)')
			.eq('shift_id', shiftId)
			.order('waktu', { ascending: false })
	) as PenjualanRiwayat[];
}

export async function voidPenjualan(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('void_penjualan', { p_id: id, p_alasan: alasan }));
}

export async function ringkasanShift(shiftId: string): Promise<Ringkasan> {
	return periksa(await supabase.rpc('ringkasan_shift', { p_shift: shiftId })) as Ringkasan;
}

export async function tutupShift(shiftId: string, uangFisik: number, catatan: string): Promise<Ringkasan> {
	return periksa(await supabase.rpc('tutup_shift', { p_shift: shiftId, p_uang_fisik: uangFisik, p_catatan: catatan })) as Ringkasan;
}
```

`src/lib/kasir/pos.svelte.ts`:
```ts
import { auth } from '#lib/auth/session.svelte.ts';
import type { Outlet } from '#lib/types/db.ts';
import { shiftTerbuka } from './api.ts';
import type { Shift } from './types.ts';

const KUNCI = 'dk-outlet-admin';

/** Status bersama halaman kasir: outlet yang dilayani & shift terbukanya. */
class PosState {
	pilihanAdmin = $state<Outlet | null>(null);
	shift = $state<Shift | null>(null);
	status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	pesan = $state('');

	/** Kasir: outlet akunnya. Admin: outlet yang dipilih di perangkat ini. */
	get outlet(): Outlet | null {
		return auth.profile?.role === 'kasir' ? auth.outlet : this.pilihanAdmin;
	}

	pilihOutlet(o: Outlet | null) {
		this.pilihanAdmin = o;
		this.shift = null;
		try {
			if (o) localStorage.setItem(KUNCI, o.id);
			else localStorage.removeItem(KUNCI);
		} catch {
			// abaikan
		}
	}

	outletTersimpan(): string | null {
		try {
			return localStorage.getItem(KUNCI);
		} catch {
			return null;
		}
	}

	async muatShift(): Promise<void> {
		const o = this.outlet;
		if (!o) return;
		this.status = 'memuat';
		try {
			this.shift = await shiftTerbuka(o.id);
			this.status = 'siap';
		} catch (e) {
			this.pesan = (e as Error).message;
			this.status = 'gagal';
		}
	}
}

export const pos = new PosState();
```

- [ ] **Step 4: Verifikasi & commit**

Run: `npm test && npm run check`
Expected: PASS, 0 error.

```bash
git add package.json package-lock.json tsconfig.json src/lib/kasir/printer.svelte.ts src/lib/kasir/api.ts src/lib/kasir/pos.svelte.ts
git commit -m "feat(kasir): sambungan printer Bluetooth, lapisan data & status kasir

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Kerangka halaman kasir (layout, navigasi, pilih outlet, modal shift)

**Files:**
- Create: `src/routes/kasir/+layout.svelte`, `src/lib/components/kasir/KasirNav.svelte`, `src/lib/components/kasir/PilihOutlet.svelte`, `src/lib/components/kasir/ModalShift.svelte`, `src/lib/components/kasir/PrinterChip.svelte`
- Modify: `src/routes/kasir/+page.svelte` (sementara: isi minimal yang dipakai Task 8)
- Test: `src/lib/components/kasir/kasir-ui.test.ts`

**Interfaces:**
- Consumes: `pos`, `printer`, `muatOutlets` (`#lib/master/api.ts`), `modalTerakhir`, `bukaShift`, `shiftKedaluwarsa`, `HargaInput`, `Button`, `AppShell`, `href`, `routePath`.
- Produces: `<KasirNav aktif />` (Jualan `/kasir`, Riwayat `/kasir/riwayat`, Tutup toko `/kasir/tutup`); `<PilihOutlet />`; `<ModalShift outlet onbuka={(shiftId) => void} />`; `<PrinterChip />`.

- [ ] **Step 1: Tes render (gagal dulu)**

`src/lib/components/kasir/kasir-ui.test.ts`:
```ts
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import KasirNav from './KasirNav.svelte';

describe('KasirNav', () => {
	it('tiga tujuan kasir dengan halaman aktif ditandai', () => {
		const { body } = render(KasirNav, { props: { aktif: '/kasir/riwayat' } });
		expect(body).toContain('href="#/kasir"');
		expect(body).toContain('href="#/kasir/riwayat"');
		expect(body).toContain('href="#/kasir/tutup"');
		expect(body).toMatch(/href="#\/kasir\/riwayat"[^>]*aria-current="page"/);
		expect(body).not.toMatch(/href="#\/kasir"[^>]*aria-current="page"/);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/components/kasir`
Expected: FAIL, komponen belum ada.

- [ ] **Step 3: Komponen**

`src/lib/components/kasir/KasirNav.svelte`:
```svelte
<script lang="ts">
	import { href } from '#lib/nav.ts';

	let { aktif }: { aktif: string } = $props();
	const ITEM = [
		{ path: '/kasir', label: 'Jualan' },
		{ path: '/kasir/riwayat', label: 'Riwayat' },
		{ path: '/kasir/tutup', label: 'Tutup toko' }
	] as const;
</script>

<nav
	aria-label="Menu kasir"
	class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:sticky lg:top-20 lg:w-44 lg:shrink-0 lg:self-start lg:border-0 lg:bg-transparent lg:pt-6 lg:pb-0"
>
	<ul class="flex lg:flex-col lg:gap-1">
		{#each ITEM as i (i.path)}
			<li class="flex-1 lg:flex-none">
				<a
					href={href(i.path)}
					aria-current={aktif === i.path ? 'page' : undefined}
					class="flex min-h-14 items-center justify-center border-t-3 border-transparent px-2 text-sm font-semibold text-muted hover:text-fg focus-visible:outline-3 focus-visible:outline-focus aria-[current=page]:border-brand aria-[current=page]:font-extrabold aria-[current=page]:text-brand lg:min-h-12 lg:justify-start lg:rounded-xl lg:border-t-0 lg:px-3 lg:aria-[current=page]:bg-surface-2"
				>
					{i.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
```

`src/lib/components/kasir/PilihOutlet.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let pesan = $state('');

	onMount(async () => {
		try {
			outlets = (await muatOutlets()).filter((o) => o.aktif);
			const tersimpan = pos.outletTersimpan();
			const o = outlets.find((x) => x.id === tersimpan);
			if (o && !pos.outlet) pos.pilihOutlet(o);
		} catch (e) {
			pesan = (e as Error).message;
		}
	});
</script>

<div class="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
	<label for="pilih-outlet" class="text-sm font-semibold">Jualan untuk outlet</label>
	<select
		id="pilih-outlet"
		class="min-h-12 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-fg"
		value={pos.outlet?.id ?? ''}
		onchange={(e) => pos.pilihOutlet(outlets.find((o) => o.id === e.currentTarget.value) ?? null)}
	>
		<option value="" disabled>Pilih outlet…</option>
		{#each outlets as o (o.id)}<option value={o.id}>{o.merek} {o.nama}</option>{/each}
	</select>
	{#if pesan}<p class="w-full text-sm text-danger" role="alert">{pesan}</p>{/if}
</div>
```

`src/lib/components/kasir/ModalShift.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { bukaShift, modalTerakhir } from '#lib/kasir/api.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { outlet, onbuka }: { outlet: Outlet; onbuka: (shiftId: string) => void } = $props();

	let teks = $state('');
	let error = $state('');
	let memproses = $state(false);
	let input = $state<HTMLInputElement>();

	onMount(async () => {
		try {
			teks = formatAngka(await modalTerakhir(outlet.id));
		} catch {
			teks = '0';
		}
		input?.focus();
		input?.select();
	});

	async function mulai(e: SubmitEvent) {
		e.preventDefault();
		const modal = parseRupiah(teks);
		if (modal === null) {
			error = 'Isi jumlah uang modal, mis. 200.000 (isi 0 bila tidak ada).';
			return;
		}
		memproses = true;
		error = '';
		try {
			onbuka(await bukaShift(outlet.id, modal));
		} catch (err) {
			error = (err as Error).message;
		} finally {
			memproses = false;
		}
	}
</script>

<form class="mx-auto mt-6 grid max-w-sm gap-4 rounded-2xl border-2 border-brand bg-surface p-5" onsubmit={mulai} novalidate>
	<h2 class="font-display text-2xl">Mulai jualan</h2>
	<p class="text-sm text-muted">{outlet.merek} {outlet.nama} · isi uang kembalian yang ada di laci sekarang.</p>
	<div class="grid gap-1.5">
		<label for="modal-shift" class="text-sm font-semibold">Modal kembalian</label>
		<div class="relative">
			<span class="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted" aria-hidden="true">Rp</span>
			<input
				id="modal-shift"
				bind:this={input}
				bind:value={teks}
				inputmode="numeric"
				autocomplete="off"
				class="tabular min-h-14 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-right text-2xl text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none"
			/>
		</div>
		{#if error}<p class="text-sm text-danger" role="alert">{error}</p>{/if}
	</div>
	<Button type="submit" loading={memproses} class="min-h-14 text-lg">Mulai jualan</Button>
</form>
```

`src/lib/components/kasir/PrinterChip.svelte`:
```svelte
<script lang="ts">
	import { printer } from '#lib/kasir/printer.svelte.ts';
</script>

<div class="flex flex-wrap items-center gap-2 text-sm">
	{#if printer.status === 'siap'}
		<span class="inline-flex min-h-10 items-center gap-2 rounded-full bg-surface-2 px-3 font-semibold text-ok">● {printer.nama}</span>
		<button type="button" class="min-h-12 rounded-xl px-3 text-muted hover:bg-surface-2" onclick={() => printer.putus()}>Putuskan</button>
	{:else}
		<button
			type="button"
			class="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-3 font-semibold hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus"
			onclick={() => printer.sambung()}
			disabled={printer.status === 'menyambung'}
		>
			{printer.status === 'menyambung' ? 'Menyambung…' : 'Sambungkan printer'}
		</button>
	{/if}
	{#if printer.pesan}<span class="text-xs text-muted" role="status">{printer.pesan}</span>{/if}
</div>
```

`src/routes/kasir/+layout.svelte`:
```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { routePath } from '#lib/auth/guard.ts';
	import KasirNav from '#lib/components/kasir/KasirNav.svelte';
	import PilihOutlet from '#lib/components/kasir/PilihOutlet.svelte';
	import AppShell from '#lib/components/layout/AppShell.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';

	let { children } = $props();

	// Muat shift setiap kali outlet yang dilayani berganti.
	$effect(() => {
		if (pos.outlet) void pos.muatShift();
	});
</script>

<AppShell title="Kasir">
	{#snippet nav()}<KasirNav aktif={routePath(page.url)} />{/snippet}
	{#if auth.offline}
		<p class="mb-4 rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold text-warn" role="status">
			Internet terputus. Data terakhir dipakai; penjualan butuh koneksi sampai Tahap 4 (mode offline) selesai.
		</p>
	{/if}
	{#if auth.profile?.role === 'admin'}<div class="mb-4"><PilihOutlet /></div>{/if}
	{#if !pos.outlet}
		<p class="text-muted">Pilih outlet untuk mulai.</p>
	{:else}
		{@render children()}
	{/if}
</AppShell>
```

`src/routes/kasir/+page.svelte` (sementara; diganti Task 8):
```svelte
<script lang="ts">
	import { pos } from '#lib/kasir/pos.svelte.ts';
</script>

<svelte:head><title>Kasir · Kasir D'Kriuk</title></svelte:head>
<h1 class="font-display text-3xl">{pos.outlet?.merek} {pos.outlet?.nama}</h1>
```

- [ ] **Step 4: Verifikasi & commit**

Run: `npx vitest run src/lib/components/kasir && npm test && npm run check && npm run build`
Expected: PASS, 0 error.

```bash
git add src/lib/components/kasir src/routes/kasir
git commit -m "feat(kasir): kerangka halaman kasir — navigasi, pilih outlet (admin), modal shift, chip printer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Layar jualan (menu, keranjang, bayar, selesai & struk)

**Files:**
- Create: `src/lib/components/kasir/MenuGrid.svelte`, `src/lib/components/kasir/Keranjang.svelte`, `src/lib/components/kasir/BayarPanel.svelte`, `src/lib/components/kasir/Selesai.svelte`, `src/lib/kasir/cetak.ts`
- Modify: `src/routes/kasir/+page.svelte`
- Test: `src/lib/kasir/cetak.test.ts`

**Interfaces:**
- Consumes: Task 4–7.
- Produces:
  - `cetak.ts`: `dataStrukDari(a: { outlet: Outlet; kasir: string; hasil: HasilJual; keranjang: BarisKeranjang[]; metode: Metode; diterima: number | null; cetakUlang?: boolean }): DataStruk`
  - `<MenuGrid menu={MenuJual[]} ontambah={(m) => void} onnasibox={() => void} />`, `<Keranjang isi={BarisKeranjang[]} onubah={(menuId, qty) => void} onkosongkan={() => void} />`, `<BayarPanel total onbayar={(metode, diterima) => Promise<void>} onbatal />`, `<Selesai data={DataStruk} kembalian onbaru />`

- [ ] **Step 1: Tes data struk (gagal dulu)**

`src/lib/kasir/cetak.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dataStrukDari } from './cetak';

describe('dataStrukDari', () => {
	it('menyusun data struk dari hasil server (total & nomor dari server, bukan keranjang)', () => {
		const d = dataStrukDari({
			outlet: { id: 'o', kode: 'BL', nama: 'Bukit Lama', merek: "D'Kriuk", alamat: 'Jl. X', telepon: '+62 1', aktif: true },
			kasir: 'Kasir BL',
			hasil: { id: 'p', nomor: 'BL-261005-001', total: 16000, kembalian: 4000, waktu: '2026-10-05T05:00:00Z', ulang: false },
			keranjang: [
				{ menu_id: 'a', nama: 'Dada Ori', harga: 11000, qty: 1 },
				{ menu_id: 'b', nama: 'Nasi', harga: 5000, qty: 1 }
			],
			metode: 'cash',
			diterima: 20000
		});
		expect(d).toMatchObject({ nomor: 'BL-261005-001', total: 16000, kembalian: 4000, diterima: 20000, kasir: 'Kasir BL' });
		expect(d.item).toEqual([
			{ nama: 'Dada Ori', harga: 11000, qty: 1 },
			{ nama: 'Nasi', harga: 5000, qty: 1 }
		]);
		expect(d.outlet).toEqual({ merek: "D'Kriuk", nama: 'Bukit Lama', alamat: 'Jl. X', telepon: '+62 1' });
	});
	it('non-cash tidak membawa uang diterima', () => {
		const d = dataStrukDari({
			outlet: { id: 'o', kode: 'BL', nama: 'B', merek: 'M', alamat: 'A', telepon: 'T', aktif: true },
			kasir: 'K',
			hasil: { id: 'p', nomor: 'N', total: 5000, kembalian: null, waktu: '2026-10-05T05:00:00Z', ulang: false },
			keranjang: [{ menu_id: 'b', nama: 'Nasi', harga: 5000, qty: 1 }],
			metode: 'qris',
			diterima: 50000
		});
		expect(d.diterima).toBeNull();
		expect(d.kembalian).toBeNull();
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/kasir/cetak.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementasi `cetak.ts`**

`src/lib/kasir/cetak.ts`:
```ts
import type { Outlet } from '#lib/types/db.ts';
import type { DataStruk } from './struk.ts';
import type { BarisKeranjang, HasilJual, Metode } from './types.ts';

/** Nomor, waktu, total & kembalian selalu dari server; rincian item dari keranjang yang dikirim. */
export function dataStrukDari(a: {
	outlet: Outlet;
	kasir: string;
	hasil: HasilJual;
	keranjang: BarisKeranjang[];
	metode: Metode;
	diterima: number | null;
	cetakUlang?: boolean;
}): DataStruk {
	const cash = a.metode === 'cash';
	return {
		outlet: { merek: a.outlet.merek, nama: a.outlet.nama, alamat: a.outlet.alamat, telepon: a.outlet.telepon },
		nomor: a.hasil.nomor,
		waktu: a.hasil.waktu,
		kasir: a.kasir,
		item: a.keranjang.map((b) => ({ nama: b.nama, harga: b.harga, qty: b.qty })),
		total: a.hasil.total,
		metode: a.metode,
		diterima: cash ? a.diterima : null,
		kembalian: cash ? a.hasil.kembalian : null,
		cetakUlang: a.cetakUlang
	};
}
```

- [ ] **Step 4: Komponen layar jualan**

`src/lib/components/kasir/MenuGrid.svelte`:
```svelte
<script lang="ts">
	import type { MenuJual } from '#lib/kasir/types.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { menu, ontambah, onnasibox }: { menu: MenuJual[]; ontambah: (m: MenuJual) => void; onnasibox: () => void } = $props();

	const KELOMPOK = [
		{ judul: 'Ori', cocok: (m: MenuJual) => m.varian === 'ori' },
		{ judul: 'Hot', cocok: (m: MenuJual) => m.varian === 'hot' },
		{ judul: 'Kulit · Nasi · Box', cocok: (m: MenuJual) => ['kulit', 'nasi', 'box'].includes(m.kategori) },
		{ judul: 'Pelengkap', cocok: (m: MenuJual) => m.kategori === 'pelengkap' }
	];
	const adaNasiBox = $derived(menu.some((m) => m.kode === 'nasi') && menu.some((m) => m.kode === 'box'));
</script>

<div class="grid gap-4">
	{#each KELOMPOK as k (k.judul)}
		{@const isi = menu.filter(k.cocok)}
		{#if isi.length}
			<section aria-label={k.judul}>
				<h2 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{k.judul}</h2>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{#each isi as m (m.id)}
						<button
							type="button"
							onclick={() => ontambah(m)}
							class="flex min-h-20 flex-col items-start justify-between rounded-2xl border-2 p-3 text-left active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-focus {m.varian === 'hot'
								? 'border-brand bg-brand/10'
								: m.kategori === 'pelengkap'
									? 'border-line bg-surface-2'
									: 'border-accent bg-accent/15'}"
						>
							<span class="font-bold leading-tight">{m.nama}</span>
							<span class="tabular text-sm text-muted">{m.harga ? `Rp${formatAngka(m.harga)}` : 'Gratis'}</span>
						</button>
					{/each}
					{#if k.judul === 'Kulit · Nasi · Box' && adaNasiBox}
						<button
							type="button"
							onclick={onnasibox}
							class="flex min-h-20 flex-col items-start justify-between rounded-2xl border-2 border-dashed border-brand p-3 text-left font-bold focus-visible:outline-3 focus-visible:outline-focus"
						>
							Nasi Box
							<span class="text-sm font-normal text-muted">Nasi + Box</span>
						</button>
					{/if}
				</div>
			</section>
		{/if}
	{/each}
</div>
```

`src/lib/components/kasir/Keranjang.svelte`:
```svelte
<script lang="ts">
	import { jumlahItem, totalKeranjang } from '#lib/kasir/keranjang.ts';
	import type { BarisKeranjang } from '#lib/kasir/types.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let {
		isi,
		onubah,
		onkosongkan
	}: { isi: BarisKeranjang[]; onubah: (menuId: string, qty: number) => void; onkosongkan: () => void } = $props();
</script>

<div class="grid gap-2">
	<div class="flex items-center justify-between">
		<h2 class="font-display text-xl">Pesanan ({jumlahItem(isi)})</h2>
		{#if isi.length}
			<button type="button" class="min-h-12 rounded-xl px-3 text-sm text-danger hover:bg-surface-2" onclick={onkosongkan}>Kosongkan</button>
		{/if}
	</div>
	{#if isi.length === 0}
		<p class="rounded-xl bg-surface-2 p-4 text-sm text-muted">Tap menu untuk menambah pesanan.</p>
	{:else}
		<ul class="grid gap-1">
			{#each isi as b (b.menu_id)}
				<li class="flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1">
					<span class="min-w-0 flex-1 truncate font-semibold">{b.nama}</span>
					<button
						type="button"
						class="size-12 rounded-xl bg-surface text-xl font-bold"
						aria-label="Kurangi {b.nama}"
						onclick={() => onubah(b.menu_id, b.qty - 1)}>−</button
					>
					<span class="tabular w-8 text-center font-bold" aria-label="Jumlah {b.nama}">{b.qty}</span>
					<button
						type="button"
						class="size-12 rounded-xl bg-surface text-xl font-bold"
						aria-label="Tambah {b.nama}"
						onclick={() => onubah(b.menu_id, b.qty + 1)}>+</button
					>
					<span class="tabular w-20 text-right text-sm">{formatAngka(b.harga * b.qty)}</span>
				</li>
			{/each}
		</ul>
		<p class="flex items-baseline justify-between px-2 pt-2 text-lg font-bold">
			<span>Total</span><span class="tabular font-display text-3xl text-brand">Rp{formatAngka(totalKeranjang(isi))}</span>
		</p>
	{/if}
</div>
```

`src/lib/components/kasir/BayarPanel.svelte`:
```svelte
<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import { kembalian, METODE, tombolCepat } from '#lib/kasir/bayar.ts';
	import type { Metode } from '#lib/kasir/types.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';

	let {
		total,
		onbayar,
		onbatal
	}: { total: number; onbayar: (metode: Metode, diterima: number | null) => Promise<void>; onbatal: () => void } = $props();

	let metode = $state<Metode>('cash');
	let teks = $state('');
	let error = $state('');
	let memproses = $state(false);

	const diterima = $derived(parseRupiah(teks));
	const kembali = $derived(diterima === null ? null : kembalian(total, diterima));
	const bisaBayar = $derived(metode !== 'cash' || kembali !== null);

	async function bayar() {
		if (!bisaBayar || memproses) return;
		memproses = true;
		error = '';
		try {
			await onbayar(metode, metode === 'cash' ? diterima : null);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			memproses = false;
		}
	}
</script>

<div class="grid gap-4 rounded-2xl border-2 border-brand bg-surface p-4">
	<p class="flex items-baseline justify-between">
		<span class="font-semibold">Total</span><span class="tabular font-display text-3xl text-brand">Rp{formatAngka(total)}</span>
	</p>
	<fieldset class="grid gap-2">
		<legend class="mb-1 text-sm font-semibold">Metode bayar</legend>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
			{#each METODE as m (m.kode)}
				<label
					class="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-sm font-bold has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-on-brand {metode ===
					m.kode
						? ''
						: 'border-line'}"
				>
					<input type="radio" name="metode" value={m.kode} bind:group={metode} class="sr-only" />
					{m.label}
				</label>
			{/each}
		</div>
	</fieldset>
	{#if metode === 'cash'}
		<div class="grid gap-2">
			<label for="uang-diterima" class="text-sm font-semibold">Uang diterima</label>
			<input
				id="uang-diterima"
				bind:value={teks}
				inputmode="numeric"
				autocomplete="off"
				placeholder="0"
				class="tabular min-h-14 rounded-xl border border-line-strong bg-surface px-3 text-right text-2xl text-fg focus:border-brand focus:outline-none"
			/>
			<div class="flex flex-wrap gap-2">
				{#each tombolCepat(total) as n, i (n)}
					<button type="button" class="min-h-12 flex-1 rounded-xl bg-surface-2 px-3 font-semibold" onclick={() => (teks = formatAngka(n))}>
						{i === 0 ? 'Uang pas' : formatAngka(n)}
					</button>
				{/each}
			</div>
			<p class="flex justify-between text-lg" role="status">
				<span>Kembali</span>
				<span class="tabular font-bold {kembali === null ? 'text-danger' : 'text-ok'}">
					{teks.trim() === '' ? '—' : kembali === null ? 'Uang kurang' : `Rp${formatAngka(kembali)}`}
				</span>
			</p>
		</div>
	{/if}
	{#if error}<p class="text-sm font-semibold text-danger" role="alert">{error}</p>{/if}
	<div class="flex gap-2">
		<Button variant="ghost" onclick={onbatal} disabled={memproses}>Kembali</Button>
		<Button class="min-h-14 flex-1 text-lg" disabled={!bisaBayar} loading={memproses} onclick={bayar}>Bayar</Button>
	</div>
</div>
```

`src/lib/components/kasir/Selesai.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { encodeStruk, urlRawBT } from '#lib/kasir/escpos.ts';
	import { printer } from '#lib/kasir/printer.svelte.ts';
	import { barisStruk, type DataStruk } from '#lib/kasir/struk.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { data, onbaru }: { data: DataStruk; onbaru: () => void } = $props();

	let pesanCetak = $state('');
	let tombolBaru = $state<HTMLDivElement>();
	const bytes = $derived(encodeStruk(barisStruk(data)));

	async function cetak() {
		pesanCetak = '';
		try {
			await printer.cetak(bytes);
			pesanCetak = 'Struk tercetak.';
		} catch (e) {
			pesanCetak = (e as Error).message;
		}
	}

	onMount(() => {
		// Struk otomatis tercetak bila printer tersambung.
		if (printer.status === 'siap') void cetak();
		tombolBaru?.querySelector('button')?.focus();
	});
</script>

<div class="mx-auto grid max-w-md gap-4 rounded-2xl border-2 border-ok bg-surface p-5 text-center">
	<p class="text-sm text-muted">{data.nomor}</p>
	{#if data.kembalian !== null}
		<p class="text-lg">Kembalian</p>
		<p class="tabular font-display text-5xl text-ok">Rp{formatAngka(data.kembalian)}</p>
	{:else}
		<p class="font-display text-3xl text-ok">Lunas</p>
	{/if}
	<div class="flex flex-wrap justify-center gap-2">
		{#if printer.status === 'siap'}
			<Button variant="secondary" onclick={cetak}>Cetak ulang</Button>
		{:else}
			<a
				href={urlRawBT(bytes)}
				class="inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold hover:bg-line focus-visible:outline-3 focus-visible:outline-focus"
			>
				Cetak lewat RawBT
			</a>
		{/if}
	</div>
	{#if pesanCetak}<p class="text-sm text-muted" role="status">{pesanCetak}</p>{/if}
	<div bind:this={tombolBaru}><Button class="min-h-14 w-full text-lg" onclick={onbaru}>Transaksi baru</Button></div>
</div>
```

`src/routes/kasir/+page.svelte` (ganti seluruh isi):
```svelte
<script lang="ts">
	import { auth } from '#lib/auth/session.svelte.ts';
	import BayarPanel from '#lib/components/kasir/BayarPanel.svelte';
	import Keranjang from '#lib/components/kasir/Keranjang.svelte';
	import MenuGrid from '#lib/components/kasir/MenuGrid.svelte';
	import ModalShift from '#lib/components/kasir/ModalShift.svelte';
	import PrinterChip from '#lib/components/kasir/PrinterChip.svelte';
	import Selesai from '#lib/components/kasir/Selesai.svelte';
	import { catatPenjualan, muatMenuOutlet } from '#lib/kasir/api.ts';
	import { dataStrukDari } from '#lib/kasir/cetak.ts';
	import { tambah, tambahNasiBox, totalKeranjang, ubahQty } from '#lib/kasir/keranjang.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import type { DataStruk } from '#lib/kasir/struk.ts';
	import type { BarisKeranjang, MenuJual, Metode } from '#lib/kasir/types.ts';
	import { shiftKedaluwarsa } from '#lib/kasir/waktu.ts';
	import { href } from '#lib/nav.ts';

	let menu = $state<MenuJual[]>([]);
	let keranjang = $state<BarisKeranjang[]>([]);
	let tahap = $state<'pilih' | 'bayar' | 'selesai'>('pilih');
	let struk = $state<DataStruk | null>(null);
	let pesanMenu = $state('');
	// ID transaksi dibuat sekali per keranjang: tekan Bayar dua kali / kirim ulang tidak menggandakan.
	let idTransaksi = $state(crypto.randomUUID());

	$effect(() => {
		const o = pos.outlet;
		if (!o) return;
		pesanMenu = '';
		muatMenuOutlet(o.id)
			.then((m) => (menu = m))
			.catch((e) => (pesanMenu = (e as Error).message));
	});

	const kedaluwarsa = $derived(pos.shift ? shiftKedaluwarsa(pos.shift.dibuka_at, new Date()) : false);
	const nasi = $derived(menu.find((m) => m.kode === 'nasi'));
	const box = $derived(menu.find((m) => m.kode === 'box'));

	async function bayar(metode: Metode, diterima: number | null) {
		const o = pos.outlet!;
		const kirim = $state.snapshot(keranjang);
		const hasil = await catatPenjualan({
			id: idTransaksi,
			outlet_id: o.id,
			metode,
			...(diterima !== null ? { diterima } : {}),
			waktu: new Date().toISOString(),
			item: kirim.map((b) => ({ menu_id: b.menu_id, qty: b.qty }))
		});
		struk = dataStrukDari({ outlet: o, kasir: auth.profile?.nama_tampilan ?? '', hasil, keranjang: kirim, metode, diterima });
		tahap = 'selesai';
	}

	function baru() {
		keranjang = [];
		struk = null;
		idTransaksi = crypto.randomUUID();
		tahap = 'pilih';
	}
</script>

<svelte:head><title>Jualan · Kasir D'Kriuk</title></svelte:head>

{#if pos.status === 'memuat' && !pos.shift}
	<p class="text-muted" role="status">Memuat…</p>
{:else if pos.status === 'gagal'}
	<p class="text-danger" role="alert">{pos.pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => pos.muatShift()}>Coba lagi</button>
{:else if !pos.shift}
	<ModalShift outlet={pos.outlet!} onbuka={() => pos.muatShift()} />
{:else if kedaluwarsa}
	<div class="mx-auto max-w-md rounded-2xl border-2 border-warn bg-surface p-5" role="alert">
		<p class="font-semibold">Toko kemarin belum ditutup.</p>
		<p class="mt-1 text-sm text-muted">Hitung uang di laci dan tutup toko dulu sebelum jualan hari ini.</p>
		<a href={href('/kasir/tutup')} class="mt-3 inline-flex min-h-12 items-center rounded-xl bg-brand px-4 font-semibold text-on-brand"
			>Tutup toko</a
		>
	</div>
{:else if tahap === 'selesai' && struk}
	<Selesai data={struk} onbaru={baru} />
{:else}
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h1 class="font-display text-2xl">{pos.outlet?.merek} {pos.outlet?.nama}</h1>
		<PrinterChip />
	</div>
	{#if pesanMenu}<p class="mb-3 text-danger" role="alert">{pesanMenu}</p>{/if}
	<div class="grid gap-4 lg:grid-cols-[1fr_22rem]">
		<MenuGrid
			{menu}
			ontambah={(m) => (keranjang = tambah(keranjang, m))}
			onnasibox={() => nasi && box && (keranjang = tambahNasiBox(keranjang, nasi, box))}
		/>
		<aside class="grid content-start gap-3 lg:sticky lg:top-20">
			{#if tahap === 'bayar'}
				<BayarPanel total={totalKeranjang(keranjang)} onbayar={bayar} onbatal={() => (tahap = 'pilih')} />
			{:else}
				<Keranjang isi={keranjang} onubah={(id, q) => (keranjang = ubahQty(keranjang, id, q))} onkosongkan={() => (keranjang = [])} />
				<button
					type="button"
					disabled={keranjang.length === 0}
					onclick={() => (tahap = 'bayar')}
					class="min-h-16 rounded-2xl bg-brand text-xl font-bold text-on-brand disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
				>
					Bayar
				</button>
			{/if}
		</aside>
	</div>
{/if}
```

- [ ] **Step 5: Verifikasi & commit**

Run: `npm test && npm run check && npm run build`
Expected: PASS, 0 error.

```bash
git add src/lib/kasir/cetak.ts src/lib/kasir/cetak.test.ts src/lib/components/kasir src/routes/kasir/+page.svelte
git commit -m "feat(kasir): layar jualan — grid menu, keranjang, bayar 5 metode, selesai & cetak struk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Riwayat & void, Tutup toko

**Files:**
- Create: `src/routes/kasir/riwayat/+page.svelte`, `src/routes/kasir/tutup/+page.svelte`, `src/lib/components/kasir/RingkasanShift.svelte`

**Interfaces:**
- Consumes: `daftarPenjualanShift`, `voidPenjualan`, `ringkasanShift`, `tutupShift` (Task 6); `pos`; `labelMetode`, `formatWaktuWib`; `barisStruk`, `encodeStruk`, `urlRawBT`, `printer`; `Konfirmasi`, `Button`.
- Produces: `<RingkasanShift r={Ringkasan} />`

- [ ] **Step 1: Ringkasan shift**

`src/lib/components/kasir/RingkasanShift.svelte`:
```svelte
<script lang="ts">
	import { labelMetode, METODE } from '#lib/kasir/bayar.ts';
	import type { Ringkasan } from '#lib/kasir/types.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { r }: { r: Ringkasan } = $props();
</script>

<div class="grid gap-3 rounded-2xl border border-line bg-surface p-4">
	<p class="text-sm text-muted">Shift dibuka {formatWaktuWib(r.dibuka_at)} WIB{r.ditutup_at ? ` · ditutup ${formatWaktuWib(r.ditutup_at)}` : ''}</p>
	<dl class="tabular grid grid-cols-2 gap-x-4 gap-y-1">
		<dt>Transaksi</dt><dd class="text-right font-semibold">{r.jumlah_transaksi}{r.jumlah_void ? ` (+${r.jumlah_void} batal)` : ''}</dd>
		{#each METODE as m (m.kode)}
			<dt class="text-muted">{labelMetode(m.kode)} ({r.per_metode[m.kode].jumlah})</dt>
			<dd class="text-right">Rp{formatAngka(r.per_metode[m.kode].total)}</dd>
		{/each}
		<dt class="font-bold">Total penjualan</dt><dd class="text-right font-bold">Rp{formatAngka(r.total)}</dd>
		<dt class="pt-2">Modal kembalian</dt><dd class="pt-2 text-right">Rp{formatAngka(r.modal)}</dd>
		<dt class="font-semibold">Cash seharusnya di laci</dt><dd class="text-right font-semibold">Rp{formatAngka(r.cash_seharusnya)}</dd>
		{#if r.uang_fisik !== null && r.selisih !== null}
			<dt>Uang dihitung</dt><dd class="text-right">Rp{formatAngka(r.uang_fisik)}</dd>
			<dt class="font-bold">Selisih</dt>
			<dd class="text-right font-bold {r.selisih === 0 ? 'text-ok' : 'text-danger'}">
				{r.selisih === 0 ? 'Pas' : `${r.selisih > 0 ? 'Lebih' : 'Kurang'} Rp${formatAngka(Math.abs(r.selisih))}`}
			</dd>
		{/if}
	</dl>
</div>
```

- [ ] **Step 2: Riwayat & void**

`src/routes/kasir/riwayat/+page.svelte`:
```svelte
<script lang="ts">
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { daftarPenjualanShift, voidPenjualan } from '#lib/kasir/api.ts';
	import { labelMetode } from '#lib/kasir/bayar.ts';
	import { encodeStruk, urlRawBT } from '#lib/kasir/escpos.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { printer } from '#lib/kasir/printer.svelte.ts';
	import { barisStruk, type DataStruk } from '#lib/kasir/struk.ts';
	import type { PenjualanRiwayat } from '#lib/kasir/types.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let daftar = $state<PenjualanRiwayat[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		if (!pos.shift) return;
		try {
			daftar = await daftarPenjualanShift(pos.shift.id);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	$effect(() => {
		if (pos.shift) void muat();
	});

	async function batal(p: PenjualanRiwayat) {
		pesanBaris[p.id] = '';
		try {
			await voidPenjualan(p.id, alasan[p.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[p.id] = (e as Error).message;
		}
	}

	function strukDari(p: PenjualanRiwayat): DataStruk {
		const o = pos.outlet!;
		return {
			outlet: { merek: o.merek, nama: o.nama, alamat: o.alamat, telepon: o.telepon },
			nomor: p.nomor,
			waktu: p.waktu,
			kasir: auth.profile?.nama_tampilan ?? '',
			item: p.item,
			total: p.total,
			metode: p.metode,
			diterima: p.diterima,
			kembalian: p.kembalian,
			cetakUlang: true,
			batal: p.void_at !== null
		};
	}

	async function cetakUlang(p: PenjualanRiwayat) {
		try {
			await printer.cetak(encodeStruk(barisStruk(strukDari(p))));
		} catch (e) {
			pesanBaris[p.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Riwayat · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Riwayat shift ini</h1>
{#if !pos.shift}
	<p class="mt-2 text-muted">Belum ada shift terbuka.</p>
{:else if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else if daftar.length === 0}
	<p class="mt-4 text-muted">Belum ada transaksi.</p>
{:else}
	<ul class="mt-4 grid gap-3">
		{#each daftar as p (p.id)}
			<li class="rounded-2xl border border-line bg-surface p-4 {p.void_at ? 'opacity-70' : ''}">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<p class="font-semibold">{p.nomor} <span class="text-sm font-normal text-muted">{formatWaktuWib(p.waktu)}</span></p>
					<p class="tabular font-bold {p.void_at ? 'line-through' : ''}">Rp{formatAngka(p.total)} · {labelMetode(p.metode)}</p>
				</div>
				<p class="mt-1 text-sm text-muted">{p.item.map((i) => `${i.qty}× ${i.nama}`).join(', ')}</p>
				{#if p.void_at}
					<p class="mt-1 text-sm font-semibold text-danger">Dibatalkan: {p.void_alasan}</p>
				{:else}
					<div class="mt-2 flex flex-wrap items-end gap-2">
						<div class="grid min-w-0 flex-1 gap-1">
							<label for="alasan-{p.id}" class="text-xs font-semibold text-muted">Alasan batal</label>
							<input
								id="alasan-{p.id}"
								bind:value={alasan[p.id]}
								placeholder="mis. salah input"
								class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg"
							/>
						</div>
						<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" onkonfirmasi={() => batal(p)} />
					</div>
				{/if}
				<div class="mt-2 flex flex-wrap gap-2">
					{#if printer.status === 'siap'}
						<button type="button" class="min-h-12 rounded-xl px-3 text-sm hover:bg-surface-2" onclick={() => cetakUlang(p)}>Cetak ulang</button>
					{:else}
						<a href={urlRawBT(encodeStruk(barisStruk(strukDari(p))))} class="inline-flex min-h-12 items-center rounded-xl px-3 text-sm hover:bg-surface-2"
							>Cetak ulang (RawBT)</a
						>
					{/if}
				</div>
				{#if pesanBaris[p.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[p.id]}</p>{/if}
			</li>
		{/each}
	</ul>
{/if}
```

- [ ] **Step 3: Tutup toko**

`src/routes/kasir/tutup/+page.svelte`:
```svelte
<script lang="ts">
	import RingkasanShift from '#lib/components/kasir/RingkasanShift.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { ringkasanShift, tutupShift } from '#lib/kasir/api.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import type { Ringkasan } from '#lib/kasir/types.ts';
	import { href } from '#lib/nav.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';

	let r = $state<Ringkasan | null>(null);
	let hasil = $state<Ringkasan | null>(null);
	let teks = $state('');
	let catatan = $state('');
	let pesan = $state('');

	$effect(() => {
		const s = pos.shift;
		if (!s) return;
		ringkasanShift(s.id)
			.then((x) => (r = x))
			.catch((e) => (pesan = (e as Error).message));
	});

	const uang = $derived(parseRupiah(teks));
	const selisih = $derived(r && uang !== null ? uang - r.cash_seharusnya : null);

	async function tutup() {
		pesan = '';
		if (!pos.shift || uang === null) {
			pesan = 'Isi jumlah uang yang ada di laci, mis. 350.000.';
			return;
		}
		try {
			hasil = await tutupShift(pos.shift.id, uang, catatan);
			await pos.muatShift();
		} catch (e) {
			pesan = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Tutup toko · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Tutup toko</h1>

{#if hasil}
	<p class="mt-2 font-semibold text-ok" role="status">Toko ditutup. Setorkan uang cash ke owner.</p>
	<div class="mt-4 max-w-md"><RingkasanShift r={hasil} /></div>
	<a href={href('/kasir')} class="mt-4 inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Ke layar jualan</a>
{:else if !pos.shift}
	<p class="mt-2 text-muted">Tidak ada shift terbuka.</p>
{:else if r}
	<div class="mt-4 grid max-w-md gap-4">
		<RingkasanShift {r} />
		<div class="grid gap-1.5">
			<label for="uang-laci" class="text-sm font-semibold">Uang cash yang ada di laci sekarang</label>
			<input
				id="uang-laci"
				bind:value={teks}
				inputmode="numeric"
				autocomplete="off"
				placeholder="0"
				class="tabular min-h-14 rounded-xl border border-line-strong bg-surface px-3 text-right text-2xl text-fg"
			/>
			{#if selisih !== null}
				<p class="text-sm font-semibold {selisih === 0 ? 'text-ok' : 'text-danger'}" role="status">
					{selisih === 0 ? 'Pas dengan catatan.' : `${selisih > 0 ? 'Lebih' : 'Kurang'} Rp${formatAngka(Math.abs(selisih))} dari catatan.`}
				</p>
			{/if}
		</div>
		<div class="grid gap-1.5">
			<label for="catatan-tutup" class="text-sm font-semibold">Catatan (opsional)</label>
			<input id="catatan-tutup" bind:value={catatan} maxlength="500" class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg" />
		</div>
		{#if pesan}<p class="text-sm text-danger" role="alert">{pesan}</p>{/if}
		<Konfirmasi label="Tutup toko" konfirmasiLabel="Ya, tutup toko" variant="primary" onkonfirmasi={tutup} />
	</div>
{:else if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{/if}
```

- [ ] **Step 4: Verifikasi & commit**

Run: `npm test && npm run check && npm run build`
Expected: PASS, 0 error.

```bash
git add src/routes/kasir/riwayat src/routes/kasir/tutup src/lib/components/kasir/RingkasanShift.svelte
git commit -m "feat(kasir): riwayat shift & pembatalan dengan alasan, tutup toko dengan selisih kas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Pasang ke server, E2E kasir, dokumentasi, daftar cek owner

**Files:**
- Create: `scripts/uji-kasir.ts`
- Modify: `README.md`, `docs/superpowers/plans/2026-10-04-00-roadmap.md`

- [ ] **Step 1: Pasang migrasi**

Run: `npm run sb -- db push --dry-run`
Expected: hanya `20261005000008_penjualan.sql`, `20261005000009_fungsi_kasir.sql`.

Run: `npm run sb -- db push --yes`
Expected: `Applying migration ...` ×2.

- [ ] **Step 2: E2E kasir (outlet & akun sementara, dibersihkan)**

`scripts/uji-kasir.ts`:
```ts
// E2E kasir terhadap Supabase sungguhan dengan outlet "UJI" & kasir sementara; semua dihapus di akhir.
//   node --env-file=.env.local scripts/uji-kasir.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { usernameToEmail } from '../src/lib/auth/username.ts';

const url = process.env.SUPABASE_URL!;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY!;
let gagal = 0;
const cek = (nama: string, ok: boolean, info = '') => {
	if (!ok) gagal++;
	console.log(`${ok ? 'OK   ' : 'GAGAL'} ${nama}${info ? ` — ${info}` : ''}`);
};

const tag = randomBytes(3).toString('hex');
let outletId = '';
let userId = '';

try {
	const o = await svc
		.from('outlets')
		.insert({ kode: 'UJI', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' })
		.select('id')
		.single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const menu = (await svc.from('menu').select('id, kode')).data ?? [];
	await svc.from('harga_jual').insert(menu.map((m) => ({ outlet_id: outletId, menu_id: m.id, harga: m.kode === 'ori_dada' ? 11000 : 5000 })));
	const dada = menu.find((m) => m.kode === 'ori_dada')!.id;
	const nasi = menu.find((m) => m.kode === 'nasi')!.id;

	const pw = randomBytes(12).toString('base64url');
	const u = `uji.kasir.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: 'Uji', role: 'kasir', outlet_kode: 'UJI' }
	});
	if (a.error) throw new Error(a.error.message);
	userId = a.data.user.id;
	const k: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: false } });
	const masuk = await k.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (masuk.error) throw new Error(masuk.error.message);

	const tanpaShift = await k.rpc('catat_penjualan', { p: { id: randomUUID(), outlet_id: outletId, metode: 'qris', item: [{ menu_id: nasi, qty: 1 }] } });
	cek('tanpa shift ditolak', /Shift belum dibuka/.test(tanpaShift.error?.message ?? ''), tanpaShift.error?.message);

	const s = await k.rpc('buka_shift', { p_outlet: outletId, p_modal: 100000 });
	cek('buka shift', !s.error && typeof s.data === 'string', s.error?.message);

	const id = randomUUID();
	const p = { id, outlet_id: outletId, metode: 'cash', diterima: 20000, waktu: new Date().toISOString(), item: [{ menu_id: dada, qty: 1, harga: 1 }] };
	const j1 = await k.rpc('catat_penjualan', { p });
	const j2 = await k.rpc('catat_penjualan', { p });
	cek('harga dari server & kembalian', j1.data?.total === 11000 && j1.data?.kembalian === 9000, JSON.stringify(j1.data ?? j1.error));
	cek('kirim ulang tidak menggandakan', j2.data?.nomor === j1.data?.nomor && j2.data?.ulang === true);
	cek('nomor format UJI-YYMMDD-001', /^UJI-\d{6}-001$/.test(j1.data?.nomor ?? ''), j1.data?.nomor);

	const q = await k.rpc('catat_penjualan', {
		p: { id: randomUUID(), outlet_id: outletId, metode: 'qris', waktu: new Date().toISOString(), item: [{ menu_id: nasi, qty: 2 }] }
	});
	cek('QRIS tercatat', q.data?.total === 10000, JSON.stringify(q.data ?? q.error));

	const lainOutlet = (await svc.from('outlets').select('id').eq('kode', 'BL').single()).data!.id;
	const nyasar = await k.rpc('catat_penjualan', { p: { id: randomUUID(), outlet_id: lainOutlet, metode: 'qris', item: [{ menu_id: nasi, qty: 1 }] } });
	cek('kasir tidak bisa jual untuk outlet lain', nyasar.error?.code === '42501', nyasar.error?.code);

	const v = await k.rpc('void_penjualan', { p_id: q.data.id, p_alasan: 'Uji batal' });
	cek('void dengan alasan', !v.error, v.error?.message);

	const lihat = await k.from('penjualan').select('nomor, item:penjualan_item(nama, qty)').order('nomor');
	cek('kasir membaca penjualan outletnya beserta item', (lihat.data ?? []).length === 2 && (lihat.data?.[0]?.item?.length ?? 0) === 1);

	const t = await k.rpc('tutup_shift', { p_shift: s.data, p_uang_fisik: 111000, p_catatan: 'uji' });
	cek(
		'tutup shift: cash seharusnya 111.000, selisih 0, void tidak dihitung',
		t.data?.cash_seharusnya === 111000 && t.data?.selisih === 0 && t.data?.jumlah_void === 1 && t.data?.total === 11000,
		JSON.stringify(t.data ?? t.error)
	);
} catch (e) {
	gagal++;
	console.error(`GAGAL langkah: ${(e as Error).message}`);
} finally {
	// Bersihkan semua data uji (service role).
	if (outletId) {
		const ids = ((await svc.from('penjualan').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (ids.length) await svc.from('penjualan_item').delete().in('penjualan_id', ids);
		await svc.from('penjualan').delete().eq('outlet_id', outletId);
		await svc.from('shift').delete().eq('outlet_id', outletId);
		await svc.from('nomor_harian').delete().eq('outlet_id', outletId);
	}
	if (userId) {
		const { error } = await svc.auth.admin.deleteUser(userId);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji ${userId}: ${error.message}`);
		}
	}
	if (outletId) {
		const { error } = await svc.from('outlets').delete().eq('id', outletId);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus outlet uji ${outletId}: ${error.message}`);
		}
	}
	console.log('\nData uji dibersihkan.');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
```

Run: `node --env-file=.env.local scripts/uji-kasir.ts`
Expected: semua `OK`, "Data uji dibersihkan.", "Semua pemeriksaan lulus".

- [ ] **Step 3: Dokumentasi**

README tabel Perintah, tambahkan:
```markdown
| `node --env-file=.env.local scripts/uji-kasir.ts` | uji alur kasir di server (outlet & akun sementara, dibersihkan otomatis) |
```

Roadmap: status Tahap 2 → `selesai (menunggu uji layar & printer owner)`, kolom rencana `2026-10-05-tahap-2-kasir.md`.

```bash
git add scripts/uji-kasir.ts README.md docs/superpowers/plans/2026-10-04-00-roadmap.md
git commit -m "test(e2e): alur kasir di server; docs Tahap 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Daftar cek owner** (tablet/HP Android + printer OKAY 58B)

1. Login kasir → kotak **Modal kembalian** muncul (terisi modal terakhir) → **Mulai jualan**.
2. Tap Dada Ori ×2, **Nasi Box** → keranjang Dada Ori 2, Nasi 1, Box 1, total 28.000. Kurangi/tambah dengan − / +.
3. **Bayar → Cash →** tekan "50.000" → Kembali 22.000 → Bayar → layar kembalian & nomor `BL-YYMMDD-001`.
4. **Sambungkan printer** (izinkan Bluetooth, pilih OKAY 58B). Bila tersambung: transaksi berikutnya tercetak otomatis; cek isi struk (nama outlet, alamat, nomor, waktu WIB, item, total, kembalian, "Terima kasih!"). Bila tidak bisa tersambung: pasang **RawBT** dari Play Store, sambungkan printer di RawBT, lalu pakai tombol **Cetak lewat RawBT**.
5. Bayar **QRIS/GoFood** → tanpa isian uang; struk menulis metodenya.
6. **Riwayat** → batalkan satu transaksi dengan alasan → tertanda "Dibatalkan".
7. **Tutup toko** → isi uang di laci → lihat selisih → **Ya, tutup toko** → ringkasan per metode.
8. Matikan Wi-Fi sebentar saat di layar jualan → muncul pita "Internet terputus", kasir **tidak** keluar ke halaman login.
9. Login admin → **Kasir** → pilih outlet → bisa jualan untuk outlet itu.
