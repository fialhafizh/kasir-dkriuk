# Tahap 1 — Data Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin bisa mengatur bahan baku & satuan beli (isi pack, ambang stok), menu & harga jual per outlet, resep pemotongan stok, harga beli per outlet, dan akun (tambah, ubah, reset password, nonaktifkan) dari aplikasi.

**Architecture:** Tabel master baru di Postgres (migrasi 0004–0006) dengan RLS: semua pengguna login boleh membaca data master yang dibutuhkan kasir, hanya admin yang menulis; harga beli hanya terlihat admin; harga jual hanya outlet sendiri untuk kasir. Perubahan multi-baris (resep, isi satuan beli) lewat fungsi SQL `security invoker` agar atomik. Akun dikelola lewat Supabase Edge Function `admin-akun` (service role di server); logika validasinya modul TS murni yang diuji Vitest, handler Deno tipis. Halaman admin memakai lapisan data tipis (`src/lib/master/api.ts`) dan fungsi murni untuk format/validasi.

**Tech Stack:** SvelteKit 3 + Svelte 5, Tailwind 4, Supabase (Postgres RLS, Auth admin API, Edge Functions Deno, deploy `--use-api`), Vitest + PGlite, Node 24 (type stripping) untuk script.

**Spec:** `docs/superpowers/specs/2026-10-04-kasir-dkriuk-design.md` (§2 peran, §3 menu & harga, §4 stok & bahan, §10 keamanan). Rancangan Tahap 1 disetujui owner di chat 4 Okt 2026 (bahan/satuan beli/menu/resep/harga beli/akun via Edge Function; minyak dalam liter; 1 admin, mendukung banyak admin). Wajib baca "Catatan wajib" di `docs/superpowers/plans/2026-10-04-00-roadmap.md`.

## Global Constraints

- **SvelteKit 3**: impor `#lib/...` selalu dengan ekstensi (`#lib/x/y.ts`, `.svelte.ts`, `.svelte`); env lewat `$app/env/public`; hash router — tautan pakai `href('/x')` dari `#lib/nav.ts`, rute aktif pakai `routePath(page.url)`; jangan buat `+layout.ts`.
- Migrasi 0001–0003 sudah ada di server: **jangan diubah**. Perubahan skema = migrasi baru bernomor berikutnya.
- Repo publik: **harga beli & data bisnis tidak boleh masuk migrasi atau file terlacak**. Harga jual boleh (tertera di menu/struk).
- Semua teks UI Bahasa Indonesia. Uang dalam Rupiah bulat (integer). Desimal ditampilkan dengan koma (1,3 kg).
- Maksimal 1000 baris per file; satu file satu tanggung jawab.
- Target sentuh ≥ 48 px (`min-h-12`), warna dari token tema (`bg-surface`, `text-muted`, `border-line-strong`, `outline-focus`, dst.).
- Jangan pernah memutuskan hak akses dari `app_metadata` di JWT; selalu dari `profiles` (lewat `is_admin()` / `my_outlet_id()`).
- Kunci rahasia (service role) hanya di Edge Function (env server) dan script lokal yang membaca `.env.local`; tidak pernah di kode `src/`.
- Kode outlet: `BL` Bukit Lama, `TK` Talang Kerangga, `KP` Kertapati (harga ayam & kulit −Rp1.000).
- Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Admin mengetik harga dengan format bebas ("11.000", "Rp 11000", "11rb", "-5") → angka sah tersimpan; yang tidak sah ditolak dengan pesan jelas, nilai lama tidak berubah. Diuji di Task 3 (`rupiah.test.ts`).
2. Admin menyimpan resep kosong atau bahan ganda → ditolak database tanpa menghapus resep lama (atomik). Diuji di Task 1 (`master.test.ts`, `simpan_resep`).
3. Admin terakhir menonaktifkan dirinya sendiri → ditolak, owner tidak terkunci. Diuji di Task 4 (`akun.test.ts`, `cekBolehNonaktif`).
4. Kasir membaca harga beli atau harga outlet lain lewat API → tidak dapat apa-apa. Diuji di Task 1 (`master.test.ts`).
5. Akun yang dinonaktifkan → langsung tidak bisa login lagi (diblokir di Auth, bukan menunggu sejam). Diuji di Task 4 (E2E `uji-akun.ts`: login → `user_banned`).

---

## File Structure

```
supabase/
├─ migrations/
│  ├─ 20261004000004_master.sql            # tabel bahan, satuan_beli(+isi), menu, harga_jual, resep, harga_beli, RLS, fungsi simpan_*
│  ├─ 20261004000005_seed_master.sql       # 23 bahan, 18 satuan beli, 17 menu, resep, harga jual 3 outlet (tanpa harga beli)
│  └─ 20261004000006_kunci_profil.sql      # profil hanya bisa diubah lewat fungsi server
├─ functions/
│  ├─ _shared/akun.ts                      # logika murni: baca perintah, aturan admin terakhir, password, email
│  └─ admin-akun/index.ts                  # handler Deno tipis (service role)
tests/
├─ db/master.test.ts                       # skema, seed, RLS, fungsi simpan_*
├─ db/core.test.ts, db/security.test.ts    # disesuaikan dengan kunci profil
├─ functions/akun.test.ts                  # logika murni fungsi server
└─ scripts/harga-beli.test.ts              # perencanaan seed harga beli
scripts/
├─ sb.ts                                   # menjalankan `npx supabase` dengan kredensial .env.local (output disamarkan)
├─ uji-akun.ts                             # E2E fungsi server dengan admin sementara (dihapus di akhir)
├─ seed-harga-beli.ts                      # isi harga beli dari data/harga-beli.local.json (diabaikan git)
└─ lib/harga-beli.ts                       # logika murni seed harga beli
src/lib/
├─ master/types.ts                         # tipe baris master
├─ master/rupiah.ts                        # format & parse Rupiah/qty (+test)
├─ master/porsi.ts                         # konversi porsi/kg beras (+test)
├─ master/susun.ts                         # peta harga, teks isi/resep (+test)
├─ master/pesan.ts                         # pesan error data (+test)
├─ master/api.ts                           # query & simpan ke Supabase
├─ akun/api.ts                             # panggil fungsi server admin-akun
├─ components/ui/HargaInput.svelte         # input Rupiah simpan-saat-selesai (+test render)
├─ components/ui/QtyInput.svelte           # input jumlah desimal simpan-saat-selesai
├─ components/ui/Konfirmasi.svelte         # tombol dua langkah (tanpa confirm())
└─ components/layout/AdminNav.svelte       # navigasi admin (bawah di HP, samping di tablet)
src/routes/admin/
├─ +layout.svelte                          # AppShell + AdminNav untuk semua halaman admin
├─ +page.svelte                            # beranda admin (tanpa AppShell sendiri)
├─ bahan/+page.svelte                      # bahan & satuan beli
├─ menu/+page.svelte                       # menu, harga jual per outlet, resep
├─ harga-beli/+page.svelte                 # harga beli per outlet
└─ akun/+page.svelte                       # kelola akun
```

---

### Task 1: Skema data master, seed publik, RLS, fungsi simpan atomik

**Files:**
- Create: `supabase/migrations/20261004000004_master.sql`, `supabase/migrations/20261004000005_seed_master.sql`
- Test: `tests/db/master.test.ts`

**Interfaces:**
- Consumes: `public.is_admin()`, `public.my_outlet_id()`, `public.outlets` (0001/0002); harness `freshDb`, `buatUser`, `sebagai`, `sebagaiAnon` (`tests/db/harness.ts`).
- Produces (SQL):
  - enum `mode_stok` (`otomatis`,`catat`,`analisis`), `kategori_menu` (`ayam`,`kulit`,`nasi`,`box`,`pelengkap`), `varian_ayam` (`ori`,`hot`)
  - `bahan(id, kode, nama, satuan, mode, urutan, aktif)`
  - `satuan_beli(id, kode, nama, ambang numeric null, harga_tetap bool, urutan, aktif)`
  - `satuan_beli_isi(satuan_beli_id, bahan_id, qty)`
  - `menu(id, kode, nama, kategori, varian, urutan, aktif)`
  - `harga_jual(outlet_id, menu_id, harga int)`
  - `resep(menu_id, bahan_id, qty)`
  - `harga_beli(outlet_id, satuan_beli_id, harga int, diubah_at)`
  - `simpan_resep(p_menu uuid, p_isi jsonb) returns void`, `simpan_isi_satuan_beli(p_satuan uuid, p_isi jsonb) returns void` — `p_isi` = `[{"bahan_id": uuid, "qty": number}]`

- [ ] **Step 1: Tulis test yang gagal**

`tests/db/master.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';

let db: PGlite;
let adminId: string;
let kasirKP: string;

async function satu<T>(sql: string, params: unknown[] = []): Promise<T> {
	return (await db.query<T>(sql, params)).rows[0];
}
async function jumlah(sql: string): Promise<number> {
	return (await satu<{ n: number }>(`select count(*)::int as n from ${sql}`)).n;
}
async function harga(outlet: string, menu: string): Promise<number> {
	return (
		await satu<{ harga: number }>(
			`select h.harga from public.harga_jual h join public.outlets o on o.id = h.outlet_id join public.menu m on m.id = h.menu_id where o.kode = $1 and m.kode = $2`,
			[outlet, menu]
		)
	).harga;
}
async function idDari(tabel: string, kode: string): Promise<string> {
	return (await satu<{ id: string }>(`select id from public.${tabel} where kode = $1`, [kode])).id;
}

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirKP = await buatUser(db, { username: 'kasir.kertapati', role: 'kasir', outlet_kode: 'KP' });
});

describe('seed master', () => {
	it('jumlah data awal', async () => {
		expect(await jumlah('public.bahan')).toBe(23);
		expect(await jumlah('public.satuan_beli')).toBe(18);
		expect(await jumlah('public.menu')).toBe(17);
		expect(await jumlah('public.resep')).toBe(19);
		expect(await jumlah('public.harga_jual')).toBe(51);
		expect(await jumlah('public.harga_beli')).toBe(0);
	});

	it('pack ayam Ori berisi 9 potong: 3 dada, 2 paha atas, 2 paha bawah, 2 sayap', async () => {
		const { rows } = await db.query<{ kode: string; qty: string }>(
			`select b.kode, i.qty from public.satuan_beli_isi i join public.bahan b on b.id = i.bahan_id
			 join public.satuan_beli s on s.id = i.satuan_beli_id where s.kode = 'pack_ayam_ori' order by b.kode`
		);
		expect(rows.map((r) => [r.kode, Number(r.qty)])).toEqual([
			['ori_dada', 3],
			['ori_paha_atas', 2],
			['ori_paha_bawah', 2],
			['ori_sayap', 2]
		]);
	});

	it('harga jual: Kertapati −Rp1.000 untuk ayam & kulit, sama untuk nasi/box/pelengkap', async () => {
		expect(await harga('BL', 'ori_dada')).toBe(11000);
		expect(await harga('TK', 'hot_sayap')).toBe(9000);
		expect(await harga('KP', 'ori_dada')).toBe(10000);
		expect(await harga('KP', 'hot_paha_bawah')).toBe(8000);
		expect(await harga('KP', 'kulit')).toBe(8000);
		expect(await harga('KP', 'nasi')).toBe(5000);
		expect(await harga('KP', 'box')).toBe(1000);
		expect(await harga('BL', 'saus_sambal')).toBe(0);
	});

	it('setiap menu punya resep, dan setiap bahan otomatis dipakai minimal satu resep', async () => {
		expect(await jumlah('public.menu m where not exists (select 1 from public.resep r where r.menu_id = m.id)')).toBe(0);
		expect(
			await jumlah(`public.bahan b where b.mode = 'otomatis' and not exists (select 1 from public.resep r where r.bahan_id = b.id)`)
		).toBe(0);
	});

	it('nasi memotong 0,1 kg beras dan 1 kertas nasi; kulit memotong 1 porsi kulit dan 1 cup', async () => {
		const { rows } = await db.query<{ menu: string; bahan: string; qty: string }>(
			`select m.kode as menu, b.kode as bahan, r.qty from public.resep r join public.menu m on m.id = r.menu_id
			 join public.bahan b on b.id = r.bahan_id where m.kode in ('nasi', 'kulit') order by 1, 2`
		);
		expect(rows.map((r) => [r.menu, r.bahan, Number(r.qty)])).toEqual([
			['kulit', 'cup_kulit', 1],
			['kulit', 'kulit', 1],
			['nasi', 'beras', 0.1],
			['nasi', 'kertas_nasi', 1]
		]);
	});

	it('tepung & minyak dianalisis, plastik merah hanya dicatat', async () => {
		const { rows } = await db.query<{ kode: string; mode: string }>(
			`select kode, mode from public.bahan where mode <> 'otomatis' order by kode`
		);
		expect(rows).toEqual([
			{ kode: 'minyak', mode: 'analisis' },
			{ kode: 'plastik_merah', mode: 'catat' },
			{ kode: 'tepung_a', mode: 'analisis' },
			{ kode: 'tepung_dkriuk', mode: 'analisis' }
		]);
	});
});

describe('RLS master', () => {
	it('pengunjung tanpa login tidak membaca menu maupun harga', async () => {
		const n = await sebagaiAnon(db, async () => (await db.query('select 1 from public.menu')).rows.length);
		expect(n).toBe(0);
	});

	it('kasir membaca menu, bahan, resep, satuan beli', async () => {
		const n = await sebagai(db, kasirKP, async () => [
			(await db.query('select 1 from public.menu')).rows.length,
			(await db.query('select 1 from public.bahan')).rows.length,
			(await db.query('select 1 from public.resep')).rows.length,
			(await db.query('select 1 from public.satuan_beli_isi')).rows.length
		]);
		expect(n).toEqual([17, 23, 19, 24]);
	});

	it('kasir hanya melihat harga jual outletnya sendiri', async () => {
		const kode = await sebagai(db, kasirKP, async () =>
			(await db.query<{ kode: string }>('select distinct o.kode from public.harga_jual h join public.outlets o on o.id = h.outlet_id')).rows
		);
		expect(kode).toEqual([{ kode: 'KP' }]);
	});

	it('kasir tidak melihat harga beli sama sekali', async () => {
		const bl = await idDari('outlets', 'BL');
		const s = await idDari('satuan_beli', 'pack_ayam_ori');
		await db.query('insert into public.harga_beli (outlet_id, satuan_beli_id, harga) values ($1, $2, 49000)', [bl, s]);
		const n = await sebagai(db, kasirKP, async () => (await db.query('select 1 from public.harga_beli')).rows.length);
		expect(n).toBe(0);
	});

	it('kasir tidak bisa mengubah harga jual', async () => {
		await sebagai(db, kasirKP, () => db.query('update public.harga_jual set harga = 1'));
		expect(await harga('KP', 'ori_dada')).toBe(10000);
	});

	it('admin bisa mengubah harga jual dan mengisi harga beli', async () => {
		const kp = await idDari('outlets', 'KP');
		const s = await idDari('satuan_beli', 'pack_kemasan_kecil');
		await sebagai(db, adminId, async () => {
			await db.query(`update public.harga_jual set harga = 12000 where menu_id = (select id from public.menu where kode = 'ori_dada')`);
			await db.query('insert into public.harga_beli (outlet_id, satuan_beli_id, harga) values ($1, $2, 25000)', [kp, s]);
		});
		expect(await harga('BL', 'ori_dada')).toBe(12000);
		expect(await jumlah('public.harga_beli')).toBe(1);
	});

	it('harga negatif ditolak', async () => {
		await expect(sebagai(db, adminId, () => db.query('update public.harga_jual set harga = -1'))).rejects.toThrow();
	});
});

describe('simpan_resep (atomik)', () => {
	it('admin mengganti seluruh resep satu menu', async () => {
		const nasi = await idDari('menu', 'nasi');
		const beras = await idDari('bahan', 'beras');
		await sebagai(db, adminId, () =>
			db.query('select public.simpan_resep($1, $2::jsonb)', [nasi, JSON.stringify([{ bahan_id: beras, qty: 0.08 }])])
		);
		const { rows } = await db.query<{ qty: string }>('select qty from public.resep where menu_id = $1', [nasi]);
		expect(rows.map((r) => Number(r.qty))).toEqual([0.08]);
	});

	it('resep kosong ditolak dan resep lama tetap utuh', async () => {
		const nasi = await idDari('menu', 'nasi');
		await expect(sebagai(db, adminId, () => db.query(`select public.simpan_resep($1, '[]'::jsonb)`, [nasi]))).rejects.toThrow(
			/minimal satu bahan/
		);
		expect(await jumlah(`public.resep where menu_id = '${nasi}'`)).toBe(2);
	});

	it('bahan ganda ditolak dan resep lama tetap utuh', async () => {
		const nasi = await idDari('menu', 'nasi');
		const beras = await idDari('bahan', 'beras');
		const isi = JSON.stringify([
			{ bahan_id: beras, qty: 0.1 },
			{ bahan_id: beras, qty: 0.2 }
		]);
		await expect(sebagai(db, adminId, () => db.query('select public.simpan_resep($1, $2::jsonb)', [nasi, isi]))).rejects.toThrow();
		expect(await jumlah(`public.resep where menu_id = '${nasi}'`)).toBe(2);
	});

	it('kasir tidak boleh mengubah resep', async () => {
		const nasi = await idDari('menu', 'nasi');
		const beras = await idDari('bahan', 'beras');
		await expect(
			sebagai(db, kasirKP, () => db.query('select public.simpan_resep($1, $2::jsonb)', [nasi, JSON.stringify([{ bahan_id: beras, qty: 1 }])]))
		).rejects.toThrow(/Hanya admin/);
	});
});

describe('simpan_isi_satuan_beli (atomik)', () => {
	it('admin mengubah isi pack kulit dari 17 menjadi 18 porsi', async () => {
		const pack = await idDari('satuan_beli', 'pack_kulit');
		const kulit = await idDari('bahan', 'kulit');
		await sebagai(db, adminId, () =>
			db.query('select public.simpan_isi_satuan_beli($1, $2::jsonb)', [pack, JSON.stringify([{ bahan_id: kulit, qty: 18 }])])
		);
		const { rows } = await db.query<{ qty: string }>('select qty from public.satuan_beli_isi where satuan_beli_id = $1', [pack]);
		expect(rows.map((r) => Number(r.qty))).toEqual([18]);
	});

	it('jumlah nol ditolak dan isi lama tetap utuh', async () => {
		const pack = await idDari('satuan_beli', 'pack_kulit');
		const kulit = await idDari('bahan', 'kulit');
		await expect(
			sebagai(db, adminId, () =>
				db.query('select public.simpan_isi_satuan_beli($1, $2::jsonb)', [pack, JSON.stringify([{ bahan_id: kulit, qty: 0 }])])
			)
		).rejects.toThrow();
		expect(await jumlah(`public.satuan_beli_isi where satuan_beli_id = '${pack}'`)).toBe(1);
	});
});
```

Catatan angka: 23 bahan = 8 potongan ayam + 11 bahan otomatis lain + 1 catat + 3 analisis; 24 baris isi = 2 pack ayam × 4 + 16 satuan beli satu bahan; 19 resep; 51 harga jual = 17 menu × 3 outlet.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/db/master.test.ts`
Expected: FAIL, `relation "public.bahan" does not exist`.

- [ ] **Step 3: Tulis migrasi skema**

`supabase/migrations/20261004000004_master.sql`:
```sql
-- Data master: bahan baku, satuan beli (isi pack), menu, harga jual per outlet, resep, harga beli per outlet.

create type public.mode_stok as enum ('otomatis', 'catat', 'analisis');
create type public.kategori_menu as enum ('ayam', 'kulit', 'nasi', 'box', 'pelengkap');
create type public.varian_ayam as enum ('ori', 'hot');

create table public.bahan (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique check (kode ~ '^[a-z0-9_]{2,40}$'),
  nama text not null check (length(trim(nama)) > 0),
  satuan text not null check (satuan in ('potong', 'porsi', 'pcs', 'lembar', 'sachet', 'kg', 'liter')),
  mode public.mode_stok not null default 'otomatis',
  urutan int not null default 0,
  aktif boolean not null default true
);

create table public.satuan_beli (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique check (kode ~ '^[a-z0-9_]{2,40}$'),
  nama text not null check (length(trim(nama)) > 0),
  -- ambang stok menipis dalam jumlah satuan beli (mis. 10 pack); null = tidak dipantau
  ambang numeric(10, 2) check (ambang is null or ambang >= 0),
  -- false: harga berubah-ubah, diisi setiap barang masuk (harga di tabel harga_beli hanya acuan)
  harga_tetap boolean not null default true,
  urutan int not null default 0,
  aktif boolean not null default true
);

create table public.satuan_beli_isi (
  satuan_beli_id uuid not null references public.satuan_beli (id) on delete cascade,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty numeric(12, 3) not null check (qty > 0),
  primary key (satuan_beli_id, bahan_id)
);

create table public.menu (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique check (kode ~ '^[a-z0-9_]{2,40}$'),
  nama text not null check (length(trim(nama)) > 0),
  kategori public.kategori_menu not null,
  varian public.varian_ayam,
  urutan int not null default 0,
  aktif boolean not null default true,
  constraint ayam_punya_varian check ((kategori = 'ayam') = (varian is not null))
);

create table public.harga_jual (
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  menu_id uuid not null references public.menu (id) on delete cascade,
  harga integer not null check (harga >= 0 and harga <= 10000000),
  primary key (outlet_id, menu_id)
);

create table public.resep (
  menu_id uuid not null references public.menu (id) on delete cascade,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty numeric(12, 4) not null check (qty > 0),
  primary key (menu_id, bahan_id)
);

create table public.harga_beli (
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  satuan_beli_id uuid not null references public.satuan_beli (id) on delete cascade,
  harga integer not null check (harga >= 0 and harga <= 100000000),
  diubah_at timestamptz not null default now(),
  primary key (outlet_id, satuan_beli_id)
);

-- RLS: admin menulis semua tabel master; pembacaan diatur per tabel di bawah.
do $$
declare t text;
begin
  foreach t in array array['bahan', 'satuan_beli', 'satuan_beli_isi', 'menu', 'harga_jual', 'resep', 'harga_beli'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_admin_tambah', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_admin_ubah', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t || '_admin_hapus', t);
  end loop;
end
$$;

-- Dibaca semua pengguna login (layar kasir butuh menu, resep, bahan untuk stok).
create policy bahan_baca on public.bahan for select to authenticated using (true);
create policy satuan_beli_baca on public.satuan_beli for select to authenticated using (true);
create policy satuan_beli_isi_baca on public.satuan_beli_isi for select to authenticated using (true);
create policy menu_baca on public.menu for select to authenticated using (true);
create policy resep_baca on public.resep for select to authenticated using (true);
-- Kasir hanya harga outletnya; admin semua.
create policy harga_jual_baca on public.harga_jual for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
-- Harga beli hanya admin.
create policy harga_beli_baca on public.harga_beli for select to authenticated using ((select public.is_admin()));

-- Ganti seluruh isi satu resep / satu satuan beli dalam satu transaksi.
-- security invoker: RLS & hak pemanggil tetap berlaku; pengecekan admin eksplisit memberi pesan jelas.
create function public.simpan_resep(p_menu uuid, p_isi jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh mengubah resep' using errcode = '42501';
  end if;
  if jsonb_typeof(p_isi) <> 'array' or jsonb_array_length(p_isi) = 0 then
    raise exception 'Resep minimal satu bahan' using errcode = '22023';
  end if;
  delete from public.resep where menu_id = p_menu;
  insert into public.resep (menu_id, bahan_id, qty)
  select p_menu, (x ->> 'bahan_id')::uuid, (x ->> 'qty')::numeric
  from jsonb_array_elements(p_isi) as x;
end
$$;

create function public.simpan_isi_satuan_beli(p_satuan uuid, p_isi jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh mengubah isi satuan beli' using errcode = '42501';
  end if;
  if jsonb_typeof(p_isi) <> 'array' or jsonb_array_length(p_isi) = 0 then
    raise exception 'Isi satuan beli minimal satu bahan' using errcode = '22023';
  end if;
  delete from public.satuan_beli_isi where satuan_beli_id = p_satuan;
  insert into public.satuan_beli_isi (satuan_beli_id, bahan_id, qty)
  select p_satuan, (x ->> 'bahan_id')::uuid, (x ->> 'qty')::numeric
  from jsonb_array_elements(p_isi) as x;
end
$$;

revoke execute on function public.simpan_resep(uuid, jsonb) from public, anon;
revoke execute on function public.simpan_isi_satuan_beli(uuid, jsonb) from public, anon;
grant execute on function public.simpan_resep(uuid, jsonb) to authenticated;
grant execute on function public.simpan_isi_satuan_beli(uuid, jsonb) to authenticated;
```

- [ ] **Step 4: Tulis migrasi seed publik**

`supabase/migrations/20261004000005_seed_master.sql`:
```sql
-- Data master awal. Harga beli TIDAK di sini (data bisnis; diisi lewat aplikasi / script lokal).

insert into public.bahan (kode, nama, satuan, mode, urutan) values
  ('ori_dada', 'Dada Ori', 'potong', 'otomatis', 10),
  ('ori_paha_atas', 'Paha Atas Ori', 'potong', 'otomatis', 11),
  ('ori_paha_bawah', 'Paha Bawah Ori', 'potong', 'otomatis', 12),
  ('ori_sayap', 'Sayap Ori', 'potong', 'otomatis', 13),
  ('hot_dada', 'Dada Hot', 'potong', 'otomatis', 20),
  ('hot_paha_atas', 'Paha Atas Hot', 'potong', 'otomatis', 21),
  ('hot_paha_bawah', 'Paha Bawah Hot', 'potong', 'otomatis', 22),
  ('hot_sayap', 'Sayap Hot', 'potong', 'otomatis', 23),
  ('kulit', 'Kulit Mentah', 'porsi', 'otomatis', 30),
  ('cup_kulit', 'Cup Kulit', 'pcs', 'otomatis', 31),
  ('beras', 'Beras', 'kg', 'otomatis', 40),
  ('kertas_nasi', 'Kertas Nasi', 'lembar', 'otomatis', 41),
  ('box', 'Box D''Kriuk', 'pcs', 'otomatis', 42),
  ('kemasan_besar', 'Kemasan Besar', 'pcs', 'otomatis', 50),
  ('kemasan_kecil', 'Kemasan Kecil', 'pcs', 'otomatis', 51),
  ('plastik_besar', 'Plastik Besar', 'pcs', 'otomatis', 52),
  ('plastik_kecil', 'Plastik Kecil', 'pcs', 'otomatis', 53),
  ('plastik_merah', 'Plastik Merah', 'pcs', 'catat', 54),
  ('saus_sambal', 'Saus Sambal', 'sachet', 'otomatis', 60),
  ('saus_tomat', 'Saus Tomat', 'sachet', 'otomatis', 61),
  ('tepung_dkriuk', 'Tepung D''Kriuk', 'kg', 'analisis', 70),
  ('tepung_a', 'Tepung A', 'kg', 'analisis', 71),
  ('minyak', 'Minyak Goreng', 'liter', 'analisis', 72);

insert into public.satuan_beli (kode, nama, ambang, harga_tetap, urutan) values
  ('pack_ayam_ori', 'Pack Ayam Ori (1 kg)', 10, true, 10),
  ('pack_ayam_hot', 'Pack Ayam Hot (1 kg)', 5, true, 11),
  ('pack_kulit', 'Pack Kulit Mentah', null, true, 20),
  ('pack_cup_kulit', 'Pack Cup Kulit', 1, true, 21),
  ('beras_kg', 'Beras (per kg)', null, false, 30),
  ('pack_kertas_nasi', 'Pack Kertas Nasi', null, true, 31),
  ('pack_box', 'Pack Box D''Kriuk', null, true, 32),
  ('pack_kemasan_besar', 'Pack Kemasan Besar', 2, true, 40),
  ('pack_kemasan_kecil', 'Pack Kemasan Kecil', 2, true, 41),
  ('pack_plastik_besar', 'Pack Plastik Besar 36/25', null, true, 42),
  ('pack_plastik_kecil', 'Pack Plastik Kecil 25/15', null, true, 43),
  ('pack_plastik_merah', 'Pack Plastik Merah', null, true, 44),
  ('pack_saus_sambal', 'Pack Saus Sambal', null, true, 50),
  ('pack_saus_tomat', 'Pack Saus Tomat', null, true, 51),
  ('pack_tepung_dkriuk', 'Pack Tepung D''Kriuk (1,3 kg)', null, true, 60),
  ('karung_tepung_dkriuk', 'Karung Tepung D''Kriuk (19,5 kg)', null, true, 61),
  ('karung_tepung_a', 'Karung Tepung A (25 kg)', null, false, 62),
  ('minyak_liter', 'Minyak Goreng (per liter)', null, false, 70);

insert into public.satuan_beli_isi (satuan_beli_id, bahan_id, qty)
select s.id, b.id, v.qty
from (values
  ('pack_ayam_ori', 'ori_dada', 3), ('pack_ayam_ori', 'ori_paha_atas', 2),
  ('pack_ayam_ori', 'ori_paha_bawah', 2), ('pack_ayam_ori', 'ori_sayap', 2),
  ('pack_ayam_hot', 'hot_dada', 3), ('pack_ayam_hot', 'hot_paha_atas', 2),
  ('pack_ayam_hot', 'hot_paha_bawah', 2), ('pack_ayam_hot', 'hot_sayap', 2),
  ('pack_kulit', 'kulit', 17),
  ('pack_cup_kulit', 'cup_kulit', 50),
  ('beras_kg', 'beras', 1),
  ('pack_kertas_nasi', 'kertas_nasi', 100),
  ('pack_box', 'box', 100),
  ('pack_kemasan_besar', 'kemasan_besar', 100),
  ('pack_kemasan_kecil', 'kemasan_kecil', 100),
  ('pack_plastik_besar', 'plastik_besar', 50),
  ('pack_plastik_kecil', 'plastik_kecil', 100),
  ('pack_plastik_merah', 'plastik_merah', 50),
  ('pack_saus_sambal', 'saus_sambal', 100),
  ('pack_saus_tomat', 'saus_tomat', 100),
  ('pack_tepung_dkriuk', 'tepung_dkriuk', 1.3),
  ('karung_tepung_dkriuk', 'tepung_dkriuk', 19.5),
  ('karung_tepung_a', 'tepung_a', 25),
  ('minyak_liter', 'minyak', 1)
) as v (satuan, bahan, qty)
join public.satuan_beli s on s.kode = v.satuan
join public.bahan b on b.kode = v.bahan;

insert into public.menu (kode, nama, kategori, varian, urutan) values
  ('ori_dada', 'Dada Ori', 'ayam', 'ori', 10),
  ('ori_paha_atas', 'Paha Atas Ori', 'ayam', 'ori', 11),
  ('ori_paha_bawah', 'Paha Bawah Ori', 'ayam', 'ori', 12),
  ('ori_sayap', 'Sayap Ori', 'ayam', 'ori', 13),
  ('hot_dada', 'Dada Hot', 'ayam', 'hot', 20),
  ('hot_paha_atas', 'Paha Atas Hot', 'ayam', 'hot', 21),
  ('hot_paha_bawah', 'Paha Bawah Hot', 'ayam', 'hot', 22),
  ('hot_sayap', 'Sayap Hot', 'ayam', 'hot', 23),
  ('kulit', 'Kulit Krispy', 'kulit', null, 30),
  ('nasi', 'Nasi', 'nasi', null, 40),
  ('box', 'Box', 'box', null, 41),
  ('kemasan_besar', 'Kemasan Besar', 'pelengkap', null, 50),
  ('kemasan_kecil', 'Kemasan Kecil', 'pelengkap', null, 51),
  ('plastik_besar', 'Plastik Besar', 'pelengkap', null, 52),
  ('plastik_kecil', 'Plastik Kecil', 'pelengkap', null, 53),
  ('saus_sambal', 'Saus Sambal', 'pelengkap', null, 54),
  ('saus_tomat', 'Saus Tomat', 'pelengkap', null, 55);

insert into public.resep (menu_id, bahan_id, qty)
select m.id, b.id, v.qty
from (values
  ('ori_dada', 'ori_dada', 1), ('ori_paha_atas', 'ori_paha_atas', 1),
  ('ori_paha_bawah', 'ori_paha_bawah', 1), ('ori_sayap', 'ori_sayap', 1),
  ('hot_dada', 'hot_dada', 1), ('hot_paha_atas', 'hot_paha_atas', 1),
  ('hot_paha_bawah', 'hot_paha_bawah', 1), ('hot_sayap', 'hot_sayap', 1),
  ('kulit', 'kulit', 1), ('kulit', 'cup_kulit', 1),
  ('nasi', 'beras', 0.1), ('nasi', 'kertas_nasi', 1),
  ('box', 'box', 1),
  ('kemasan_besar', 'kemasan_besar', 1), ('kemasan_kecil', 'kemasan_kecil', 1),
  ('plastik_besar', 'plastik_besar', 1), ('plastik_kecil', 'plastik_kecil', 1),
  ('saus_sambal', 'saus_sambal', 1), ('saus_tomat', 'saus_tomat', 1)
) as v (menu, bahan, qty)
join public.menu m on m.kode = v.menu
join public.bahan b on b.kode = v.bahan;

-- Harga jual standar; Kertapati −Rp1.000 untuk ayam & kulit.
insert into public.harga_jual (outlet_id, menu_id, harga)
select o.id, m.id,
  case when o.kode = 'KP' and m.kategori in ('ayam', 'kulit') then h.harga - 1000 else h.harga end
from (values
  ('ori_dada', 11000), ('ori_paha_atas', 11000), ('ori_paha_bawah', 9000), ('ori_sayap', 9000),
  ('hot_dada', 11000), ('hot_paha_atas', 11000), ('hot_paha_bawah', 9000), ('hot_sayap', 9000),
  ('kulit', 9000), ('nasi', 5000), ('box', 1000),
  ('kemasan_besar', 0), ('kemasan_kecil', 0), ('plastik_besar', 0), ('plastik_kecil', 0),
  ('saus_sambal', 0), ('saus_tomat', 0)
) as h (kode, harga)
join public.menu m on m.kode = h.kode
cross join public.outlets o;
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/db/master.test.ts`
Expected: PASS (semua test di file ini).

- [ ] **Step 6: Jalankan seluruh suite & commit**

Run: `npm test`
Expected: semua PASS.

```bash
git add supabase/migrations/20261004000004_master.sql supabase/migrations/20261004000005_seed_master.sql tests/db/master.test.ts
git commit -m "feat(db): data master (bahan, satuan beli, menu, harga jual, resep, harga beli) + RLS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Kunci profil — perubahan akun hanya lewat fungsi server

**Files:**
- Create: `supabase/migrations/20261004000006_kunci_profil.sql`
- Modify: `tests/db/core.test.ts` (test "admin bisa menonaktifkan kasir", "kasir tidak bisa menaikkan perannya menjadi admin"), `tests/db/security.test.ts` (test "tidak bisa menghapus profil maupun outlet", "tidak bisa memindah outlet atau mengaktifkan ulang dirinya")

**Interfaces:**
- Produces: tabel `profiles` hanya bisa di-SELECT oleh `authenticated` (sesuai RLS); INSERT/UPDATE/DELETE hanya `service_role` (Edge Function, Task 4).

- [ ] **Step 1: Ubah test agar menuntut kunci profil (gagal dulu)**

Di `tests/db/core.test.ts`, ganti test `kasir tidak bisa menaikkan perannya menjadi admin` dan `admin bisa menonaktifkan kasir` dengan:
```ts
	it('kasir tidak bisa menaikkan perannya menjadi admin', async () => {
		await expect(
			sebagai(db, kasirBL, () => db.query(`update public.profiles set role = 'admin' where id = $1`, [kasirBL]))
		).rejects.toThrow(/permission denied/);
		const { rows } = await db.query<{ role: string }>('select role from public.profiles where id = $1', [kasirBL]);
		expect(rows[0].role).toBe('kasir');
	});

	it('admin pun tidak bisa mengubah profil lewat API (hanya lewat fungsi server)', async () => {
		await expect(
			sebagai(db, adminId, () => db.query('update public.profiles set aktif = false where id = $1', [kasirTK]))
		).rejects.toThrow(/permission denied/);
		const { rows } = await db.query<{ aktif: boolean }>('select aktif from public.profiles where id = $1', [kasirTK]);
		expect(rows[0].aktif).toBe(true);
	});
```

Di `tests/db/security.test.ts`, ganti test `tidak bisa menghapus profil maupun outlet` dan `tidak bisa memindah outlet atau mengaktifkan ulang dirinya` dengan:
```ts
	it('tidak bisa menghapus profil maupun outlet', async () => {
		await expect(sebagai(db, kasirBL, () => db.query('delete from public.profiles'))).rejects.toThrow(/permission denied/);
		await sebagai(db, kasirBL, () => db.query('delete from public.outlets'));
		expect(await jumlah('public.profiles')).toBe(2);
		expect(await jumlah('public.outlets')).toBe(3);
	});

	it('tidak bisa memindah outlet atau mengaktifkan ulang dirinya', async () => {
		await expect(
			sebagai(db, kasirBL, () =>
				db.query(`update public.profiles set outlet_id = (select id from public.outlets where kode = 'TK'), aktif = true where id = $1`, [
					kasirBL
				])
			)
		).rejects.toThrow(/permission denied/);
		const { rows } = await db.query<{ kode: string }>(
			'select o.kode from public.profiles p join public.outlets o on o.id = p.outlet_id where p.id = $1',
			[kasirBL]
		);
		expect(rows[0].kode).toBe('BL');
	});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/db/core.test.ts tests/db/security.test.ts`
Expected: FAIL pada 4 test di atas (`promise resolved ... instead of rejecting`).

- [ ] **Step 3: Tulis migrasi**

`supabase/migrations/20261004000006_kunci_profil.sql`:
```sql
-- Profil (peran, outlet, aktif, username) hanya diubah lewat Edge Function admin-akun (service role),
-- supaya username di Auth & profil tetap sama dan admin terakhir tidak bisa mengunci dirinya.
drop policy if exists profiles_admin_ubah on public.profiles;
revoke insert, update, delete on public.profiles from anon, authenticated;
```

- [ ] **Step 4: Jalankan test, pastikan lulus; lalu seluruh suite**

Run: `npx vitest run tests/db` lalu `npm test`
Expected: semua PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261004000006_kunci_profil.sql tests/db/core.test.ts tests/db/security.test.ts
git commit -m "feat(db): profil hanya bisa diubah lewat fungsi server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Logika murni data master (Rupiah, jumlah, porsi beras, susunan tabel, pesan error)

**Files:**
- Create: `src/lib/master/types.ts`, `src/lib/master/rupiah.ts`, `src/lib/master/porsi.ts`, `src/lib/master/susun.ts`, `src/lib/master/pesan.ts`
- Test: `src/lib/master/rupiah.test.ts`, `src/lib/master/porsi.test.ts`, `src/lib/master/susun.test.ts`, `src/lib/master/pesan.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `ModeStok`, `KategoriMenu`, `Bahan`, `SatuanBeli`, `IsiSatuanBeli`, `Menu`, `HargaJual`, `Resep`, `HargaBeli`, `BarisIsi = { bahan_id: string; qty: number }`
  - `rupiah.ts`: `formatAngka(n: number): string`, `formatRupiah(n: number): string`, `parseRupiah(teks: string): number | null`, `formatQty(n: number): string`, `parseQty(teks: string): number | null`
  - `porsi.ts`: `porsiPerKg(qtyKg: number): number`, `qtyKgDariPorsi(porsi: number): number`
  - `susun.ts`: `kunciHarga(outletId: string, id: string): string`, `petaHarga<T extends { outlet_id: string; harga: number }>(baris: T[], idDari: (b: T) => string): Map<string, number>`, `teksIsi(isi: { bahan_id: string; qty: number }[], bahan: Pick<Bahan, 'id' | 'nama' | 'satuan'>[]): string`
  - `pesan.ts`: `pesanErrorData(err: { code?: string; message?: string; status?: number; name?: string } | null): string | null`

- [ ] **Step 1: Tulis test yang gagal**

`src/lib/master/rupiah.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatAngka, formatQty, formatRupiah, parseQty, parseRupiah } from './rupiah';

describe('Rupiah', () => {
	it('format dengan titik ribuan', () => {
		expect(formatAngka(11000)).toBe('11.000');
		expect(formatAngka(117200)).toBe('117.200');
		expect(formatAngka(0)).toBe('0');
		expect(formatRupiah(9000)).toBe('Rp9.000');
	});

	it('parse format yang biasa diketik admin', () => {
		expect(parseRupiah('11.000')).toBe(11000);
		expect(parseRupiah('11000')).toBe(11000);
		expect(parseRupiah('Rp 11.000')).toBe(11000);
		expect(parseRupiah(' rp11.000 ')).toBe(11000);
		expect(parseRupiah('0')).toBe(0);
	});

	it('menolak yang bukan Rupiah bulat sah', () => {
		expect(parseRupiah('')).toBeNull();
		expect(parseRupiah('11rb')).toBeNull();
		expect(parseRupiah('-5')).toBeNull();
		expect(parseRupiah('11,5')).toBeNull();
		expect(parseRupiah('1.2.3a')).toBeNull();
		expect(parseRupiah('100.000.001')).toBeNull();
	});
});

describe('jumlah (qty)', () => {
	it('format desimal dengan koma, tanpa nol berlebih', () => {
		expect(formatQty(1.3)).toBe('1,3');
		expect(formatQty(17)).toBe('17');
		expect(formatQty(0.1)).toBe('0,1');
		expect(formatQty(19.5)).toBe('19,5');
	});

	it('parse koma atau titik desimal', () => {
		expect(parseQty('0,1')).toBe(0.1);
		expect(parseQty('1.3')).toBe(1.3);
		expect(parseQty('17')).toBe(17);
	});

	it('menolak nol, negatif, teks, dan lebih dari 4 desimal', () => {
		expect(parseQty('0')).toBeNull();
		expect(parseQty('-1')).toBeNull();
		expect(parseQty('abc')).toBeNull();
		expect(parseQty('0,00001')).toBeNull();
		expect(parseQty('')).toBeNull();
	});
});
```

`src/lib/master/porsi.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { porsiPerKg, qtyKgDariPorsi } from './porsi';

describe('porsi beras', () => {
	it('0,1 kg per porsi = 10 porsi per kg', () => {
		expect(porsiPerKg(0.1)).toBe(10);
		expect(qtyKgDariPorsi(10)).toBe(0.1);
	});
	it('kalibrasi 14 porsi/kg dibulatkan 4 desimal', () => {
		expect(qtyKgDariPorsi(14)).toBe(0.0714);
		expect(porsiPerKg(0.0714)).toBe(14);
	});
	it('nilai tidak sah menghasilkan NaN agar UI menolak', () => {
		expect(qtyKgDariPorsi(0)).toBeNaN();
		expect(porsiPerKg(0)).toBeNaN();
	});
});
```

`src/lib/master/susun.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { kunciHarga, petaHarga, teksIsi } from './susun';

describe('petaHarga', () => {
	it('mengelompokkan harga per outlet & item', () => {
		const peta = petaHarga(
			[
				{ outlet_id: 'o1', menu_id: 'm1', harga: 11000 },
				{ outlet_id: 'o2', menu_id: 'm1', harga: 10000 }
			],
			(b) => b.menu_id
		);
		expect(peta.get(kunciHarga('o1', 'm1'))).toBe(11000);
		expect(peta.get(kunciHarga('o2', 'm1'))).toBe(10000);
		expect(peta.get(kunciHarga('o3', 'm1'))).toBeUndefined();
	});
});

describe('teksIsi', () => {
	const bahan = [
		{ id: 'b1', nama: 'Dada Ori', satuan: 'potong' },
		{ id: 'b2', nama: 'Beras', satuan: 'kg' },
		{ id: 'b3', nama: 'Kertas Nasi', satuan: 'lembar' }
	];
	it('menuliskan isi dengan jumlah, satuan, dan nama, urut sesuai masukan', () => {
		expect(
			teksIsi(
				[
					{ bahan_id: 'b2', qty: 0.1 },
					{ bahan_id: 'b3', qty: 1 }
				],
				bahan
			)
		).toBe('0,1 kg Beras · 1 lembar Kertas Nasi');
	});
	it('bahan yang tidak dikenal ditandai, bukan dibuang diam-diam', () => {
		expect(teksIsi([{ bahan_id: 'x', qty: 2 }], bahan)).toBe('2 (bahan tidak dikenal)');
	});
	it('kosong', () => {
		expect(teksIsi([], bahan)).toBe('—');
	});
});
```

`src/lib/master/pesan.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pesanErrorData } from './pesan';

describe('pesanErrorData', () => {
	it('tanpa error → null', () => {
		expect(pesanErrorData(null)).toBeNull();
	});
	it('tidak berhak', () => {
		expect(pesanErrorData({ code: '42501', message: 'Hanya admin yang boleh mengubah resep' })).toBe(
			'Anda tidak punya izin untuk perubahan ini.'
		);
	});
	it('isian tidak sah dari database memakai pesan database bila berbahasa Indonesia', () => {
		expect(pesanErrorData({ code: '22023', message: 'Resep minimal satu bahan' })).toBe('Resep minimal satu bahan.');
	});
	it('data ganda', () => {
		expect(pesanErrorData({ code: '23505', message: 'duplicate key' })).toBe('Ada data ganda. Periksa isian Anda.');
	});
	it('melanggar batas (cek/angka)', () => {
		expect(pesanErrorData({ code: '23514', message: 'violates check constraint' })).toBe('Isian di luar batas yang diizinkan.');
	});
	it('jaringan putus', () => {
		expect(pesanErrorData({ message: 'TypeError: Failed to fetch' })).toBe(
			'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.'
		);
	});
	it('lainnya → pesan umum', () => {
		expect(pesanErrorData({ code: 'XX000', message: 'boom' })).toBe('Gagal menyimpan. Coba lagi beberapa saat lagi.');
	});
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/lib/master`
Expected: FAIL, modul `./rupiah`, `./porsi`, `./susun`, `./pesan` belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/master/types.ts`:
```ts
export type ModeStok = 'otomatis' | 'catat' | 'analisis';
export type KategoriMenu = 'ayam' | 'kulit' | 'nasi' | 'box' | 'pelengkap';

export interface Bahan {
	id: string;
	kode: string;
	nama: string;
	satuan: string;
	mode: ModeStok;
	urutan: number;
	aktif: boolean;
}

export interface SatuanBeli {
	id: string;
	kode: string;
	nama: string;
	ambang: number | null;
	harga_tetap: boolean;
	urutan: number;
	aktif: boolean;
}

export interface BarisIsi {
	bahan_id: string;
	qty: number;
}

export interface IsiSatuanBeli extends BarisIsi {
	satuan_beli_id: string;
}

export interface Menu {
	id: string;
	kode: string;
	nama: string;
	kategori: KategoriMenu;
	varian: 'ori' | 'hot' | null;
	urutan: number;
	aktif: boolean;
}

export interface HargaJual {
	outlet_id: string;
	menu_id: string;
	harga: number;
}

export interface Resep extends BarisIsi {
	menu_id: string;
}

export interface HargaBeli {
	outlet_id: string;
	satuan_beli_id: string;
	harga: number;
	diubah_at: string;
}
```

`src/lib/master/rupiah.ts`:
```ts
const MAKS_RUPIAH = 100_000_000;

export function formatAngka(n: number): string {
	return Math.round(n)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatRupiah(n: number): string {
	return `Rp${formatAngka(n)}`;
}

/** "11.000", "Rp 11.000", "11000" → 11000. Bukan bilangan bulat ≥ 0 yang wajar → null. */
export function parseRupiah(teks: string): number | null {
	const bersih = teks.trim().replace(/^rp\s*/i, '');
	if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(bersih)) return null;
	const n = Number(bersih.replace(/\./g, ''));
	return Number.isSafeInteger(n) && n <= MAKS_RUPIAH ? n : null;
}

export function formatQty(n: number): string {
	return Number(n.toFixed(4)).toString().replace('.', ',');
}

/** "0,1" atau "0.1" → 0.1. Harus > 0, ≤ 4 desimal. */
export function parseQty(teks: string): number | null {
	const bersih = teks.trim().replace(',', '.');
	if (!/^\d+(\.\d{1,4})?$/.test(bersih)) return null;
	const n = Number(bersih);
	return n > 0 && n <= 1_000_000 ? n : null;
}
```

`src/lib/master/porsi.ts`:
```ts
const bulat4 = (n: number) => Math.round(n * 10000) / 10000;

/** Resep nasi menyimpan kg beras per porsi; admin lebih mudah berpikir "porsi per kg". */
export function porsiPerKg(qtyKg: number): number {
	return qtyKg > 0 ? Math.round(1 / qtyKg) : NaN;
}

export function qtyKgDariPorsi(porsi: number): number {
	return porsi > 0 ? bulat4(1 / porsi) : NaN;
}
```

`src/lib/master/susun.ts`:
```ts
import type { Bahan } from './types.ts';
import { formatQty } from './rupiah.ts';

export function kunciHarga(outletId: string, id: string): string {
	return `${outletId}:${id}`;
}

export function petaHarga<T extends { outlet_id: string; harga: number }>(baris: T[], idDari: (b: T) => string): Map<string, number> {
	return new Map(baris.map((b) => [kunciHarga(b.outlet_id, idDari(b)), b.harga]));
}

export function teksIsi(isi: { bahan_id: string; qty: number }[], bahan: Pick<Bahan, 'id' | 'nama' | 'satuan'>[]): string {
	if (isi.length === 0) return '—';
	const peta = new Map(bahan.map((b) => [b.id, b]));
	return isi
		.map((i) => {
			const b = peta.get(i.bahan_id);
			return b ? `${formatQty(i.qty)} ${b.satuan} ${b.nama}` : `${formatQty(i.qty)} (bahan tidak dikenal)`;
		})
		.join(' · ');
}
```

`src/lib/master/pesan.ts`:
```ts
export function pesanErrorData(err: { code?: string; message?: string; status?: number; name?: string } | null): string | null {
	if (!err) return null;
	const msg = err.message ?? '';
	if (err.code === '42501') return 'Anda tidak punya izin untuk perubahan ini.';
	if (err.code === '22023' && msg) return msg.endsWith('.') ? msg : `${msg}.`;
	if (err.code === '23505') return 'Ada data ganda. Periksa isian Anda.';
	if (err.code === '23514') return 'Isian di luar batas yang diizinkan.';
	if (/failed to fetch|network|load failed/i.test(msg) || err.status === 0) {
		return 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.';
	}
	return 'Gagal menyimpan. Coba lagi beberapa saat lagi.';
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/lib/master`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/master
git commit -m "feat(master): format/parse Rupiah & jumlah, porsi beras, susunan harga & isi, pesan error

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Fungsi server `admin-akun` (logika teruji, handler Deno, deploy, E2E)

**Files:**
- Create: `supabase/functions/_shared/akun.ts`, `supabase/functions/admin-akun/index.ts`, `scripts/sb.ts`, `scripts/uji-akun.ts`
- Modify: `package.json` (script `sb`), `supabase/config.toml` (blok `[functions.admin-akun]`)
- Test: `tests/functions/akun.test.ts`

**Interfaces:**
- Consumes: `USERNAME_PATTERN`, `AUTH_EMAIL_DOMAIN` (dicocokkan lewat test, bukan diimpor — Edge Function hanya mem-bundle folder `supabase/functions`); migrasi 0003 (profil dari `app_metadata`), 0006 (profil hanya diubah service role).
- Produces:
  - `_shared/akun.ts`: `type Perintah` (`buat` | `ubah` | `reset_password` | `set_aktif`), `type Peran = 'admin' | 'kasir'`, `bacaPerintah(body: unknown): { ok: true; perintah: Perintah } | { ok: false; error: string }`, `cekBolehNonaktif(a: { pemanggilId: string; targetId: string; targetRole: Peran; adminAktif: string[] }): string | null`, `passwordDariAcak(bytes: Uint8Array): string`, `emailDariUsername(u: string): string`, `BAN_SELAMANYA = '876000h'`, `USERNAME_PATTERN_FN`, `AUTH_EMAIL_DOMAIN_FN`
  - HTTP `POST /functions/v1/admin-akun` (Authorization: Bearer <JWT admin>), body = `Perintah`, respons `{ ok: true, id?, username?, password? }` atau `{ error: string }` dengan status 400/401/403/404/409/500.
  - npm script `npm run sb -- <argumen supabase CLI>`.

- [ ] **Step 1: Tulis test yang gagal**

`tests/functions/akun.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AUTH_EMAIL_DOMAIN } from '../../src/lib/auth/domain.js';
import { USERNAME_PATTERN } from '../../src/lib/auth/username';
import {
	AUTH_EMAIL_DOMAIN_FN,
	bacaPerintah,
	BAN_SELAMANYA,
	cekBolehNonaktif,
	emailDariUsername,
	passwordDariAcak,
	USERNAME_PATTERN_FN
} from '../../supabase/functions/_shared/akun';

const id = '11111111-1111-4111-8111-111111111111';

describe('konstanta sama dengan aplikasi', () => {
	it('pola username & domain email identik', () => {
		expect(USERNAME_PATTERN_FN).toBe(USERNAME_PATTERN);
		expect(AUTH_EMAIL_DOMAIN_FN).toBe(AUTH_EMAIL_DOMAIN);
		expect(emailDariUsername(' Kasir.Baru ')).toBe(`kasir.baru@${AUTH_EMAIL_DOMAIN}`);
	});
});

describe('bacaPerintah', () => {
	it('buat kasir sah (username dinormalisasi)', () => {
		expect(bacaPerintah({ aksi: 'buat', username: ' Kasir.Baru ', nama_tampilan: ' Budi ', role: 'kasir', outlet_kode: 'BL' })).toEqual({
			ok: true,
			perintah: { aksi: 'buat', username: 'kasir.baru', nama_tampilan: 'Budi', role: 'kasir', outlet_kode: 'BL' }
		});
	});
	it('buat admin tanpa outlet', () => {
		const r = bacaPerintah({ aksi: 'buat', username: 'owner2', nama_tampilan: 'Owner 2', role: 'admin', outlet_kode: null });
		expect(r).toEqual({ ok: true, perintah: { aksi: 'buat', username: 'owner2', nama_tampilan: 'Owner 2', role: 'admin', outlet_kode: null } });
	});
	it('menolak kasir tanpa outlet, username tidak sah, nama kosong, peran asing', () => {
		expect(bacaPerintah({ aksi: 'buat', username: 'kasir.x', nama_tampilan: 'X', role: 'kasir', outlet_kode: null })).toEqual({
			ok: false,
			error: 'Akun kasir harus punya outlet.'
		});
		expect(bacaPerintah({ aksi: 'buat', username: 'a..b', nama_tampilan: 'X', role: 'kasir', outlet_kode: 'BL' }).ok).toBe(false);
		expect(bacaPerintah({ aksi: 'buat', username: 'kasir.x', nama_tampilan: '  ', role: 'kasir', outlet_kode: 'BL' })).toEqual({
			ok: false,
			error: 'Nama tampilan wajib diisi.'
		});
		expect(bacaPerintah({ aksi: 'buat', username: 'kasir.x', nama_tampilan: 'X', role: 'owner', outlet_kode: 'BL' })).toEqual({
			ok: false,
			error: 'Peran tidak dikenal.'
		});
	});
	it('ubah, reset, set_aktif butuh id uuid', () => {
		expect(bacaPerintah({ aksi: 'reset_password', id })).toEqual({ ok: true, perintah: { aksi: 'reset_password', id } });
		expect(bacaPerintah({ aksi: 'set_aktif', id, aktif: false })).toEqual({ ok: true, perintah: { aksi: 'set_aktif', id, aktif: false } });
		expect(bacaPerintah({ aksi: 'ubah', id, nama_tampilan: 'Sari', outlet_kode: 'TK' })).toEqual({
			ok: true,
			perintah: { aksi: 'ubah', id, nama_tampilan: 'Sari', outlet_kode: 'TK' }
		});
		expect(bacaPerintah({ aksi: 'reset_password', id: 'bukan-uuid' })).toEqual({ ok: false, error: 'ID akun tidak sah.' });
		expect(bacaPerintah({ aksi: 'set_aktif', id })).toEqual({ ok: false, error: 'Status aktif harus ya/tidak.' });
		expect(bacaPerintah({ aksi: 'ubah', id })).toEqual({ ok: false, error: 'Tidak ada yang diubah.' });
	});
	it('aksi asing dan body rusak ditolak', () => {
		expect(bacaPerintah({ aksi: 'hapus_semua' })).toEqual({ ok: false, error: 'Aksi tidak dikenal.' });
		expect(bacaPerintah(null)).toEqual({ ok: false, error: 'Aksi tidak dikenal.' });
		expect(bacaPerintah('teks')).toEqual({ ok: false, error: 'Aksi tidak dikenal.' });
	});
});

describe('cekBolehNonaktif', () => {
	it('admin tidak boleh menonaktifkan dirinya sendiri', () => {
		expect(cekBolehNonaktif({ pemanggilId: 'a1', targetId: 'a1', targetRole: 'admin', adminAktif: ['a1', 'a2'] })).toBe(
			'Anda tidak bisa menonaktifkan akun Anda sendiri.'
		);
	});
	it('admin aktif terakhir tidak boleh dinonaktifkan', () => {
		expect(cekBolehNonaktif({ pemanggilId: 'a2', targetId: 'a1', targetRole: 'admin', adminAktif: ['a1'] })).toBe(
			'Minimal harus ada satu admin aktif.'
		);
	});
	it('boleh menonaktifkan kasir atau admin lain selama masih ada admin aktif', () => {
		expect(cekBolehNonaktif({ pemanggilId: 'a1', targetId: 'k1', targetRole: 'kasir', adminAktif: ['a1'] })).toBeNull();
		expect(cekBolehNonaktif({ pemanggilId: 'a1', targetId: 'a2', targetRole: 'admin', adminAktif: ['a1', 'a2'] })).toBeNull();
	});
});

describe('password & blokir', () => {
	it('12 karakter base64url dari 9 byte acak', () => {
		expect(passwordDariAcak(new Uint8Array(9).fill(255))).toBe('____________');
		expect(passwordDariAcak(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8]))).toMatch(/^[A-Za-z0-9_-]{12}$/);
	});
	it('blokir "selamanya" ≈ 100 tahun', () => {
		expect(BAN_SELAMANYA).toBe('876000h');
	});
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/functions`
Expected: FAIL, modul `_shared/akun` belum ada.

- [ ] **Step 3: Implementasi logika murni**

`supabase/functions/_shared/akun.ts`:
```ts
// Logika murni fungsi server admin-akun. Tanpa impor: dipakai Deno (Edge Function) dan Vitest.
// Konstanta harus identik dengan src/lib/auth/* — dijaga oleh tests/functions/akun.test.ts.

export const USERNAME_PATTERN_FN = String.raw`^[a-z0-9](?:[a-z0-9_-]|\.(?!\.)){1,30}[a-z0-9]$`;
export const AUTH_EMAIL_DOMAIN_FN = 'kasir-dkriuk.invalid';
/** ban_duration Supabase Auth untuk akun nonaktif (±100 tahun). */
export const BAN_SELAMANYA = '876000h';

const USERNAME_RE = new RegExp(USERNAME_PATTERN_FN);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KODE_OUTLET_RE = /^[A-Z]{2,4}$/;

export type Peran = 'admin' | 'kasir';

export type Perintah =
	| { aksi: 'buat'; username: string; nama_tampilan: string; role: Peran; outlet_kode: string | null }
	| { aksi: 'ubah'; id: string; nama_tampilan?: string; outlet_kode?: string }
	| { aksi: 'reset_password'; id: string }
	| { aksi: 'set_aktif'; id: string; aktif: boolean };

type Hasil = { ok: true; perintah: Perintah } | { ok: false; error: string };
const gagal = (error: string): Hasil => ({ ok: false, error });

export function emailDariUsername(u: string): string {
	return `${u.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN_FN}`;
}

function nama(v: unknown): string | null {
	return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 60 ? v.trim() : null;
}

export function bacaPerintah(body: unknown): Hasil {
	const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
	switch (b.aksi) {
		case 'buat': {
			const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
			if (!USERNAME_RE.test(username)) return gagal('Username tidak sah.');
			const n = nama(b.nama_tampilan);
			if (!n) return gagal('Nama tampilan wajib diisi.');
			if (b.role !== 'admin' && b.role !== 'kasir') return gagal('Peran tidak dikenal.');
			const kode = typeof b.outlet_kode === 'string' && KODE_OUTLET_RE.test(b.outlet_kode) ? b.outlet_kode : null;
			if (b.role === 'kasir' && !kode) return gagal('Akun kasir harus punya outlet.');
			return { ok: true, perintah: { aksi: 'buat', username, nama_tampilan: n, role: b.role, outlet_kode: b.role === 'kasir' ? kode : null } };
		}
		case 'ubah': {
			if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return gagal('ID akun tidak sah.');
			const p: Perintah = { aksi: 'ubah', id: b.id };
			if (b.nama_tampilan !== undefined) {
				const n = nama(b.nama_tampilan);
				if (!n) return gagal('Nama tampilan wajib diisi.');
				p.nama_tampilan = n;
			}
			if (b.outlet_kode !== undefined) {
				if (typeof b.outlet_kode !== 'string' || !KODE_OUTLET_RE.test(b.outlet_kode)) return gagal('Kode outlet tidak sah.');
				p.outlet_kode = b.outlet_kode;
			}
			if (p.nama_tampilan === undefined && p.outlet_kode === undefined) return gagal('Tidak ada yang diubah.');
			return { ok: true, perintah: p };
		}
		case 'reset_password':
			if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return gagal('ID akun tidak sah.');
			return { ok: true, perintah: { aksi: 'reset_password', id: b.id } };
		case 'set_aktif':
			if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return gagal('ID akun tidak sah.');
			if (typeof b.aktif !== 'boolean') return gagal('Status aktif harus ya/tidak.');
			return { ok: true, perintah: { aksi: 'set_aktif', id: b.id, aktif: b.aktif } };
		default:
			return gagal('Aksi tidak dikenal.');
	}
}

export function cekBolehNonaktif(a: { pemanggilId: string; targetId: string; targetRole: Peran; adminAktif: string[] }): string | null {
	if (a.pemanggilId === a.targetId) return 'Anda tidak bisa menonaktifkan akun Anda sendiri.';
	if (a.targetRole === 'admin' && a.adminAktif.filter((id) => id !== a.targetId).length === 0) {
		return 'Minimal harus ada satu admin aktif.';
	}
	return null;
}

/** 9 byte acak → 12 karakter base64url (72 bit), mudah diketik di HP. */
export function passwordDariAcak(bytes: Uint8Array): string {
	let biner = '';
	for (const x of bytes) biner += String.fromCharCode(x);
	return btoa(biner).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/functions`
Expected: PASS.

- [ ] **Step 5: Handler Deno**

`supabase/functions/admin-akun/index.ts`:
```ts
// Edge Function: kelola akun (hanya admin aktif). Kunci service role hanya ada di server.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { BAN_SELAMANYA, bacaPerintah, cekBolehNonaktif, emailDariUsername, passwordDariAcak } from '../_shared/akun.ts';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const passwordBaru = () => passwordDariAcak(crypto.getRandomValues(new Uint8Array(9)));

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
	if (req.method !== 'POST') return json(405, { error: 'Metode tidak didukung.' });

	const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
	const { data: u, error: ue } = await db.auth.getUser(token);
	if (ue || !u.user) return json(401, { error: 'Sesi tidak sah. Silakan masuk ulang.' });
	const { data: saya } = await db.from('profiles').select('id, role, aktif').eq('id', u.user.id).maybeSingle();
	if (!saya || saya.role !== 'admin' || !saya.aktif) return json(403, { error: 'Hanya admin yang boleh mengelola akun.' });

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return json(400, { error: 'Permintaan tidak bisa dibaca.' });
	}
	const hasil = bacaPerintah(body);
	if (!hasil.ok) return json(400, { error: hasil.error });
	const p = hasil.perintah;

	try {
		if (p.aksi === 'buat') {
			if (p.outlet_kode) {
				const { data: o } = await db.from('outlets').select('id').eq('kode', p.outlet_kode).maybeSingle();
				if (!o) return json(404, { error: 'Outlet tidak ditemukan.' });
			}
			const password = passwordBaru();
			const { data, error } = await db.auth.admin.createUser({
				email: emailDariUsername(p.username),
				password,
				email_confirm: true,
				app_metadata: { username: p.username, nama_tampilan: p.nama_tampilan, role: p.role, outlet_kode: p.outlet_kode }
			});
			if (error) {
				if (/already|exists|registered/i.test(error.message)) return json(409, { error: 'Username sudah dipakai.' });
				return json(500, { error: 'Akun gagal dibuat. Coba lagi.' });
			}
			return json(200, { ok: true, id: data.user.id, username: p.username, password });
		}

		const { data: target } = await db.from('profiles').select('id, role, aktif').eq('id', p.id).maybeSingle();
		if (!target) return json(404, { error: 'Akun tidak ditemukan.' });

		if (p.aksi === 'ubah') {
			const ubah: Record<string, unknown> = {};
			if (p.nama_tampilan !== undefined) ubah.nama_tampilan = p.nama_tampilan;
			if (p.outlet_kode !== undefined) {
				if (target.role !== 'kasir') return json(400, { error: 'Hanya akun kasir yang punya outlet.' });
				const { data: o } = await db.from('outlets').select('id').eq('kode', p.outlet_kode).maybeSingle();
				if (!o) return json(404, { error: 'Outlet tidak ditemukan.' });
				ubah.outlet_id = o.id;
			}
			const { error } = await db.from('profiles').update(ubah).eq('id', p.id);
			if (error) return json(500, { error: 'Perubahan gagal disimpan.' });
			return json(200, { ok: true });
		}

		if (p.aksi === 'reset_password') {
			const password = passwordBaru();
			const { error } = await db.auth.admin.updateUserById(p.id, { password });
			if (error) return json(500, { error: 'Password gagal direset.' });
			return json(200, { ok: true, password });
		}

		// set_aktif
		if (!p.aktif) {
			const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').eq('aktif', true);
			const tolak = cekBolehNonaktif({
				pemanggilId: saya.id,
				targetId: p.id,
				targetRole: target.role,
				adminAktif: (admins ?? []).map((a) => a.id)
			});
			if (tolak) return json(400, { error: tolak });
		}
		const { error: be } = await db.auth.admin.updateUserById(p.id, { ban_duration: p.aktif ? 'none' : BAN_SELAMANYA });
		if (be) return json(500, { error: 'Status login gagal diubah.' });
		const { error: pe } = await db.from('profiles').update({ aktif: p.aktif }).eq('id', p.id);
		if (pe) return json(500, { error: 'Status akun gagal disimpan.' });
		return json(200, { ok: true });
	} catch {
		return json(500, { error: 'Gagal memproses akun. Coba lagi.' });
	}
});
```

Tambahkan di akhir `supabase/config.toml`:
```toml
[functions.admin-akun]
verify_jwt = true
```

- [ ] **Step 6: Script `sb` (CLI dengan kredensial .env.local, output disamarkan)**

`scripts/sb.ts`:
```ts
// Menjalankan Supabase CLI dengan kredensial dari .env.local tanpa menampilkannya.
//   npm run sb -- db push --dry-run
//   npm run sb -- functions deploy admin-akun --use-api
import { spawnSync } from 'node:child_process';

const rahasia = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_SERVICE_ROLE_KEY']
	.map((k) => process.env[k])
	.filter((v): v is string => !!v);
const args = process.argv.slice(2).map((a) => a.replace('{REF}', process.env.SUPABASE_PROJECT_REF ?? ''));
const r = spawnSync('npx', ['supabase', ...args], { shell: true, encoding: 'utf8', env: process.env });
let out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
for (const s of rahasia) out = out.split(s).join('***');
process.stdout.write(out);
process.exit(r.status ?? 1);
```

Di `package.json` bagian `scripts`, tambahkan:
```json
"sb": "node --env-file=.env.local scripts/sb.ts"
```

- [ ] **Step 7: Pasang migrasi 0004–0006 dan deploy fungsi**

Pastikan `.env.local` masih memuat `SUPABASE_ACCESS_TOKEN` yang belum kedaluwarsa dan `SUPABASE_DB_PASSWORD`. Jika token kedaluwarsa, minta owner membuat token baru (Account → Access Tokens) dan menempelkannya ke `.env.local`.

Run:
```bash
npm run sb -- db push --dry-run
```
Expected: daftar `20261004000004_master.sql`, `..._0005_seed_master.sql`, `..._0006_kunci_profil.sql` saja.

Run:
```bash
npm run sb -- db push --yes
npm run sb -- functions deploy admin-akun --use-api
```
Expected: `Applying migration ...` ×3; `Deployed Functions on project ...: admin-akun`.

- [ ] **Step 8: E2E fungsi server (admin sementara, dihapus di akhir)**

`scripts/uji-akun.ts`:
```ts
// E2E fungsi admin-akun terhadap Supabase sungguhan. Membuat admin & kasir sementara, menghapusnya di akhir.
// Password hanya ada di memori. Jalankan: node --env-file=.env.local scripts/uji-akun.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { usernameToEmail } from '../src/lib/auth/username.ts';

const url = process.env.SUPABASE_URL!;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY!;
const tag = randomBytes(3).toString('hex');
const hapus: string[] = [];
let gagal = 0;
const cek = (nama: string, ok: boolean, info = '') => {
	if (!ok) gagal++;
	console.log(`${ok ? 'OK   ' : 'GAGAL'} ${nama}${info ? ` — ${info}` : ''}`);
};

async function masuk(username: string, password: string): Promise<{ c: SupabaseClient; error: string | null }> {
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const { error } = await c.auth.signInWithPassword({ email: usernameToEmail(username), password });
	return { c, error: error?.code ?? error?.message ?? null };
}
async function panggil(c: SupabaseClient, body: unknown) {
	const { data, error } = await c.functions.invoke('admin-akun', { body });
	if (!error) return { status: 200, data };
	const res = (error as { context?: Response }).context;
	return { status: res?.status ?? 0, data: await res?.json().catch(() => null) };
}

try {
	const pwAdmin = randomBytes(12).toString('base64url');
	const uAdmin = `uji.admin.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(uAdmin),
		password: pwAdmin,
		email_confirm: true,
		app_metadata: { username: uAdmin, nama_tampilan: 'Uji Admin', role: 'admin', outlet_kode: null }
	});
	if (a.error) throw new Error(a.error.message);
	hapus.push(a.data.user.id);
	const { c: admin } = await masuk(uAdmin, pwAdmin);

	const uKasir = `uji.kasir.${tag}`;
	const buat = await panggil(admin, { aksi: 'buat', username: uKasir, nama_tampilan: 'Uji Kasir', role: 'kasir', outlet_kode: 'KP' });
	cek('admin membuat kasir', buat.status === 200 && typeof buat.data?.password === 'string', String(buat.status));
	if (buat.data?.id) hapus.push(buat.data.id);

	const dobel = await panggil(admin, { aksi: 'buat', username: uKasir, nama_tampilan: 'X', role: 'kasir', outlet_kode: 'KP' });
	cek('username ganda ditolak 409', dobel.status === 409, String(dobel.status));

	const k1 = await masuk(uKasir, buat.data.password);
	cek('kasir baru bisa login', k1.error === null, k1.error ?? '');
	const prof = await k1.c.from('profiles').select('role, outlets(kode)').single();
	cek('kasir baru terikat ke KP', prof.data?.role === 'kasir' && (prof.data as any)?.outlets?.kode === 'KP');

	const olehKasir = await panggil(k1.c, { aksi: 'reset_password', id: hapus[0] });
	cek('kasir memanggil fungsi → 403', olehKasir.status === 403, String(olehKasir.status));

	const pindah = await panggil(admin, { aksi: 'ubah', id: buat.data.id, outlet_kode: 'TK', nama_tampilan: 'Uji Kasir TK' });
	const prof2 = await svc.from('profiles').select('nama_tampilan, outlets(kode)').eq('id', buat.data.id).single();
	cek('admin memindah outlet & nama', pindah.status === 200 && (prof2.data as any)?.outlets?.kode === 'TK');

	const reset = await panggil(admin, { aksi: 'reset_password', id: buat.data.id });
	const lama = await masuk(uKasir, buat.data.password);
	const baru = await masuk(uKasir, reset.data?.password ?? '');
	cek('reset password: lama ditolak, baru diterima', lama.error === 'invalid_credentials' && baru.error === null, `${lama.error}/${baru.error}`);

	const nonaktif = await panggil(admin, { aksi: 'set_aktif', id: buat.data.id, aktif: false });
	const diblokir = await masuk(uKasir, reset.data.password);
	cek('nonaktif langsung tidak bisa login (user_banned)', nonaktif.status === 200 && diblokir.error === 'user_banned', diblokir.error ?? '');

	const aktif = await panggil(admin, { aksi: 'set_aktif', id: buat.data.id, aktif: true });
	const lagi = await masuk(uKasir, reset.data.password);
	cek('aktif lagi bisa login', aktif.status === 200 && lagi.error === null, lagi.error ?? '');

	const diriSendiri = await panggil(admin, { aksi: 'set_aktif', id: hapus[0], aktif: false });
	cek('admin tidak bisa menonaktifkan dirinya', diriSendiri.status === 400, String(diriSendiri.status));

	const rusak = await panggil(admin, { aksi: 'hapus_semua' });
	cek('aksi asing ditolak 400', rusak.status === 400, String(rusak.status));
} finally {
	for (const id of hapus.reverse()) await svc.auth.admin.deleteUser(id);
	console.log(`\nAkun sementara dihapus: ${hapus.length}`);
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
```

Run: `node --env-file=.env.local scripts/uji-akun.ts`
Expected: semua baris `OK`, "Akun sementara dihapus: 2", "Semua pemeriksaan lulus".

- [ ] **Step 9: Jalankan suite, check, commit**

Run: `npm test && npm run check`
Expected: PASS, 0 error.

```bash
git add supabase/functions supabase/config.toml scripts/sb.ts scripts/uji-akun.ts package.json tests/functions
git commit -m "feat(akun): fungsi server admin-akun (buat, ubah, reset password, aktif/nonaktif + blokir)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Navigasi admin dan komponen input bersama

**Files:**
- Create: `src/lib/components/layout/AdminNav.svelte`, `src/lib/components/ui/HargaInput.svelte`, `src/lib/components/ui/QtyInput.svelte`, `src/lib/components/ui/Konfirmasi.svelte`, `src/routes/admin/+layout.svelte`
- Modify: `src/lib/components/layout/AppShell.svelte`, `src/routes/admin/+page.svelte`
- Test: `src/lib/components/ui/input-master.test.ts`

**Interfaces:**
- Consumes: `formatAngka`, `parseRupiah`, `formatQty`, `parseQty` (Task 3); `routePath` (`#lib/auth/guard.ts`); `href` (`#lib/nav.ts`).
- Produces:
  - `<AppShell title nav?>` — `nav` snippet opsional; konten admin mendapat ruang di samping (lg) / bawah (HP).
  - `<AdminNav aktif={string} />` — item: Beranda `/admin`, Bahan `/admin/bahan`, Menu & Harga `/admin/menu`, Harga Beli `/admin/harga-beli`, Akun `/admin/akun`.
  - `<HargaInput id label nilai={number|null} onsimpan={(n:number)=>Promise<void>} disabled? />`
  - `<QtyInput id label nilai={number|null} satuan={string} onsimpan={(n:number)=>Promise<void>} disabled? />`
  - `<Konfirmasi label konfirmasiLabel onkonfirmasi={()=>Promise<void>|void} variant? />`

- [ ] **Step 1: Tulis test render yang gagal**

`src/lib/components/ui/input-master.test.ts`:
```ts
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import HargaInput from './HargaInput.svelte';
import QtyInput from './QtyInput.svelte';

describe('HargaInput', () => {
	it('menampilkan nilai dengan titik ribuan dan keyboard angka', () => {
		const { body } = render(HargaInput, { props: { id: 'h', label: 'Harga BL', nilai: 11000, onsimpan: async () => {} } });
		expect(body).toContain('value="11.000"');
		expect(body).toContain('inputmode="numeric"');
		expect(body).toContain('Harga BL');
	});
	it('nilai kosong tampil kosong, bukan 0', () => {
		const { body } = render(HargaInput, { props: { id: 'h', label: 'Harga', nilai: null, onsimpan: async () => {} } });
		expect(body).toContain('value=""');
	});
});

describe('QtyInput', () => {
	it('desimal dengan koma dan satuan', () => {
		const { body } = render(QtyInput, { props: { id: 'q', label: 'Isi', nilai: 1.3, satuan: 'kg', onsimpan: async () => {} } });
		expect(body).toContain('value="1,3"');
		expect(body).toContain('inputmode="decimal"');
		expect(body).toContain('kg');
	});
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/lib/components/ui/input-master.test.ts`
Expected: FAIL, `HargaInput.svelte` belum ada.

- [ ] **Step 3: Komponen input**

`src/lib/components/ui/HargaInput.svelte`:
```svelte
<script lang="ts">
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';

	let {
		id,
		label,
		nilai,
		onsimpan,
		disabled = false
	}: { id: string; label: string; nilai: number | null; onsimpan: (n: number) => Promise<void>; disabled?: boolean } = $props();

	const tampil = (n: number | null) => (n == null ? '' : formatAngka(n));
	let teks = $state(tampil(nilai));
	let error = $state('');
	let status = $state<'diam' | 'menyimpan' | 'tersimpan'>('diam');

	// Nilai dari induk berubah (mis. dimuat ulang) → tampilkan nilai baru.
	$effect.pre(() => {
		teks = tampil(nilai);
	});

	async function selesai() {
		if (teks.trim() === '' && nilai == null) return;
		const n = parseRupiah(teks);
		if (n === null) {
			error = 'Isi angka Rupiah, mis. 11.000';
			return;
		}
		error = '';
		teks = formatAngka(n);
		if (n === nilai) return;
		status = 'menyimpan';
		try {
			await onsimpan(n);
			status = 'tersimpan';
		} catch (e) {
			error = (e as Error).message;
			status = 'diam';
		}
	}
</script>

<div class="grid gap-1">
	<label for={id} class="sr-only">{label}</label>
	<div class="relative">
		<span class="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted" aria-hidden="true">Rp</span>
		<input
			{id}
			bind:value={teks}
			inputmode="numeric"
			autocomplete="off"
			{disabled}
			onblur={selesai}
			onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${id}-err` : undefined}
			class="tabular min-h-12 w-full min-w-28 rounded-xl border border-line-strong bg-surface pr-8 pl-9 text-right text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none disabled:opacity-60"
		/>
		{#if status === 'menyimpan'}
			<span class="absolute inset-y-0 right-2 grid place-items-center" aria-label="Menyimpan">
				<span class="size-3 animate-spin rounded-full border-2 border-muted border-r-transparent"></span>
			</span>
		{:else if status === 'tersimpan'}
			<span class="absolute inset-y-0 right-2 grid place-items-center text-ok" aria-label="Tersimpan">✓</span>
		{/if}
	</div>
	{#if error}<p id="{id}-err" class="text-xs text-danger" role="alert">{error}</p>{/if}
</div>
```

`src/lib/components/ui/QtyInput.svelte`:
```svelte
<script lang="ts">
	import { formatQty, parseQty } from '#lib/master/rupiah.ts';

	let {
		id,
		label,
		nilai,
		satuan,
		onsimpan,
		disabled = false
	}: { id: string; label: string; nilai: number | null; satuan: string; onsimpan: (n: number) => Promise<void>; disabled?: boolean } =
		$props();

	const tampil = (n: number | null) => (n == null ? '' : formatQty(n));
	let teks = $state(tampil(nilai));
	let error = $state('');
	let status = $state<'diam' | 'menyimpan' | 'tersimpan'>('diam');

	// Nilai dari induk berubah (mis. dimuat ulang) → tampilkan nilai baru.
	$effect.pre(() => {
		teks = tampil(nilai);
	});

	async function selesai() {
		if (teks.trim() === '' && nilai == null) return;
		const n = parseQty(teks);
		if (n === null) {
			error = 'Isi angka lebih dari 0, mis. 1,3';
			return;
		}
		error = '';
		teks = formatQty(n);
		if (n === nilai) return;
		status = 'menyimpan';
		try {
			await onsimpan(n);
			status = 'tersimpan';
		} catch (e) {
			error = (e as Error).message;
			status = 'diam';
		}
	}
</script>

<div class="grid gap-1">
	<label for={id} class="sr-only">{label}</label>
	<div class="flex items-center gap-2">
		<input
			{id}
			bind:value={teks}
			inputmode="decimal"
			autocomplete="off"
			{disabled}
			onblur={selesai}
			onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${id}-err` : undefined}
			class="tabular min-h-12 w-24 rounded-xl border border-line-strong bg-surface px-3 text-right text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none disabled:opacity-60"
		/>
		<span class="text-sm text-muted">{satuan}</span>
		{#if status === 'menyimpan'}<span class="text-xs text-muted">menyimpan…</span>{/if}
		{#if status === 'tersimpan'}<span class="text-ok" aria-label="Tersimpan">✓</span>{/if}
	</div>
	{#if error}<p id="{id}-err" class="text-xs text-danger" role="alert">{error}</p>{/if}
</div>
```

`src/lib/components/ui/Konfirmasi.svelte`:
```svelte
<script lang="ts">
	// Tombol dua langkah: tekan sekali → muncul tombol konfirmasi (confirm() tidak dipakai).
	import Button from './Button.svelte';

	let {
		label,
		konfirmasiLabel,
		onkonfirmasi,
		variant = 'secondary'
	}: { label: string; konfirmasiLabel: string; onkonfirmasi: () => Promise<void> | void; variant?: 'primary' | 'secondary' | 'ghost' } =
		$props();

	let tahap = $state<'awal' | 'yakin' | 'proses'>('awal');

	async function jalankan() {
		tahap = 'proses';
		try {
			await onkonfirmasi();
		} finally {
			tahap = 'awal';
		}
	}
</script>

{#if tahap === 'awal'}
	<Button {variant} onclick={() => (tahap = 'yakin')}>{label}</Button>
{:else}
	<span class="inline-flex flex-wrap items-center gap-2">
		<Button variant="primary" loading={tahap === 'proses'} onclick={jalankan}>{konfirmasiLabel}</Button>
		<Button variant="ghost" disabled={tahap === 'proses'} onclick={() => (tahap = 'awal')}>Batal</Button>
	</span>
{/if}
```

- [ ] **Step 4: Jalankan test komponen, pastikan lulus**

Run: `npx vitest run src/lib/components/ui`
Expected: PASS.

- [ ] **Step 5: AppShell dengan slot navigasi, AdminNav, layout admin**

`src/lib/components/layout/AppShell.svelte` (ganti seluruh isi):
```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { auth } from '#lib/auth/session.svelte.ts';
	import Logo from '#lib/components/brand/Logo.svelte';
	import ThemeToggle from '#lib/components/theme/ThemeToggle.svelte';

	let { title, nav, children }: { title: string; nav?: Snippet; children: Snippet } = $props();

	const lingkup = $derived(
		auth.profile?.role === 'admin' ? 'Admin · Semua outlet' : auth.outlet ? `${auth.outlet.merek} ${auth.outlet.nama}` : ''
	);
</script>

<div class="min-h-dvh bg-bg">
	<header
		class="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur"
	>
		<div class="flex min-h-16 min-w-0 flex-1 items-center gap-3">
			<Logo size="sm" alt="" />
			<div class="min-w-0">
				<p class="font-display text-xl leading-none text-brand">{title}</p>
				<p class="truncate text-xs font-semibold text-muted">{lingkup}</p>
			</div>
		</div>
		<ThemeToggle />
		<button
			type="button"
			onclick={() => auth.signOut()}
			class="min-h-12 rounded-xl px-3 text-sm font-semibold text-fg hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus"
		>
			Keluar
		</button>
	</header>
	<div class="mx-auto flex w-full max-w-7xl lg:gap-6 lg:px-4">
		{#if nav}{@render nav()}{/if}
		<main class="min-w-0 flex-1 px-4 py-6 lg:px-0 {nav ? 'pb-28 lg:pb-6' : ''}">
			{@render children()}
		</main>
	</div>
</div>
```

`src/lib/components/layout/AdminNav.svelte`:
```svelte
<script lang="ts">
	import { href } from '#lib/nav.ts';

	let { aktif }: { aktif: string } = $props();

	const ITEM = [
		{ path: '/admin', label: 'Beranda' },
		{ path: '/admin/bahan', label: 'Bahan' },
		{ path: '/admin/menu', label: 'Menu & Harga' },
		{ path: '/admin/harga-beli', label: 'Harga Beli' },
		{ path: '/admin/akun', label: 'Akun' }
	] as const;

	const sedang = (p: string) => (p === '/admin' ? aktif === '/admin' : aktif === p || aktif.startsWith(`${p}/`));
</script>

<nav
	aria-label="Menu admin"
	class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:sticky lg:top-20 lg:w-52 lg:shrink-0 lg:self-start lg:border-0 lg:bg-transparent lg:pt-6 lg:pb-0"
>
	<ul class="flex overflow-x-auto lg:flex-col lg:gap-1">
		{#each ITEM as i (i.path)}
			<li class="flex-1 lg:flex-none">
				<a
					href={href(i.path)}
					aria-current={sedang(i.path) ? 'page' : undefined}
					class="flex min-h-14 items-center justify-center px-3 text-center text-xs font-semibold whitespace-nowrap text-muted hover:text-fg focus-visible:outline-3 focus-visible:outline-focus aria-[current=page]:text-brand lg:min-h-12 lg:justify-start lg:rounded-xl lg:text-sm lg:aria-[current=page]:bg-surface-2"
				>
					{i.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
```

`src/routes/admin/+layout.svelte`:
```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { routePath } from '#lib/auth/guard.ts';
	import AdminNav from '#lib/components/layout/AdminNav.svelte';
	import AppShell from '#lib/components/layout/AppShell.svelte';

	let { children } = $props();
</script>

<AppShell title="Admin">
	{#snippet nav()}<AdminNav aktif={routePath(page.url)} />{/snippet}
	{@render children()}
</AppShell>
```

`src/routes/admin/+page.svelte` (ganti seluruh isi — AppShell sekarang dari layout):
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { supabase } from '#lib/supabase/client.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let gagal = $state<string | null>(null);

	onMount(async () => {
		const { data, error } = await supabase.from('outlets').select('id, kode, nama, merek, alamat, telepon, aktif').order('kode');
		if (error) gagal = 'Daftar outlet tidak bisa dimuat. Periksa koneksi, lalu muat ulang.';
		else outlets = data ?? [];
	});

	const pintasan = [
		{ path: '/admin/menu', judul: 'Menu & Harga', isi: 'Harga jual per outlet dan resep pemotongan stok.' },
		{ path: '/admin/bahan', judul: 'Bahan', isi: 'Isi pack dan ambang stok menipis.' },
		{ path: '/admin/harga-beli', judul: 'Harga Beli', isi: 'Harga beli bahan per outlet.' },
		{ path: '/admin/akun', judul: 'Akun', isi: 'Tambah kasir, reset password, nonaktifkan akun.' }
	];
</script>

<svelte:head><title>Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Halo, {auth.profile?.nama_tampilan}</h1>
<p class="mt-1 text-muted">Dashboard lengkap dibangun di Tahap 7.</p>

<ul class="mt-6 grid gap-3 sm:grid-cols-2">
	{#each pintasan as p (p.path)}
		<li>
			<a
				href={href(p.path)}
				class="block rounded-2xl border border-line bg-surface p-5 hover:border-brand focus-visible:outline-3 focus-visible:outline-focus"
			>
				<p class="font-display text-xl text-brand">{p.judul}</p>
				<p class="mt-1 text-sm text-muted">{p.isi}</p>
			</a>
		</li>
	{/each}
</ul>

{#if gagal}<p class="mt-6 text-danger" role="alert">{gagal}</p>{/if}

<h2 class="mt-8 font-display text-2xl">Outlet</h2>
<ul class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
	{#each outlets as o (o.id)}
		<li class="rounded-2xl border border-line bg-surface p-5">
			<span class="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">{o.kode}</span>
			<p class="mt-3 font-display text-xl">{o.merek} {o.nama}</p>
			<p class="mt-1 text-sm text-muted">{o.alamat}</p>
		</li>
	{/each}
</ul>
```

- [ ] **Step 6: Verifikasi**

Run: `npm test && npm run check && npm run build`
Expected: PASS, 0 error, build sukses.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components src/routes/admin
git commit -m "feat(admin): navigasi admin, input Rupiah/jumlah simpan-saat-selesai, tombol konfirmasi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Lapisan data master + halaman Bahan & Satuan Beli

**Files:**
- Create: `src/lib/master/api.ts`, `src/routes/admin/bahan/+page.svelte`

**Interfaces:**
- Consumes: `supabase` (`#lib/supabase/client.ts`); tipe & `pesanErrorData` (Task 3); `HargaInput`, `QtyInput` (Task 5); `simpan_isi_satuan_beli` (Task 1).
- Produces (`src/lib/master/api.ts`, semua melempar `Error(pesan Indonesia)` saat gagal):
  - `muatOutlets(): Promise<Outlet[]>`
  - `muatBahan(): Promise<Bahan[]>`, `muatSatuanBeli(): Promise<SatuanBeli[]>`, `muatIsiSatuanBeli(): Promise<IsiSatuanBeli[]>`
  - `muatMenu(): Promise<Menu[]>`, `muatHargaJual(): Promise<HargaJual[]>`, `muatResep(): Promise<Resep[]>`, `muatHargaBeli(): Promise<HargaBeli[]>`
  - `simpanAmbang(satuanBeliId: string, ambang: number | null): Promise<void>`
  - `simpanAktifBahan(bahanId: string, aktif: boolean): Promise<void>`
  - `simpanIsiSatuanBeli(satuanBeliId: string, isi: BarisIsi[]): Promise<void>`
  - `simpanHargaJual(outletId: string, menuId: string, harga: number): Promise<void>`
  - `simpanResep(menuId: string, isi: BarisIsi[]): Promise<void>`
  - `simpanHargaBeli(outletId: string, satuanBeliId: string, harga: number): Promise<void>`

- [ ] **Step 1: Lapisan data**

`src/lib/master/api.ts`:
```ts
import { supabase } from '#lib/supabase/client.ts';
import type { Outlet } from '#lib/types/db.ts';
import { pesanErrorData } from './pesan.ts';
import type { Bahan, BarisIsi, HargaBeli, HargaJual, IsiSatuanBeli, Menu, Resep, SatuanBeli } from './types.ts';

type Galat = Parameters<typeof pesanErrorData>[0];

function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanErrorData(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}

const angka = <T extends Record<string, unknown>>(rows: T[], ...kolom: (keyof T)[]): T[] =>
	rows.map((r) => {
		const salin = { ...r };
		for (const k of kolom) if (salin[k] != null) (salin as Record<keyof T, unknown>)[k] = Number(salin[k]);
		return salin;
	});

export async function muatOutlets(): Promise<Outlet[]> {
	return periksa(await supabase.from('outlets').select('id, kode, nama, merek, alamat, telepon, aktif').order('kode'));
}
export async function muatBahan(): Promise<Bahan[]> {
	return periksa(await supabase.from('bahan').select('id, kode, nama, satuan, mode, urutan, aktif').order('urutan'));
}
export async function muatSatuanBeli(): Promise<SatuanBeli[]> {
	const rows = periksa(await supabase.from('satuan_beli').select('id, kode, nama, ambang, harga_tetap, urutan, aktif').order('urutan'));
	return angka(rows, 'ambang');
}
export async function muatIsiSatuanBeli(): Promise<IsiSatuanBeli[]> {
	return angka(periksa(await supabase.from('satuan_beli_isi').select('satuan_beli_id, bahan_id, qty')), 'qty');
}
export async function muatMenu(): Promise<Menu[]> {
	return periksa(await supabase.from('menu').select('id, kode, nama, kategori, varian, urutan, aktif').order('urutan'));
}
export async function muatHargaJual(): Promise<HargaJual[]> {
	return periksa(await supabase.from('harga_jual').select('outlet_id, menu_id, harga'));
}
export async function muatResep(): Promise<Resep[]> {
	return angka(periksa(await supabase.from('resep').select('menu_id, bahan_id, qty')), 'qty');
}
export async function muatHargaBeli(): Promise<HargaBeli[]> {
	return periksa(await supabase.from('harga_beli').select('outlet_id, satuan_beli_id, harga, diubah_at'));
}

export async function simpanAmbang(satuanBeliId: string, ambang: number | null): Promise<void> {
	periksa(await supabase.from('satuan_beli').update({ ambang }).eq('id', satuanBeliId).select('id').single());
}
export async function simpanAktifBahan(bahanId: string, aktif: boolean): Promise<void> {
	periksa(await supabase.from('bahan').update({ aktif }).eq('id', bahanId).select('id').single());
}
export async function simpanIsiSatuanBeli(satuanBeliId: string, isi: BarisIsi[]): Promise<void> {
	periksa(await supabase.rpc('simpan_isi_satuan_beli', { p_satuan: satuanBeliId, p_isi: isi }));
}
export async function simpanHargaJual(outletId: string, menuId: string, harga: number): Promise<void> {
	periksa(
		await supabase.from('harga_jual').upsert({ outlet_id: outletId, menu_id: menuId, harga }).select('menu_id').single()
	);
}
export async function simpanResep(menuId: string, isi: BarisIsi[]): Promise<void> {
	periksa(await supabase.rpc('simpan_resep', { p_menu: menuId, p_isi: isi }));
}
export async function simpanHargaBeli(outletId: string, satuanBeliId: string, harga: number): Promise<void> {
	periksa(
		await supabase
			.from('harga_beli')
			.upsert({ outlet_id: outletId, satuan_beli_id: satuanBeliId, harga, diubah_at: new Date().toISOString() })
			.select('satuan_beli_id')
			.single()
	);
}
```

Catatan: `.select(...).single()` setelah update/upsert membuat perubahan yang ditolak RLS (0 baris) menjadi error, bukan sukses palsu.

- [ ] **Step 2: Halaman Bahan & Satuan Beli**

`src/routes/admin/bahan/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import QtyInput from '#lib/components/ui/QtyInput.svelte';
	import { muatBahan, muatIsiSatuanBeli, muatSatuanBeli, simpanAktifBahan, simpanAmbang, simpanIsiSatuanBeli } from '#lib/master/api.ts';
	import type { Bahan, IsiSatuanBeli, ModeStok, SatuanBeli } from '#lib/master/types.ts';

	let bahan = $state<Bahan[]>([]);
	let satuan = $state<SatuanBeli[]>([]);
	let isi = $state<IsiSatuanBeli[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');

	const MODE: Record<ModeStok, string> = {
		otomatis: 'Dipotong otomatis saat terjual',
		catat: 'Hanya dicatat saat dibeli',
		analisis: 'Dianalisis (tidak dipotong)'
	};

	async function muat() {
		status = 'memuat';
		try {
			[bahan, satuan, isi] = await Promise.all([muatBahan(), muatSatuanBeli(), muatIsiSatuanBeli()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const namaBahan = (id: string) => bahan.find((b) => b.id === id);
	const isiDari = (s: SatuanBeli) => isi.filter((i) => i.satuan_beli_id === s.id);

	async function ubahIsi(s: SatuanBeli, bahanId: string, qty: number) {
		const baru = isiDari(s).map((i) => ({ bahan_id: i.bahan_id, qty: i.bahan_id === bahanId ? qty : i.qty }));
		await simpanIsiSatuanBeli(s.id, baru);
		isi = isi.map((i) => (i.satuan_beli_id === s.id && i.bahan_id === bahanId ? { ...i, qty } : i));
	}

	async function ubahAmbang(s: SatuanBeli, nilai: number) {
		await simpanAmbang(s.id, nilai);
		satuan = satuan.map((x) => (x.id === s.id ? { ...x, ambang: nilai } : x));
	}

	async function hapusAmbang(s: SatuanBeli) {
		await simpanAmbang(s.id, null);
		satuan = satuan.map((x) => (x.id === s.id ? { ...x, ambang: null } : x));
	}

	async function ubahAktif(b: Bahan) {
		try {
			await simpanAktifBahan(b.id, !b.aktif);
			bahan = bahan.map((x) => (x.id === b.id ? { ...x, aktif: !b.aktif } : x));
		} catch (e) {
			pesan = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Bahan · Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Bahan & Satuan Beli</h1>
<p class="mt-1 max-w-prose text-muted">
	Satuan beli adalah bentuk barang saat datang (pack, karung, kg). Ambang stok menipis dihitung dalam satuan beli, mis. 10 pack.
</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#if pesan}<p class="mt-4 text-danger" role="alert">{pesan}</p>{/if}

	<h2 class="mt-8 font-display text-2xl">Satuan beli</h2>
	<ul class="mt-3 grid gap-3">
		{#each satuan as s (s.id)}
			<li class="rounded-2xl border border-line bg-surface p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="font-semibold">{s.nama}</p>
						<p class="text-xs text-muted">{s.harga_tetap ? 'Harga tetap' : 'Harga berubah-ubah (diisi saat barang masuk)'}</p>
					</div>
					<div class="flex flex-wrap items-end gap-2">
						<QtyInput
							id="ambang-{s.id}"
							label="Ambang stok menipis {s.nama}"
							nilai={s.ambang}
							satuan="satuan beli"
							onsimpan={(n) => ubahAmbang(s, n)}
						/>
						{#if s.ambang != null}
							<button type="button" class="min-h-12 rounded-xl px-3 text-sm text-muted hover:bg-surface-2" onclick={() => hapusAmbang(s)}>
								Tidak dipantau
							</button>
						{/if}
					</div>
				</div>
				<p class="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Isi</p>
				<ul class="mt-1 grid gap-2 sm:grid-cols-2">
					{#each isiDari(s) as i (i.bahan_id)}
						{@const b = namaBahan(i.bahan_id)}
						<li class="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-1">
							<span class="text-sm">{b?.nama ?? 'Bahan tidak dikenal'}</span>
							<QtyInput
								id="isi-{s.id}-{i.bahan_id}"
								label="Isi {b?.nama} per {s.nama}"
								nilai={i.qty}
								satuan={b?.satuan ?? ''}
								onsimpan={(n) => ubahIsi(s, i.bahan_id, n)}
							/>
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>

	<h2 class="mt-10 font-display text-2xl">Bahan baku</h2>
	<ul class="mt-3 grid gap-2">
		{#each bahan as b (b.id)}
			<li class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2">
				<div class="min-w-0">
					<p class="font-semibold {b.aktif ? '' : 'text-muted line-through'}">{b.nama}</p>
					<p class="text-xs text-muted">Satuan stok: {b.satuan} · {MODE[b.mode]}</p>
				</div>
				<label class="flex min-h-12 items-center gap-2 text-sm">
					<input type="checkbox" class="size-5 accent-brand" checked={b.aktif} onchange={() => ubahAktif(b)} />
					Aktif
				</label>
			</li>
		{/each}
	</ul>
{/if}
```

- [ ] **Step 3: Verifikasi**

Run: `npm test && npm run check && npm run build`
Expected: PASS, 0 error.

- [ ] **Step 4: Commit**

```bash
git add src/lib/master/api.ts src/routes/admin/bahan
git commit -m "feat(admin): halaman bahan & satuan beli (isi pack, ambang, aktif)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Halaman Menu & Harga jual + editor resep

**Files:**
- Create: `src/routes/admin/menu/+page.svelte`, `src/lib/components/master/ResepEditor.svelte`

**Interfaces:**
- Consumes: `muatOutlets`, `muatMenu`, `muatHargaJual`, `muatResep`, `muatBahan`, `simpanHargaJual`, `simpanResep` (Task 6); `petaHarga`, `kunciHarga`, `teksIsi` (Task 3); `porsiPerKg`, `qtyKgDariPorsi` (Task 3); `parseQty`, `formatQty`; `HargaInput`, `Button` (Task 5).
- Produces: `<ResepEditor menu bahan={Bahan[]} isi={BarisIsi[]} onsimpan={(isi: BarisIsi[]) => Promise<void>} onbatal={() => void} />`

- [ ] **Step 1: Editor resep**

`src/lib/components/master/ResepEditor.svelte`:
```svelte
<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import { porsiPerKg, qtyKgDariPorsi } from '#lib/master/porsi.ts';
	import { formatQty, parseQty } from '#lib/master/rupiah.ts';
	import type { Bahan, BarisIsi, Menu } from '#lib/master/types.ts';

	let {
		menu,
		bahan,
		isi,
		onsimpan,
		onbatal
	}: { menu: Menu; bahan: Bahan[]; isi: BarisIsi[]; onsimpan: (isi: BarisIsi[]) => Promise<void>; onbatal: () => void } = $props();

	type Baris = { bahan_id: string; teks: string };
	// Salinan isi saat editor dibuka; editor ditutup-buka ulang untuk memuat isi terbaru.
	const salinIsi = (daftar: BarisIsi[]): Baris[] => daftar.map((i) => ({ bahan_id: i.bahan_id, teks: formatQty(i.qty) }));
	let baris = $state<Baris[]>(salinIsi(isi));
	let error = $state('');
	let menyimpan = $state(false);

	const pilihan = $derived(bahan.filter((b) => b.aktif && b.mode !== 'analisis'));
	const satuanDari = (id: string) => bahan.find((b) => b.id === id)?.satuan ?? '';
	const beras = $derived(bahan.find((b) => b.kode === 'beras'));

	function tambah() {
		const sisa = pilihan.find((b) => !baris.some((r) => r.bahan_id === b.id));
		if (sisa) baris.push({ bahan_id: sisa.id, teks: '1' });
	}

	async function simpan() {
		error = '';
		const hasil: BarisIsi[] = [];
		for (const r of baris) {
			const qty = parseQty(r.teks);
			if (qty === null) return (error = 'Setiap jumlah harus angka lebih dari 0, mis. 0,1');
			hasil.push({ bahan_id: r.bahan_id, qty });
		}
		if (hasil.length === 0) return (error = 'Resep minimal satu bahan.');
		if (new Set(hasil.map((h) => h.bahan_id)).size !== hasil.length) return (error = 'Bahan yang sama dipilih dua kali.');
		menyimpan = true;
		try {
			await onsimpan(hasil);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			menyimpan = false;
		}
	}
</script>

<div class="mt-3 grid gap-3 rounded-xl bg-surface-2 p-3">
	<p class="text-sm font-semibold">Setiap 1 {menu.nama} terjual memotong:</p>
	{#each baris as r, idx (idx)}
		<div class="flex flex-wrap items-center gap-2">
			<label class="sr-only" for="resep-{menu.id}-bahan-{idx}">Bahan</label>
			<select
				id="resep-{menu.id}-bahan-{idx}"
				bind:value={r.bahan_id}
				class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-fg"
			>
				{#each pilihan as b (b.id)}<option value={b.id}>{b.nama}</option>{/each}
			</select>
			<label class="sr-only" for="resep-{menu.id}-qty-{idx}">Jumlah</label>
			<input
				id="resep-{menu.id}-qty-{idx}"
				bind:value={r.teks}
				inputmode="decimal"
				class="tabular min-h-12 w-24 rounded-xl border border-line-strong bg-surface px-3 text-right text-fg"
			/>
			<span class="w-14 text-sm text-muted">{satuanDari(r.bahan_id)}</span>
			<button
				type="button"
				class="min-h-12 rounded-xl px-3 text-sm text-danger hover:bg-surface"
				onclick={() => baris.splice(idx, 1)}
				aria-label="Hapus baris"
			>
				Hapus
			</button>
		</div>
		{#if beras && r.bahan_id === beras.id && parseQty(r.teks)}
			<p class="-mt-1 text-xs text-muted">= {porsiPerKg(parseQty(r.teks) ?? 0)} porsi per kg beras</p>
			<div class="-mt-1 flex flex-wrap gap-2">
				{#each [9, 10, 12, 14] as p (p)}
					<button
						type="button"
						class="min-h-10 rounded-lg border border-line px-3 text-xs hover:bg-surface"
						onclick={() => (r.teks = formatQty(qtyKgDariPorsi(p)))}
					>
						{p} porsi/kg
					</button>
				{/each}
			</div>
		{/if}
	{/each}
	{#if error}<p class="text-sm text-danger" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button variant="ghost" onclick={tambah}>+ Tambah bahan</Button>
		<span class="flex-1"></span>
		<Button variant="ghost" onclick={onbatal} disabled={menyimpan}>Batal</Button>
		<Button onclick={simpan} loading={menyimpan}>Simpan resep</Button>
	</div>
</div>
```

- [ ] **Step 2: Halaman Menu & Harga**

`src/routes/admin/menu/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import ResepEditor from '#lib/components/master/ResepEditor.svelte';
	import HargaInput from '#lib/components/ui/HargaInput.svelte';
	import { muatBahan, muatHargaJual, muatMenu, muatOutlets, muatResep, simpanHargaJual, simpanResep } from '#lib/master/api.ts';
	import { kunciHarga, petaHarga, teksIsi } from '#lib/master/susun.ts';
	import type { Bahan, BarisIsi, HargaJual, Menu, Resep } from '#lib/master/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let menu = $state<Menu[]>([]);
	let harga = $state<HargaJual[]>([]);
	let resep = $state<Resep[]>([]);
	let bahan = $state<Bahan[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let diedit = $state<string | null>(null);

	const KELOMPOK: { judul: string; cocok: (m: Menu) => boolean }[] = [
		{ judul: 'Ayam Ori', cocok: (m) => m.varian === 'ori' },
		{ judul: 'Ayam Hot', cocok: (m) => m.varian === 'hot' },
		{ judul: 'Kulit, Nasi & Box', cocok: (m) => ['kulit', 'nasi', 'box'].includes(m.kategori) },
		{ judul: 'Pelengkap (Rp0)', cocok: (m) => m.kategori === 'pelengkap' }
	];

	async function muat() {
		status = 'memuat';
		try {
			[outlets, menu, harga, resep, bahan] = await Promise.all([muatOutlets(), muatMenu(), muatHargaJual(), muatResep(), muatBahan()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const peta = $derived(petaHarga(harga, (h) => h.menu_id));
	const resepDari = (m: Menu): BarisIsi[] => resep.filter((r) => r.menu_id === m.id);

	async function ubahHarga(o: Outlet, m: Menu, n: number) {
		await simpanHargaJual(o.id, m.id, n);
		harga = [...harga.filter((h) => !(h.outlet_id === o.id && h.menu_id === m.id)), { outlet_id: o.id, menu_id: m.id, harga: n }];
	}

	async function ubahResep(m: Menu, isi: BarisIsi[]) {
		await simpanResep(m.id, isi);
		resep = [...resep.filter((r) => r.menu_id !== m.id), ...isi.map((i) => ({ ...i, menu_id: m.id }))];
		diedit = null;
	}
</script>

<svelte:head><title>Menu & Harga · Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Menu & Harga</h1>
<p class="mt-1 max-w-prose text-muted">Harga jual per outlet. Ubah angka lalu tekan Enter atau pindah kolom untuk menyimpan.</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#each KELOMPOK as k (k.judul)}
		<h2 class="mt-8 font-display text-2xl">{k.judul}</h2>
		<ul class="mt-3 grid gap-3">
			{#each menu.filter(k.cocok) as m (m.id)}
				<li class="rounded-2xl border border-line bg-surface p-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<p class="font-semibold">{m.nama}</p>
						<button
							type="button"
							class="min-h-12 rounded-xl px-3 text-left text-sm text-muted hover:bg-surface-2"
							onclick={() => (diedit = diedit === m.id ? null : m.id)}
							aria-expanded={diedit === m.id}
						>
							Resep: {teksIsi(resepDari(m), bahan)} · <span class="font-semibold text-brand">Ubah</span>
						</button>
					</div>
					<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
						{#each outlets as o (o.id)}
							<div>
								<p class="mb-1 text-xs font-semibold text-muted">{o.nama}</p>
								<HargaInput
									id="harga-{o.id}-{m.id}"
									label="Harga {m.nama} di {o.nama}"
									nilai={peta.get(kunciHarga(o.id, m.id)) ?? null}
									onsimpan={(n) => ubahHarga(o, m, n)}
								/>
							</div>
						{/each}
					</div>
					{#if diedit === m.id}
						<ResepEditor menu={m} {bahan} isi={resepDari(m)} onsimpan={(isi) => ubahResep(m, isi)} onbatal={() => (diedit = null)} />
					{/if}
				</li>
			{/each}
		</ul>
	{/each}
{/if}
```

- [ ] **Step 3: Verifikasi**

Run: `npm test && npm run check && npm run build`
Expected: PASS, 0 error.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/master src/routes/admin/menu
git commit -m "feat(admin): halaman menu & harga jual per outlet, editor resep (porsi/kg beras)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Halaman Harga Beli + seed harga beli lokal

**Files:**
- Create: `src/routes/admin/harga-beli/+page.svelte`, `scripts/lib/harga-beli.ts`, `scripts/seed-harga-beli.ts`, `data/harga-beli.local.json` (TIDAK di-commit)
- Modify: `.gitignore` (tambah `*.local.json`)
- Test: `tests/scripts/harga-beli.test.ts`

**Interfaces:**
- Consumes: `muatOutlets`, `muatSatuanBeli`, `muatHargaBeli`, `simpanHargaBeli` (Task 6); `petaHarga`, `kunciHarga` (Task 3); `HargaInput` (Task 5).
- Produces: `rencanaHargaBeli(data: Record<string, Record<string, number>>, outlets: {id; kode}[], satuan: {id; kode}[]): { baris: { outlet_id: string; satuan_beli_id: string; harga: number }[]; error: string[] }` — data berbentuk `{ "BL": { "pack_ayam_ori": 49000, ... }, "TK": {...} }`.

- [ ] **Step 1: Tulis test yang gagal**

`tests/scripts/harga-beli.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { rencanaHargaBeli } from '../../scripts/lib/harga-beli';

const outlets = [
	{ id: 'o-bl', kode: 'BL' },
	{ id: 'o-tk', kode: 'TK' }
];
const satuan = [
	{ id: 's-ori', kode: 'pack_ayam_ori' },
	{ id: 's-cup', kode: 'pack_cup_kulit' }
];

describe('rencanaHargaBeli', () => {
	it('mengubah kode menjadi baris id', () => {
		const r = rencanaHargaBeli({ BL: { pack_ayam_ori: 49000 }, TK: { pack_cup_kulit: 33300 } }, outlets, satuan);
		expect(r.error).toEqual([]);
		expect(r.baris).toEqual([
			{ outlet_id: 'o-bl', satuan_beli_id: 's-ori', harga: 49000 },
			{ outlet_id: 'o-tk', satuan_beli_id: 's-cup', harga: 33300 }
		]);
	});
	it('kode tak dikenal dan harga tidak sah dilaporkan, tidak disimpan', () => {
		const r = rencanaHargaBeli({ XX: { pack_ayam_ori: 1 }, BL: { pack_tak_ada: 1, pack_ayam_ori: -5, pack_cup_kulit: 1.5 } }, outlets, satuan);
		expect(r.baris).toEqual([]);
		expect(r.error).toEqual([
			'Outlet tidak dikenal: XX',
			'Satuan beli tidak dikenal: pack_tak_ada',
			'Harga tidak sah untuk BL/pack_ayam_ori: -5',
			'Harga tidak sah untuk BL/pack_cup_kulit: 1.5'
		]);
	});
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/scripts/harga-beli.test.ts`
Expected: FAIL, modul belum ada.

- [ ] **Step 3: Implementasi logika & script**

`scripts/lib/harga-beli.ts`:
```ts
type Baris = { outlet_id: string; satuan_beli_id: string; harga: number };

export function rencanaHargaBeli(
	data: Record<string, Record<string, number>>,
	outlets: { id: string; kode: string }[],
	satuan: { id: string; kode: string }[]
): { baris: Baris[]; error: string[] } {
	const o = new Map(outlets.map((x) => [x.kode, x.id]));
	const s = new Map(satuan.map((x) => [x.kode, x.id]));
	const baris: Baris[] = [];
	const error: string[] = [];
	for (const [kodeOutlet, daftar] of Object.entries(data)) {
		const outletId = o.get(kodeOutlet);
		if (!outletId) {
			error.push(`Outlet tidak dikenal: ${kodeOutlet}`);
			continue;
		}
		for (const [kodeSatuan, harga] of Object.entries(daftar)) {
			const satuanId = s.get(kodeSatuan);
			if (!satuanId) error.push(`Satuan beli tidak dikenal: ${kodeSatuan}`);
			else if (!Number.isSafeInteger(harga) || harga < 0) error.push(`Harga tidak sah untuk ${kodeOutlet}/${kodeSatuan}: ${harga}`);
			else baris.push({ outlet_id: outletId, satuan_beli_id: satuanId, harga });
		}
	}
	return { baris, error };
}
```

`scripts/seed-harga-beli.ts`:
```ts
// Mengisi harga beli dari data/harga-beli.local.json (diabaikan git). Jalankan:
//   node --env-file=.env.local scripts/seed-harga-beli.ts
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { rencanaHargaBeli } from './lib/harga-beli.ts';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
	auth: { persistSession: false, autoRefreshToken: false }
});
const data = JSON.parse(readFileSync('data/harga-beli.local.json', 'utf8')) as Record<string, Record<string, number>>;
const [{ data: outlets }, { data: satuan }] = await Promise.all([
	db.from('outlets').select('id, kode'),
	db.from('satuan_beli').select('id, kode')
]);
const { baris, error } = rencanaHargaBeli(data, outlets ?? [], satuan ?? []);
if (error.length) {
	console.error(error.join('\n'));
	process.exit(1);
}
const { error: e } = await db.from('harga_beli').upsert(baris.map((b) => ({ ...b, diubah_at: new Date().toISOString() })));
if (e) {
	console.error(`Gagal menyimpan: ${e.message}`);
	process.exit(1);
}
console.log(`Harga beli tersimpan: ${baris.length} baris.`);
```

Tambahkan ke `.gitignore`:
```gitignore
*.local.json
```

Buat `data/harga-beli.local.json` dari `daftar_harga_bahan_stokis.txt` (struk 30-09-2026; harga tetap stokis berlaku untuk BL & TK; beras & tepung A sebagai acuan; minyak belum diketahui — tidak diisi):
```json
{
	"BL": {
		"pack_ayam_ori": 49000, "pack_ayam_hot": 49000, "pack_kulit": 45000, "pack_cup_kulit": 33300,
		"beras_kg": 15000, "pack_kertas_nasi": 17100, "pack_box": 117200,
		"pack_kemasan_besar": 28500, "pack_kemasan_kecil": 20900,
		"pack_plastik_besar": 15200, "pack_plastik_kecil": 15200, "pack_plastik_merah": 19600,
		"pack_saus_sambal": 31125, "pack_saus_tomat": 28800,
		"pack_tepung_dkriuk": 23400, "karung_tepung_dkriuk": 351000, "karung_tepung_a": 257000
	},
	"TK": {
		"pack_ayam_ori": 49000, "pack_ayam_hot": 49000, "pack_kulit": 45000, "pack_cup_kulit": 33300,
		"beras_kg": 15000, "pack_kertas_nasi": 17100, "pack_box": 117200,
		"pack_kemasan_besar": 28500, "pack_kemasan_kecil": 20900,
		"pack_plastik_besar": 15200, "pack_plastik_kecil": 15200, "pack_plastik_merah": 19600,
		"pack_saus_sambal": 31125, "pack_saus_tomat": 28800,
		"pack_tepung_dkriuk": 23400, "karung_tepung_dkriuk": 351000, "karung_tepung_a": 257000
	}
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus; pastikan file data diabaikan git**

Run: `npx vitest run tests/scripts/harga-beli.test.ts && git check-ignore -v data/harga-beli.local.json`
Expected: PASS; baris `.gitignore:...:*.local.json  data/harga-beli.local.json`.

- [ ] **Step 5: Isi harga beli di server**

Run: `node --env-file=.env.local scripts/seed-harga-beli.ts`
Expected: `Harga beli tersimpan: 34 baris.`

- [ ] **Step 6: Halaman Harga Beli**

`src/routes/admin/harga-beli/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import HargaInput from '#lib/components/ui/HargaInput.svelte';
	import { muatHargaBeli, muatOutlets, muatSatuanBeli, simpanHargaBeli } from '#lib/master/api.ts';
	import { kunciHarga, petaHarga } from '#lib/master/susun.ts';
	import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let satuan = $state<SatuanBeli[]>([]);
	let harga = $state<HargaBeli[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');

	async function muat() {
		status = 'memuat';
		try {
			[outlets, satuan, harga] = await Promise.all([muatOutlets(), muatSatuanBeli(), muatHargaBeli()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const peta = $derived(petaHarga(harga, (h) => h.satuan_beli_id));

	async function ubah(o: Outlet, s: SatuanBeli, n: number) {
		await simpanHargaBeli(o.id, s.id, n);
		harga = [
			...harga.filter((h) => !(h.outlet_id === o.id && h.satuan_beli_id === s.id)),
			{ outlet_id: o.id, satuan_beli_id: s.id, harga: n, diubah_at: new Date().toISOString() }
		];
	}
</script>

<svelte:head><title>Harga Beli · Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Harga Beli</h1>
<p class="mt-1 max-w-prose text-muted">
	Harga beli per satuan beli di tiap outlet. Untuk barang berharga berubah-ubah (beras, tepung A, minyak), angka ini hanya acuan;
	harga sebenarnya diisi saat barang masuk.
</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	<ul class="mt-6 grid gap-3">
		{#each satuan as s (s.id)}
			<li class="rounded-2xl border border-line bg-surface p-4">
				<p class="font-semibold">{s.nama}</p>
				<p class="text-xs text-muted">{s.harga_tetap ? 'Harga tetap' : 'Harga berubah-ubah — acuan'}</p>
				<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
					{#each outlets as o (o.id)}
						<div>
							<p class="mb-1 text-xs font-semibold text-muted">{o.nama}</p>
							<HargaInput
								id="beli-{o.id}-{s.id}"
								label="Harga beli {s.nama} di {o.nama}"
								nilai={peta.get(kunciHarga(o.id, s.id)) ?? null}
								onsimpan={(n) => ubah(o, s, n)}
							/>
						</div>
					{/each}
				</div>
			</li>
		{/each}
	</ul>
{/if}
```

- [ ] **Step 7: Verifikasi & commit**

Run: `npm test && npm run check && npm run build && git status --short`
Expected: PASS, 0 error; `data/harga-beli.local.json` tidak muncul di status.

```bash
git add .gitignore scripts/lib/harga-beli.ts scripts/seed-harga-beli.ts tests/scripts/harga-beli.test.ts src/routes/admin/harga-beli
git commit -m "feat(admin): halaman harga beli per outlet + seed harga beli dari file lokal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Halaman Akun

**Files:**
- Create: `src/lib/akun/api.ts`, `src/routes/admin/akun/+page.svelte`

**Interfaces:**
- Consumes: fungsi server `admin-akun` (Task 4) — tipe `Perintah` dari `supabase/functions/_shared/akun.ts`; `supabase`; `muatOutlets` (Task 6); `validateUsername` (`#lib/auth/username.ts`); `Button`, `TextField`, `Konfirmasi` (Task 2/5).
- Produces (`src/lib/akun/api.ts`):
  - `muatAkun(): Promise<Profile[]>` (admin melihat semua profil lewat RLS)
  - `kirimPerintahAkun(p: Perintah): Promise<{ ok: true; id?: string; username?: string; password?: string }>` — melempar `Error(pesan server)`.

- [ ] **Step 1: Lapisan data akun**

`src/lib/akun/api.ts`:
```ts
import { pesanErrorData } from '#lib/master/pesan.ts';
import { supabase } from '#lib/supabase/client.ts';
import type { Profile } from '#lib/types/db.ts';
import type { Perintah } from '../../../supabase/functions/_shared/akun.ts';

export type { Perintah };

export async function muatAkun(): Promise<Profile[]> {
	const { data, error } = await supabase.from('profiles').select('id, username, nama_tampilan, role, outlet_id, aktif').order('username');
	if (error) throw new Error(pesanErrorData(error) ?? 'Daftar akun gagal dimuat.');
	return data ?? [];
}

export async function kirimPerintahAkun(p: Perintah): Promise<{ ok: true; id?: string; username?: string; password?: string }> {
	const { data, error } = await supabase.functions.invoke('admin-akun', { body: p });
	if (!error) return data;
	const res = (error as { context?: Response }).context;
	const isi = (await res?.json().catch(() => null)) as { error?: string } | null;
	throw new Error(isi?.error ?? pesanErrorData({ message: error.message, status: res?.status ?? 0 }) ?? 'Gagal menghubungi server.');
}
```

- [ ] **Step 2: Halaman Akun**

`src/routes/admin/akun/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { kirimPerintahAkun, muatAkun } from '#lib/akun/api.ts';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { validateUsername } from '#lib/auth/username.ts';
	import Button from '#lib/components/ui/Button.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import { muatOutlets } from '#lib/master/api.ts';
	import type { Outlet, Profile } from '#lib/types/db.ts';

	let akun = $state<Profile[]>([]);
	let outlets = $state<Outlet[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let info = $state<{ username: string; password: string; judul: string } | null>(null);

	let fUsername = $state('');
	let fNama = $state('');
	let fRole = $state<'kasir' | 'admin'>('kasir');
	let fOutlet = $state('BL');
	let fError = $state('');
	let membuat = $state(false);

	async function muat() {
		status = 'memuat';
		try {
			[akun, outlets] = await Promise.all([muatAkun(), muatOutlets()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const namaOutlet = (id: string | null) => outlets.find((o) => o.id === id)?.nama ?? '—';

	async function buat(e: SubmitEvent) {
		e.preventDefault();
		fError = validateUsername(fUsername) ?? (fNama.trim() ? '' : 'Nama tampilan wajib diisi.');
		if (fError) return;
		membuat = true;
		try {
			const r = await kirimPerintahAkun({
				aksi: 'buat',
				username: fUsername,
				nama_tampilan: fNama,
				role: fRole,
				outlet_kode: fRole === 'kasir' ? fOutlet : null
			});
			info = { username: r.username!, password: r.password!, judul: 'Akun dibuat' };
			fUsername = '';
			fNama = '';
			await muat();
		} catch (err) {
			fError = (err as Error).message;
		} finally {
			membuat = false;
		}
	}

	async function aksi(fn: () => Promise<unknown>) {
		pesan = '';
		try {
			await fn();
			await muat();
		} catch (err) {
			pesan = (err as Error).message;
		}
	}

	const reset = (a: Profile) =>
		aksi(async () => {
			const r = await kirimPerintahAkun({ aksi: 'reset_password', id: a.id });
			info = { username: a.username, password: r.password!, judul: 'Password direset' };
		});
	const setAktif = (a: Profile, aktif: boolean) => aksi(() => kirimPerintahAkun({ aksi: 'set_aktif', id: a.id, aktif }));
	const pindah = (a: Profile, kode: string) => aksi(() => kirimPerintahAkun({ aksi: 'ubah', id: a.id, outlet_kode: kode }));

	async function salin(teks: string) {
		try {
			await navigator.clipboard.writeText(teks);
		} catch {
			// clipboard ditolak: teks tetap bisa diblok dan disalin manual
		}
	}
</script>

<svelte:head><title>Akun · Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Akun</h1>
<p class="mt-1 max-w-prose text-muted">Akun kasir terikat ke outlet. Menonaktifkan akun langsung memblokir login.</p>

{#if info}
	<div class="mt-6 rounded-2xl border-2 border-ok bg-surface p-4" role="status">
		<p class="font-semibold">{info.judul}: {info.username}</p>
		<p class="mt-1 text-sm text-muted">Password ini hanya ditampilkan sekali. Catat dan berikan ke pemilik akun.</p>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<code class="tabular rounded-lg bg-surface-2 px-3 py-2 text-lg select-all">{info.password}</code>
			<Button variant="secondary" onclick={() => salin(info!.password)}>Salin</Button>
			<Button variant="ghost" onclick={() => (info = null)}>Tutup</Button>
		</div>
	</div>
{/if}

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#if pesan}<p class="mt-4 text-danger" role="alert">{pesan}</p>{/if}

	<ul class="mt-6 grid gap-3">
		{#each akun as a (a.id)}
			<li class="rounded-2xl border border-line bg-surface p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="font-semibold {a.aktif ? '' : 'text-muted line-through'}">{a.nama_tampilan}</p>
						<p class="text-xs text-muted">
							{a.username} · {a.role === 'admin' ? 'Admin' : `Kasir ${namaOutlet(a.outlet_id)}`}{a.aktif ? '' : ' · Nonaktif'}
						</p>
					</div>
					<div class="flex flex-wrap gap-2">
						{#if a.role === 'kasir'}
							<label class="sr-only" for="pindah-{a.id}">Pindah outlet {a.username}</label>
							<select
								id="pindah-{a.id}"
								class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg"
								value={outlets.find((o) => o.id === a.outlet_id)?.kode}
								onchange={(e) => pindah(a, e.currentTarget.value)}
							>
								{#each outlets as o (o.id)}<option value={o.kode}>{o.nama}</option>{/each}
							</select>
						{/if}
						<Konfirmasi label="Reset password" konfirmasiLabel="Ya, reset" onkonfirmasi={() => reset(a)} />
						{#if a.id !== auth.profile?.id}
							{#if a.aktif}
								<Konfirmasi label="Nonaktifkan" konfirmasiLabel="Ya, nonaktifkan" onkonfirmasi={() => setAktif(a, false)} />
							{:else}
								<Button variant="secondary" onclick={() => setAktif(a, true)}>Aktifkan</Button>
							{/if}
						{/if}
					</div>
				</div>
			</li>
		{/each}
	</ul>

	<h2 class="mt-10 font-display text-2xl">Tambah akun</h2>
	<form class="mt-3 grid max-w-md gap-4" onsubmit={buat} novalidate>
		<TextField id="akun-username" label="Username" bind:value={fUsername} autocapitalize="none" spellcheck={false} placeholder="mis. kasir.bukitlama2" />
		<TextField id="akun-nama" label="Nama tampilan" bind:value={fNama} placeholder="mis. Kasir Bukit Lama (Sore)" />
		<div class="grid gap-1.5">
			<label for="akun-role" class="text-sm font-semibold">Peran</label>
			<select id="akun-role" bind:value={fRole} class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg">
				<option value="kasir">Kasir</option>
				<option value="admin">Admin</option>
			</select>
		</div>
		{#if fRole === 'kasir'}
			<div class="grid gap-1.5">
				<label for="akun-outlet" class="text-sm font-semibold">Outlet</label>
				<select id="akun-outlet" bind:value={fOutlet} class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg">
					{#each outlets as o (o.id)}<option value={o.kode}>{o.merek} {o.nama}</option>{/each}
				</select>
			</div>
		{/if}
		{#if fError}<p class="text-sm font-semibold text-danger" role="alert">{fError}</p>{/if}
		<Button type="submit" loading={membuat}>Buat akun</Button>
	</form>
{/if}
```

- [ ] **Step 3: Verifikasi**

Run: `npm test && npm run check && npm run build`
Expected: PASS, 0 error.

- [ ] **Step 4: Commit**

```bash
git add src/lib/akun src/routes/admin/akun
git commit -m "feat(admin): halaman akun (tambah, pindah outlet, reset password, nonaktif/aktif)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verifikasi akhir terhadap server & daftar cek owner

**Files:**
- Modify: `docs/superpowers/plans/2026-10-04-00-roadmap.md`, `README.md`

- [ ] **Step 1: Uji ulang E2E akun dan cek data master di server**

Run: `node --env-file=.env.local scripts/uji-akun.ts`
Expected: semua `OK`.

Run (cek jumlah data master di server dengan service role, tanpa menampilkan kunci):
```bash
node --env-file=.env.local -e "
import('@supabase/supabase-js').then(async ({ createClient }) => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const t of ['bahan','satuan_beli','satuan_beli_isi','menu','resep','harga_jual','harga_beli']) {
    const { count } = await db.from(t).select('*', { count: 'exact', head: true });
    console.log(t, count);
  }
});"
```
Expected: `bahan 23`, `satuan_beli 18`, `satuan_beli_isi 24`, `menu 17`, `resep 19`, `harga_jual 51`, `harga_beli 34`.

- [ ] **Step 2: README & roadmap**

Di `README.md` tabel Perintah, tambahkan baris:
```markdown
| `npm run sb -- <perintah>` | Supabase CLI dengan kredensial `.env.local` (mis. `db push`, `functions deploy admin-akun --use-api`) |
| `node --env-file=.env.local scripts/uji-akun.ts` | uji fungsi server akun dengan akun sementara |
| `node --env-file=.env.local scripts/seed-harga-beli.ts` | isi harga beli dari `data/harga-beli.local.json` (tidak di-commit) |
```

Di roadmap, ubah status Tahap 1 menjadi `selesai (menunggu uji layar owner)` dan isi kolom rencana dengan `2026-10-04-tahap-1-data-master.md`.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/plans/2026-10-04-00-roadmap.md
git commit -m "docs: Tahap 1 selesai, perintah baru di README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Serahkan daftar cek ke owner** (login sebagai admin di laptop)

1. Menu Admin (bawah di HP / samping di tablet) berisi Beranda, Bahan, Menu & Harga, Harga Beli, Akun.
2. **Menu & Harga**: Dada Ori BL 11.000, KP 10.000. Ubah satu harga (ketik `12000`, Enter) → tampil `12.000` + ✓; muat ulang halaman → tetap. Kembalikan ke 11.000.
3. Ketik `11rb` → muncul pesan "Isi angka Rupiah…", nilai lama tidak berubah.
4. **Resep Nasi** → Ubah → tekan "12 porsi/kg" → Simpan → ringkasan resep menjadi `0,0833 kg Beras · 1 lembar Kertas Nasi`. Kembalikan ke 10 porsi/kg.
5. **Bahan**: Pack Ayam Ori isi 3/2/2/2; ambang 10. Pack Kulit isi 17.
6. **Harga Beli**: BL & TK terisi (Pack Ayam Ori 49.000); Kertapati kosong — isi sesuai belanja di tempat.
7. **Akun**: buat kasir uji (mis. `kasir.uji`, outlet Kertapati) → password tampil sekali → login di jendela penyamaran dengan akun itu → masuk halaman Kasir Kertapati. Nonaktifkan dari admin → login lagi ditolak "Akun ini tidak bisa dipakai masuk". Akun uji boleh dibiarkan nonaktif.
8. Login sebagai kasir → buka `#/admin/menu` → kembali ke halaman kasir.
