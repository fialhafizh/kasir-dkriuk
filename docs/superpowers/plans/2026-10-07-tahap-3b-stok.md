# Tahap 3b — Stok Lanjutan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rusak/terbuang (termasuk langkah wajib "sisa tidak terjual" di Tutup toko), transfer antar outlet dengan konfirmasi jumlah buta, dan opname mingguan hitung buta dengan persetujuan admin — semuanya menulis buku besar `gerakan_stok` dari 3a.

**Architecture:** Migrasi enum tersendiri (0012), skema (0013), lalu fungsi per fitur: kunci bersama per outlet + penjaga barang masuk + rusak (0014), transfer (0015), opname (0016). Semua penulisan lewat fungsi `security definer`; penjaga "sebelum dihitung" barang masuk dipindah ke trigger agar mencakup opname tanpa menyalin fungsi 3a. Klien: modul murni teruji (isian opsional, sisa harian, selisih & pengingat opname) + halaman kasir (rusak, kirim, terima, opname, langkah sisa) dan admin (rusak, transfer, opname). Bagian "Hitungan" di spec diwujudkan sebagai dua halaman bertetangga di menu Stok admin: **Stok awal** (3a) dan **Opname** (baru).

**Tech Stack:** SvelteKit 3 + Svelte 5, Tailwind 4, Supabase (Postgres RLS, trigger, fungsi SQL), Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-10-07-tahap-3b-stok-design.md`. Wajib baca spec 3a (`2026-10-06-tahap-3a-stok-design.md`) dan "Catatan wajib" roadmap (keluarga "sebelum dihitung", kunci bersama, enum di file terpisah).

## Global Constraints

- **SvelteKit 3**: impor `#lib/...` dengan ekstensi; hash router (`href()`, `routePath(page.url)`); tanpa `+layout.ts`.
- Migrasi 0001–0011 sudah di server: **jangan diubah**. Baru: `20261007000012_jenis_gerakan_3b.sql`, `20261007000013_stok_3b.sql`, `20261007000014_fungsi_rusak.sql`, `20261007000015_fungsi_transfer.sql`, `20261007000016_fungsi_opname.sql`.
- Tabel baru: FK `on delete restrict`; `revoke all ... from anon, authenticated` lalu `grant select` seperlunya; `service_role` eksplisit; tulis hanya lewat fungsi `security definer` (`search_path = ''`); cek akses `coalesce` (kasir nonaktif tidak lolos).
- Pesan galat Indonesia, errcode `22023`/`42501`; semua masuk allowlist `pesanStok`; tes membaca migrasi.
- Kunci bersama: `public._kunci_stok(outlet)` dipakai putuskan stok awal/opname, barang masuk (trigger), rusak & batalnya, terima transfer (dua outlet, urutan uuid), ajukan opname.
- Hitung buta: penerima transfer tidak bisa membaca item selama status `dikirim`; `opname_item` (berisi `qty_sistem`) hanya admin.
- Keputusan owner: transfer tanpa persetujuan admin; tidak cocok → tidak bisa dikonfirmasi ("Ada perbedaan jumlah. Silakan hubungi outlet pengirim (…)"); void selalu mengembalikan stok (tidak diubah).
- UI Bahasa Indonesia, sentuh ≥ 48 px, ≤1000 baris/file, galat dekat sumber. Harga beli tetap admin-saja. Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Angka contoh di tes jangan menyerupai harga beli asli (`tests/rahasia.test.ts`).

## Review Focus

1. Penerima mengetik jumlah berbeda / bahan berbeda / bahan kurang → ditolak dan stok kedua outlet tidak berubah; jumlah sama → pindah tepat sekali (konfirmasi ganda ditolak). Diuji Task 3.
2. Outlet tujuan membaca `transfer_item` saat status `dikirim` (mengintip angka) → tidak bisa; setelah diterima bisa. Diuji Task 1.
3. Opname diajukan saat ada transfer menunggu / tanpa stok awal / ajuan ganda → ditolak; disetujui → stok = hitungan pada jam dihitung (jual sesudahnya tetap memotong), `qty_sistem` tersimpan. Diuji Task 4.
4. Barang masuk bertanggal sebelum **opname** disetujui, atau batal rusak yang terjadi sebelum hitungan → ditolak. Diuji Task 2 & 4.
5. Langkah "sisa tidak terjual" di Tutup toko: nasi porsi dikonversi ke kg beras sesuai resep; jawaban diingat per shift; "Tidak ada" langsung lanjut. Diuji Task 5 (logika) — tampilan lewat daftar uji owner.

---

## File Structure

```
supabase/migrations/20261007000012_jenis_gerakan_3b.sql  # enum jenis_gerakan +5 nilai (file tersendiri)
supabase/migrations/20261007000013_stok_3b.sql           # rusak, transfer, opname (+item), kolom sumber gerakan, RLS
supabase/migrations/20261007000014_fungsi_rusak.sql      # _kunci_stok, _dihitung_terakhir, trigger jaga barang masuk, putuskan_stok_awal (+kunci), catat/batal rusak
supabase/migrations/20261007000015_fungsi_transfer.sql   # kirim/ubah/batal/terima transfer
supabase/migrations/20261007000016_fungsi_opname.sql     # ajukan/pratinjau/putuskan opname
tests/db/harness-3b.ts                                   # bantuan: setujuiStokAwal, rpc
tests/db/stok-3b-skema.test.ts, stok-rusak.test.ts, stok-transfer.test.ts, stok-opname.test.ts
src/lib/stok/types.ts (ubah)          # AlasanRusak, Rusak, Transfer, Opname, BarisPratinjau
src/lib/stok/tampil.ts (ubah)         # LABEL_JENIS + LABEL_ALASAN
src/lib/stok/isian.ts (ubah)          # kumpulkanIsianOpsional
src/lib/stok/sisa.ts (+test)          # bentukSisa, kumpulkanSisa
src/lib/stok/opname.ts (+test)        # isiPerBahan, selisihBesar, perluOpname
src/lib/stok/pesan.ts (ubah, +test)   # allowlist 0014–0016
src/lib/stok/api-lanjut.ts            # rusak, transfer, opname via Supabase
src/lib/components/stok/FormStokAwal.svelte (ubah)  # prop opsional
src/lib/components/stok/LangkahSisa.svelte          # langkah sisa di Tutup toko
src/routes/kasir/stok/+page.svelte (ubah)           # tombol & pengingat
src/routes/kasir/stok/{rusak,kirim,terima,opname}/+page.svelte
src/routes/kasir/tutup/+page.svelte (ubah)
src/routes/admin/stok/{rusak,transfer,opname}/+page.svelte
src/routes/admin/stok/+page.svelte (ubah), src/lib/components/stok/RingkasanStok.svelte (ubah)
scripts/uji-stok-3b.ts, docs/uji/tahap-3b-stok-owner.md
```

---

### Task 1: Enum & skema 3b + RLS hitung buta

**Files:**
- Create: `supabase/migrations/20261007000012_jenis_gerakan_3b.sql`, `supabase/migrations/20261007000013_stok_3b.sql`, `tests/db/harness-3b.ts`
- Test: `tests/db/stok-3b-skema.test.ts`

**Interfaces:**
- Produces: enum `alasan_rusak('sisa_tidak_laku','dimakan_karyawan','gosong','basi','jatuh_rusak','lainnya')`, `status_transfer('dikirim','diterima','dibatalkan')`; tabel `rusak(id, outlet_id, waktu, alasan, catatan, dicatat_oleh, batal_at, batal_oleh, batal_alasan)`, `rusak_item(rusak_id, bahan_id, qty)`, `transfer(id, dari_outlet_id, ke_outlet_id, status, catatan, dikirim_at, dikirim_oleh, diubah_at, diterima_at, diterima_oleh, batal_at, batal_oleh, batal_alasan)`, `transfer_item(transfer_id, bahan_id, qty)`, `opname(id, outlet_id, status, dihitung_at, diajukan_oleh, diputus_at, diputus_oleh, catatan)`, `opname_item(opname_id, bahan_id, qty_hitung, qty_sistem)`; `gerakan_stok.rusak_id/transfer_id/opname_id`. Harness: `rpc<T>(db, oleh, sql, params)`, `setujuiStokAwal(db, kasir, admin, outletKode, item: [string, number][], mundurJam = 0)`.

- [ ] **Step 1: Harness**

`tests/db/harness-3b.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { sebagai } from './harness';
import { idOutlet } from './harness-kasir';
import { idBahan } from './harness-stok';

export async function rpc<T>(db: PGlite, oleh: string, sql: string, params: unknown[]): Promise<T> {
	return sebagai(db, oleh, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0].r);
}

export async function isian(db: PGlite, item: [string, number][]): Promise<{ bahan_id: string; qty: number }[]> {
	return Promise.all(item.map(async ([kode, qty]) => ({ bahan_id: await idBahan(db, kode), qty })));
}

/** Kasir mengajukan stok awal, admin langsung menyetujui. mundurJam: geser dihitung_at ke belakang. */
export async function setujuiStokAwal(db: PGlite, kasir: string, admin: string, outletKode: string, item: [string, number][], mundurJam = 0) {
	const id = await rpc<string>(db, kasir, 'public.ajukan_stok_awal($1, $2::jsonb)', [await idOutlet(db, outletKode), JSON.stringify(await isian(db, item))]);
	if (mundurJam) await db.query(`update public.stok_awal set dihitung_at = now() - make_interval(hours => $2::int) where id = $1`, [id, mundurJam]);
	await rpc(db, admin, 'public.putuskan_stok_awal($1, $2, $3::jsonb, $4)', [id, true, null, null]);
	return id;
}
```

- [ ] **Step 2: Tes skema (gagal dulu)**

`tests/db/stok-3b-skema.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';
import { idOutlet } from './harness-kasir';
import { idBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;
let kasirKP: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
	kasirKP = await buatUser(db, { username: 'kasir.kertapati', role: 'kasir', outlet_kode: 'KP' });
});

const baca = <T>(oleh: string, sql: string, params: unknown[] = []) => sebagai(db, oleh, async () => (await db.query<T>(sql, params)).rows);

async function transferLangsung(status: 'dikirim' | 'diterima'): Promise<string> {
	const id = crypto.randomUUID();
	const [bl, tk] = [await idOutlet(db, 'BL'), await idOutlet(db, 'TK')];
	await db.query(
		`insert into public.transfer (id, dari_outlet_id, ke_outlet_id, status, diterima_at) values ($1, $2, $3, $4::public.status_transfer, case when $4::text = 'diterima' then now() end)`,
		[id, bl, tk, status]
	);
	await db.query('insert into public.transfer_item (transfer_id, bahan_id, qty) values ($1, $2, 18)', [id, await idBahan(db, 'ori_dada')]);
	return id;
}

describe('hitung buta transfer', () => {
	it('outlet tujuan tidak bisa membaca item selama dikirim; pengirim & admin bisa', async () => {
		const id = await transferLangsung('dikirim');
		expect(await baca(kasirTK, 'select * from public.transfer where id = $1', [id])).toHaveLength(1);
		expect(await baca(kasirTK, 'select * from public.transfer_item where transfer_id = $1', [id])).toHaveLength(0);
		expect(await baca(kasirBL, 'select * from public.transfer_item where transfer_id = $1', [id])).toHaveLength(1);
		expect(await baca(adminId, 'select * from public.transfer_item where transfer_id = $1', [id])).toHaveLength(1);
	});
	it('setelah diterima, outlet tujuan bisa membaca item; outlet lain tidak melihat transfer sama sekali', async () => {
		const id = await transferLangsung('diterima');
		expect(await baca(kasirTK, 'select * from public.transfer_item where transfer_id = $1', [id])).toHaveLength(1);
		expect(await baca(kasirKP, 'select * from public.transfer where id = $1', [id])).toHaveLength(0);
	});
});

describe('hak akses tabel 3b', () => {
	it('opname_item (berisi angka sistem) hanya admin; kepala opname terbaca kasir outletnya', async () => {
		const bl = await idOutlet(db, 'BL');
		const op = (await db.query<{ id: string }>(`insert into public.opname (outlet_id) values ($1) returning id`, [bl])).rows[0].id;
		await db.query('insert into public.opname_item (opname_id, bahan_id, qty_hitung) values ($1, $2, 5)', [op, await idBahan(db, 'ori_dada')]);
		expect(await baca(kasirBL, 'select id from public.opname')).toHaveLength(1);
		expect(await baca(kasirTK, 'select id from public.opname')).toHaveLength(0);
		expect(await baca(kasirBL, 'select * from public.opname_item')).toHaveLength(0);
		expect(await baca(adminId, 'select * from public.opname_item')).toHaveLength(1);
	});
	it('rusak terbaca outlet sendiri saja', async () => {
		const bl = await idOutlet(db, 'BL');
		await db.query(`insert into public.rusak (id, outlet_id, alasan) values (gen_random_uuid(), $1, 'gosong')`, [bl]);
		expect(await baca(kasirBL, 'select id from public.rusak')).toHaveLength(1);
		expect(await baca(kasirTK, 'select id from public.rusak')).toHaveLength(0);
	});
	it.each(['rusak', 'rusak_item', 'transfer', 'transfer_item', 'opname', 'opname_item'])('anon tidak bisa membaca %s; login tidak bisa menulis', async (t) => {
		await expect(sebagaiAnon(db, () => db.query(`select * from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for table ${t}`));
		await expect(sebagai(db, adminId, () => db.query(`delete from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for table ${t}`));
	});
});

describe('aturan tabel', () => {
	it('transfer ke outlet yang sama ditolak; rusak lainnya tanpa catatan ditolak; gerakan rusak wajib sumber', async () => {
		const bl = await idOutlet(db, 'BL');
		await expect(db.query(`insert into public.transfer (id, dari_outlet_id, ke_outlet_id) values (gen_random_uuid(), $1, $1)`, [bl])).rejects.toThrow(/transfer_beda_outlet/);
		await expect(db.query(`insert into public.rusak (id, outlet_id, alasan) values (gen_random_uuid(), $1, 'lainnya')`, [bl])).rejects.toThrow(/rusak_lainnya_bercatatan/);
		await expect(
			db.query(`insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu) values ($1, $2, -1, 'rusak', now())`, [bl, await idBahan(db, 'ori_dada')])
		).rejects.toThrow(/gerakan_sumber_rusak/);
	});
});
```

- [ ] **Step 3: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/stok-3b-skema.test.ts`
Expected: FAIL — `relation "public.transfer" does not exist`.

- [ ] **Step 4: Migrasi**

`supabase/migrations/20261007000012_jenis_gerakan_3b.sql`:
```sql
-- Nilai jenis gerakan untuk Tahap 3b. File tersendiri: nilai enum baru tidak bisa dipakai
-- di transaksi yang sama dengan penambahannya.
alter type public.jenis_gerakan add value 'rusak';
alter type public.jenis_gerakan add value 'rusak_batal';
alter type public.jenis_gerakan add value 'transfer_keluar';
alter type public.jenis_gerakan add value 'transfer_masuk';
alter type public.jenis_gerakan add value 'opname';
```

`supabase/migrations/20261007000013_stok_3b.sql`:
```sql
-- Stok lanjutan (Tahap 3b): rusak/terbuang, transfer antar outlet, opname mingguan.
-- Pengguna login hanya MEMBACA; penulisan lewat fungsi security definer (0014–0016).

create type public.alasan_rusak as enum ('sisa_tidak_laku', 'dimakan_karyawan', 'gosong', 'basi', 'jatuh_rusak', 'lainnya');
create type public.status_transfer as enum ('dikirim', 'diterima', 'dibatalkan');

create table public.rusak (
  id uuid primary key,
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  waktu timestamptz not null default now(),
  alasan public.alasan_rusak not null,
  catatan text check (catatan is null or length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles (id) on delete restrict,
  batal_at timestamptz,
  batal_oleh uuid references public.profiles (id) on delete restrict,
  batal_alasan text,
  constraint rusak_lainnya_bercatatan check (alasan <> 'lainnya' or length(trim(coalesce(catatan, ''))) >= 3),
  constraint rusak_batal_lengkap check ((batal_at is null) = (batal_alasan is null))
);
create index rusak_outlet_waktu on public.rusak (outlet_id, waktu desc);

create table public.rusak_item (
  rusak_id uuid not null references public.rusak (id) on delete restrict,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty numeric(14, 4) not null check (qty > 0),
  primary key (rusak_id, bahan_id)
);

create table public.transfer (
  id uuid primary key,
  dari_outlet_id uuid not null references public.outlets (id) on delete restrict,
  ke_outlet_id uuid not null references public.outlets (id) on delete restrict,
  status public.status_transfer not null default 'dikirim',
  catatan text check (catatan is null or length(catatan) <= 200),
  dikirim_at timestamptz not null default now(),
  dikirim_oleh uuid references public.profiles (id) on delete restrict,
  diubah_at timestamptz,
  diterima_at timestamptz,
  diterima_oleh uuid references public.profiles (id) on delete restrict,
  batal_at timestamptz,
  batal_oleh uuid references public.profiles (id) on delete restrict,
  batal_alasan text,
  constraint transfer_beda_outlet check (dari_outlet_id <> ke_outlet_id),
  constraint transfer_diterima_lengkap check ((status = 'diterima') = (diterima_at is not null)),
  constraint transfer_batal_lengkap check ((status = 'dibatalkan') = (batal_at is not null and batal_alasan is not null))
);
create index transfer_dari on public.transfer (dari_outlet_id, status);
create index transfer_ke on public.transfer (ke_outlet_id, status);

create table public.transfer_item (
  transfer_id uuid not null references public.transfer (id) on delete restrict,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty numeric(14, 4) not null check (qty > 0),
  primary key (transfer_id, bahan_id)
);

create table public.opname (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  status public.status_stok_awal not null default 'diajukan',
  dihitung_at timestamptz not null default now(),
  diajukan_oleh uuid references public.profiles (id) on delete restrict,
  diputus_at timestamptz,
  diputus_oleh uuid references public.profiles (id) on delete restrict,
  catatan text check (catatan is null or length(catatan) <= 200),
  constraint opname_diputus check ((status = 'diajukan') = (diputus_at is null))
);
create unique index opname_satu_diajukan on public.opname (outlet_id) where status = 'diajukan';
create index opname_outlet_dihitung on public.opname (outlet_id, dihitung_at desc);

create table public.opname_item (
  opname_id uuid not null references public.opname (id) on delete restrict,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty_hitung numeric(14, 4) not null check (qty_hitung >= 0 and qty_hitung <= 1000000),
  -- Saldo buku besar s.d. dihitung_at, disimpan saat disetujui (laporan susut).
  qty_sistem numeric(14, 4),
  primary key (opname_id, bahan_id)
);

alter table public.gerakan_stok
  add column rusak_id uuid references public.rusak (id) on delete restrict,
  add column transfer_id uuid references public.transfer (id) on delete restrict,
  add column opname_id uuid references public.opname (id) on delete restrict,
  add constraint gerakan_sumber_rusak check ((jenis in ('rusak', 'rusak_batal')) = (rusak_id is not null)),
  add constraint gerakan_sumber_transfer check ((jenis in ('transfer_keluar', 'transfer_masuk')) = (transfer_id is not null)),
  add constraint gerakan_sumber_opname check ((jenis = 'opname') = (opname_id is not null));
create index gerakan_rusak on public.gerakan_stok (rusak_id) where rusak_id is not null;
create index gerakan_transfer on public.gerakan_stok (transfer_id) where transfer_id is not null;
create index gerakan_opname on public.gerakan_stok (opname_id) where opname_id is not null;

alter table public.rusak enable row level security;
alter table public.rusak_item enable row level security;
alter table public.transfer enable row level security;
alter table public.transfer_item enable row level security;
alter table public.opname enable row level security;
alter table public.opname_item enable row level security;

revoke all on public.rusak, public.rusak_item, public.transfer, public.transfer_item, public.opname, public.opname_item
  from anon, authenticated;
grant select on public.rusak, public.rusak_item, public.transfer, public.transfer_item, public.opname, public.opname_item
  to authenticated;
grant all on public.rusak, public.rusak_item, public.transfer, public.transfer_item, public.opname, public.opname_item
  to service_role;

create policy rusak_baca on public.rusak for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy rusak_item_baca on public.rusak_item for select to authenticated
  using (exists (select 1 from public.rusak r where r.id = rusak_id));
create policy transfer_baca on public.transfer for select to authenticated
  using ((select public.is_admin()) or dari_outlet_id = (select public.my_outlet_id()) or ke_outlet_id = (select public.my_outlet_id()));
-- Hitung buta: outlet tujuan baru melihat isi kiriman setelah selesai (diterima/dibatalkan).
create policy transfer_item_baca on public.transfer_item for select to authenticated
  using (exists (
    select 1 from public.transfer t
    where t.id = transfer_id
      and ((select public.is_admin())
        or t.dari_outlet_id = (select public.my_outlet_id())
        or (t.ke_outlet_id = (select public.my_outlet_id()) and t.status <> 'dikirim'))
  ));
create policy opname_baca on public.opname for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
-- Berisi angka sistem: hanya admin (opname hitung buta).
create policy opname_item_baca on public.opname_item for select to authenticated using ((select public.is_admin()));
```

- [ ] **Step 5: Jalankan, pastikan lulus (dan tes lama hijau)**

Run: `npx vitest run tests/db`
Expected: PASS semua.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261007000012_jenis_gerakan_3b.sql supabase/migrations/20261007000013_stok_3b.sql tests/db/harness-3b.ts tests/db/stok-3b-skema.test.ts
git commit -m "feat(stok): skema rusak, transfer, opname dengan hitung buta di RLS"
```

---

### Task 2: Kunci bersama, penjaga barang masuk (opname), rusak

**Files:**
- Create: `supabase/migrations/20261007000014_fungsi_rusak.sql`
- Test: `tests/db/stok-rusak.test.ts`

**Interfaces:**
- Consumes: Task 1; `_cek_akses_outlet`, `_wajib_admin_stok`, `_cek_isian_stok` (0009/0011).
- Produces: `_kunci_stok(uuid)`, `_dihitung_terakhir(uuid) returns timestamptz`, `_cek_isian_positif(jsonb)` (internal); RPC `catat_rusak(p jsonb) returns uuid` dengan `p = { id, outlet_id, alasan, catatan?, item: [{bahan_id, qty}] }`, `batal_rusak(p_id uuid, p_alasan text) returns void`; `putuskan_stok_awal` diganti (perilaku sama + kunci); trigger `barang_masuk_jaga`.

- [ ] **Step 1: Tes (gagal dulu)**

`tests/db/stok-rusak.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { isian, rpc, setujuiStokAwal } from './harness-3b';
import { idOutlet } from './harness-kasir';
import { idSatuan, stokBahan } from './harness-stok';

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

const stok = (kode: string) => stokBahan(db, 'BL', kode);
async function rusak(oleh: string, item: [string, number][], extra: Record<string, unknown> = {}) {
	const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), alasan: 'gosong', item: await isian(db, item), ...extra };
	await rpc(db, oleh, 'public.catat_rusak($1::jsonb)', [JSON.stringify(p)]);
	return p.id;
}
const batal = (oleh: string, id: string, alasan = 'salah catat') => rpc(db, oleh, 'public.batal_rusak($1, $2)', [id, alasan]);

describe('catat rusak', () => {
	it('kasir mencatat → stok berkurang langsung (boleh minus), satu baris per bahan', async () => {
		await rusak(kasirBL, [
			['ori_sayap', 3],
			['minyak', 0.5]
		]);
		expect(await stok('ori_sayap')).toBe(-3);
		expect(await stok('minyak')).toBeCloseTo(-0.5, 4);
		const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.gerakan_stok where jenis = 'rusak'`);
		expect(rows[0].n).toBe(2);
	});
	it('id sama dikirim dua kali → sekali', async () => {
		const id = crypto.randomUUID();
		await rusak(kasirBL, [['ori_dada', 1]], { id });
		await rusak(kasirBL, [['ori_dada', 1]], { id });
		expect(await stok('ori_dada')).toBe(-1);
	});
	it('isian salah ditolak: kosong, jumlah 0, alasan lainnya tanpa catatan, outlet lain', async () => {
		await expect(rusak(kasirBL, [])).rejects.toThrow(/minimal satu bahan/);
		await expect(rusak(kasirBL, [['ori_dada', 0]])).rejects.toThrow(/Jumlah stok tidak sah/);
		await expect(rusak(kasirBL, [['ori_dada', 1]], { alasan: 'lainnya' })).rejects.toThrow(/Catatan wajib/);
		await expect(rusak(kasirTK, [['ori_dada', 1]])).rejects.toThrow(/tidak berhak/);
	});
	it('alasan lainnya dengan catatan diterima', async () => {
		await rusak(kasirBL, [['ori_dada', 1]], { alasan: 'lainnya', catatan: 'diminta tetangga' });
		expect(await stok('ori_dada')).toBe(-1);
	});
});

describe('batal rusak', () => {
	it('admin membatalkan → kembali persis; sekali saja; kasir tidak boleh', async () => {
		const id = await rusak(kasirBL, [['ori_sayap', 3]]);
		await expect(batal(kasirBL, id)).rejects.toThrow(/Hanya admin/);
		await batal(adminId, id);
		expect(await stok('ori_sayap')).toBe(0);
		await expect(batal(adminId, id)).rejects.toThrow(/sudah dibatalkan/);
	});
	it('rusak yang terjadi sebelum stok dihitung tidak bisa dibatalkan', async () => {
		const id = await rusak(kasirBL, [['ori_sayap', 3]]);
		await db.query(`update public.rusak set waktu = now() - interval '2 hours' where id = $1`, [id]);
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_sayap', 10]], 1);
		await expect(batal(adminId, id)).rejects.toThrow(/sebelum stok dihitung/);
		expect(await stok('ori_sayap')).toBe(10);
	});
});

describe('penjaga barang masuk (trigger, mencakup opname)', () => {
	it('barang masuk bertanggal sebelum opname disetujui ditolak', async () => {
		const bl = await idOutlet(db, 'BL');
		await db.query(
			`insert into public.opname (outlet_id, status, dihitung_at, diputus_at) values ($1, 'disetujui', now() - interval '1 hour', now())`,
			[bl]
		);
		const tanggal = (await db.query<{ t: string }>('select (public.tanggal_wib(now()) - 2)::text as t')).rows[0].t;
		const p = { id: crypto.randomUUID(), outlet_id: bl, tanggal, item: [{ satuan_beli_id: await idSatuan(db, 'pack_box'), qty: 1, harga: 1 }] };
		await expect(rpc(db, adminId, 'public.catat_barang_masuk($1::jsonb)', [JSON.stringify(p)])).rejects.toThrow(/sebelum stok dihitung/);
	});
	it('barang masuk hari ini sesudah hitungan tetap boleh', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['box', 5]], 1);
		const tanggal = (await db.query<{ t: string }>('select public.tanggal_wib(now())::text as t')).rows[0].t;
		const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), tanggal, item: [{ satuan_beli_id: await idSatuan(db, 'pack_box'), qty: 1, harga: 1 }] };
		await rpc(db, adminId, 'public.catat_barang_masuk($1::jsonb)', [JSON.stringify(p)]);
		expect(await stok('box')).toBe(105);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/stok-rusak.test.ts`
Expected: FAIL — `function public.catat_rusak(jsonb) does not exist`.

- [ ] **Step 3: Migrasi**

`supabase/migrations/20261007000014_fungsi_rusak.sql`:
```sql
-- Tahap 3b: kunci bersama per outlet, penjaga "sebelum dihitung" (stok awal ATAU opname), rusak/terbuang.

-- Semua penulis yang memengaruhi hitungan stok satu outlet antre di kunci ini.
create function public._kunci_stok(p_outlet uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('stok:' || p_outlet::text, 0));
end
$$;

-- Waktu hitungan fisik terakhir yang disetujui (stok awal atau opname); null bila belum ada.
create function public._dihitung_terakhir(p_outlet uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(t) from (
    select dihitung_at as t from public.stok_awal where outlet_id = p_outlet and status = 'disetujui'
    union all
    select dihitung_at from public.opname where outlet_id = p_outlet and status = 'disetujui'
  ) x
$$;

-- Barang masuk (fungsi 0011 tidak diubah): kunci outlet & tolak bila sebelum hitungan terakhir.
create function public._jaga_barang_masuk() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._kunci_stok(new.outlet_id);
  if tg_op = 'INSERT' then
    if public._dihitung_terakhir(new.outlet_id) >= new.waktu then
      raise exception 'Barang masuk sebelum stok dihitung (stok awal/opname) sudah termasuk hitungan; koreksi lewat opname' using errcode = '22023';
    end if;
  elsif old.batal_at is null and new.batal_at is not null then
    if public._dihitung_terakhir(new.outlet_id) >= old.waktu then
      raise exception 'Barang masuk sebelum stok dihitung (stok awal/opname) tidak bisa dibatalkan; koreksi lewat opname' using errcode = '22023';
    end if;
  end if;
  return new;
end
$$;
create trigger barang_masuk_jaga before insert or update on public.barang_masuk
  for each row execute function public._jaga_barang_masuk();

-- Isian bahan dengan jumlah > 0 (rusak, transfer).
create function public._cek_isian_positif(p_item jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_jumlah integer;
  v_unik integer;
  v_kenal integer;
  v_sah boolean;
begin
  if jsonb_typeof(p_item) is distinct from 'array' or jsonb_array_length(p_item) = 0 then
    raise exception 'Isi minimal satu bahan' using errcode = '22023';
  end if;
  select count(*), count(distinct x.bahan_id), count(b.id),
         coalesce(bool_and(x.qty is not null and round(x.qty, 4) > 0 and x.qty <= 1000000), false)
  into v_jumlah, v_unik, v_kenal, v_sah
  from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric)
  left join public.bahan b on b.id = x.bahan_id and b.aktif;
  if v_kenal <> v_jumlah then
    raise exception 'Bahan tidak dikenal atau nonaktif' using errcode = '22023';
  end if;
  if v_unik <> v_jumlah then
    raise exception 'Bahan yang sama tertulis dua kali' using errcode = '22023';
  end if;
  if not v_sah then
    raise exception 'Jumlah stok tidak sah' using errcode = '22023';
  end if;
end
$$;

-- Stok awal (0011) + kunci bersama sebelum menghitung saldo.
create or replace function public.putuskan_stok_awal(p_id uuid, p_setuju boolean, p_item jsonb, p_catatan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.stok_awal;
begin
  perform public._wajib_admin_stok();
  select * into s from public.stok_awal where id = p_id for update;
  if not found then
    raise exception 'Ajuan stok awal tidak ditemukan' using errcode = '22023';
  end if;
  if s.status <> 'diajukan' then
    raise exception 'Ajuan stok awal sudah diputuskan' using errcode = '22023';
  end if;
  if p_setuju is null then
    raise exception 'Ajuan stok awal tidak lengkap' using errcode = '22023';
  end if;
  if not p_setuju then
    if p_catatan is null or length(trim(p_catatan)) < 3 or length(p_catatan) > 200 then
      raise exception 'Alasan penolakan wajib diisi (3–200 karakter)' using errcode = '22023';
    end if;
    update public.stok_awal set status = 'ditolak', diputus_at = now(), diputus_oleh = auth.uid(), catatan = trim(p_catatan)
    where id = p_id;
    return;
  end if;
  if p_catatan is not null and length(p_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._kunci_stok(s.outlet_id);
  if p_item is not null and jsonb_typeof(p_item) <> 'null' then
    perform public._cek_isian_stok(p_item);
    delete from public.stok_awal_item where stok_awal_id = p_id;
    insert into public.stok_awal_item (stok_awal_id, bahan_id, qty_hitung)
    select p_id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  end if;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, stok_awal_id)
  select s.outlet_id, i.bahan_id, d.selisih, 'awal', s.dihitung_at, auth.uid(), s.id
  from public.stok_awal_item i
  cross join lateral (
    select i.qty_hitung - coalesce(sum(g.qty), 0) as selisih
    from public.gerakan_stok g
    where g.outlet_id = s.outlet_id and g.bahan_id = i.bahan_id and g.waktu <= s.dihitung_at
  ) d
  where i.stok_awal_id = p_id and d.selisih <> 0;
  update public.stok_awal
  set status = 'disetujui', diputus_at = now(), diputus_oleh = auth.uid(), catatan = nullif(trim(coalesce(p_catatan, '')), '')
  where id = p_id;
end
$$;

create function public.catat_rusak(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid;
  v_alasan public.alasan_rusak;
  v_catatan text;
begin
  perform public._cek_akses_outlet(v_outlet);
  v_id := (p ->> 'id')::uuid;
  v_alasan := (p ->> 'alasan')::public.alasan_rusak;
  v_catatan := nullif(trim(coalesce(p ->> 'catatan', '')), '');
  if v_id is null or v_alasan is null then
    raise exception 'Data rusak tidak lengkap' using errcode = '22023';
  end if;
  perform public._kunci_stok(v_outlet);
  -- Simpan ditekan dua kali: id dibuat di perangkat.
  if exists (select 1 from public.rusak where id = v_id) then
    return v_id;
  end if;
  if v_alasan = 'lainnya' and (v_catatan is null or length(v_catatan) < 3) then
    raise exception 'Catatan wajib diisi untuk alasan lainnya (3–200 karakter)' using errcode = '22023';
  end if;
  if v_catatan is not null and length(v_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._cek_isian_positif(p -> 'item');
  insert into public.rusak (id, outlet_id, waktu, alasan, catatan, dicatat_oleh)
  values (v_id, v_outlet, now(), v_alasan, v_catatan, auth.uid());
  insert into public.rusak_item (rusak_id, bahan_id, qty)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric);
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, rusak_id)
  select v_outlet, i.bahan_id, -i.qty, 'rusak', now(), auth.uid(), v_id from public.rusak_item i where i.rusak_id = v_id;
  return v_id;
end
$$;

create function public.batal_rusak(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.rusak;
begin
  perform public._wajib_admin_stok();
  select * into v from public.rusak where id = p_id for update;
  if not found then
    raise exception 'Catatan rusak tidak ditemukan' using errcode = '22023';
  end if;
  if v.batal_at is not null then
    raise exception 'Catatan rusak sudah dibatalkan' using errcode = '22023';
  end if;
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  perform public._kunci_stok(v.outlet_id);
  if public._dihitung_terakhir(v.outlet_id) >= v.waktu then
    raise exception 'Catatan rusak sebelum stok dihitung tidak bisa dibatalkan; koreksi lewat opname' using errcode = '22023';
  end if;
  update public.rusak set batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan) where id = p_id;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, rusak_id)
  select g.outlet_id, g.bahan_id, -sum(g.qty), 'rusak_batal', now(), auth.uid(), p_id
  from public.gerakan_stok g where g.rusak_id = p_id and g.jenis = 'rusak'
  group by g.outlet_id, g.bahan_id;
end
$$;

revoke execute on function public._kunci_stok(uuid) from public, anon, authenticated;
revoke execute on function public._dihitung_terakhir(uuid) from public, anon, authenticated;
revoke execute on function public._jaga_barang_masuk() from public, anon, authenticated;
revoke execute on function public._cek_isian_positif(jsonb) from public, anon, authenticated;
revoke execute on function public.catat_rusak(jsonb) from public, anon;
revoke execute on function public.batal_rusak(uuid, text) from public, anon;
grant execute on function public.catat_rusak(jsonb) to authenticated;
grant execute on function public.batal_rusak(uuid, text) to authenticated;
```

- [ ] **Step 4: Jalankan, pastikan lulus (termasuk tes 3a stok awal & barang masuk)**

Run: `npx vitest run tests/db`
Expected: PASS semua. (Tes 3a "sebelum stok awal dihitung" tetap lulus: fungsi 0011 menolak lebih dulu dengan pesan lamanya.)

- [ ] **Step 5: Mutasi cepat**

Ganti sementara `>= new.waktu` di `_jaga_barang_masuk` dengan `>= new.waktu + interval '100 years'` → tes "sebelum opname disetujui" harus FAIL; kembalikan.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261007000014_fungsi_rusak.sql tests/db/stok-rusak.test.ts
git commit -m "feat(stok): rusak/terbuang (+batal), kunci bersama per outlet, penjaga barang masuk mencakup opname"
```

---

### Task 3: Transfer antar outlet

**Files:**
- Create: `supabase/migrations/20261007000015_fungsi_transfer.sql`
- Test: `tests/db/stok-transfer.test.ts`

**Interfaces:**
- Consumes: Task 1–2 (`_kunci_stok`, `_cek_isian_positif`).
- Produces (RPC): `kirim_transfer(p jsonb) returns uuid` — `p = { id, dari_outlet_id, ke_outlet_id, catatan?, item: [{bahan_id, qty}] }`; `ubah_transfer(p_id uuid, p_item jsonb, p_catatan text) returns void`; `batal_transfer(p_id uuid, p_alasan text) returns void`; `terima_transfer(p_id uuid, p_item jsonb) returns void`.

- [ ] **Step 1: Tes (gagal dulu)**

`tests/db/stok-transfer.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { isian, rpc } from './harness-3b';
import { idOutlet } from './harness-kasir';
import { stokBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;
let kasirKP: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
	kasirKP = await buatUser(db, { username: 'kasir.kertapati', role: 'kasir', outlet_kode: 'KP' });
});

async function kirim(item: [string, number][], extra: Record<string, unknown> = {}) {
	const p = { id: crypto.randomUUID(), dari_outlet_id: await idOutlet(db, 'BL'), ke_outlet_id: await idOutlet(db, 'TK'), item: await isian(db, item), ...extra };
	await rpc(db, kasirBL, 'public.kirim_transfer($1::jsonb)', [JSON.stringify(p)]);
	return p.id;
}
const terima = async (oleh: string, id: string, item: [string, number][]) =>
	rpc(db, oleh, 'public.terima_transfer($1, $2::jsonb)', [id, JSON.stringify(await isian(db, item))]);
const ubah = async (oleh: string, id: string, item: [string, number][]) =>
	rpc(db, oleh, 'public.ubah_transfer($1, $2::jsonb, $3)', [id, JSON.stringify(await isian(db, item)), null]);
const batal = (oleh: string, id: string, alasan = 'tidak jadi') => rpc(db, oleh, 'public.batal_transfer($1, $2)', [id, alasan]);
const status = async (id: string) => (await db.query<{ s: string }>('select status::text as s from public.transfer where id = $1', [id])).rows[0].s;

describe('kirim & terima', () => {
	it('jumlah cocok → BL berkurang, TK bertambah, sekali saja', async () => {
		const id = await kirim([
			['ori_dada', 6],
			['kemasan_kecil', 50]
		]);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(0);
		await terima(kasirTK, id, [
			['kemasan_kecil', 50],
			['ori_dada', 6]
		]);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(-6);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(6);
		expect(await stokBahan(db, 'TK', 'kemasan_kecil')).toBe(50);
		expect(await status(id)).toBe('diterima');
		await expect(terima(kasirTK, id, [['ori_dada', 6], ['kemasan_kecil', 50]])).rejects.toThrow(/sudah diterima/);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(6);
	});

	it.each([
		['jumlah beda', [['ori_dada', 5]]],
		['bahan kurang', [['ori_dada', 6]]],
		['bahan lebih', [['ori_dada', 6], ['kemasan_kecil', 50], ['box', 1]]]
	] as [string, [string, number][]][])('%s → ditolak dengan pesan, stok tidak berubah', async (_, diterima) => {
		const id = await kirim([
			['ori_dada', 6],
			['kemasan_kecil', 50]
		]);
		await expect(terima(kasirTK, id, diterima)).rejects.toThrow(/Ada perbedaan jumlah\. Silakan hubungi outlet pengirim \(Bukit Lama\)/);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(0);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(0);
		expect(await status(id)).toBe('dikirim');
	});

	it('yang boleh menerima hanya outlet tujuan (atau admin)', async () => {
		const id = await kirim([['ori_dada', 6]]);
		await expect(terima(kasirBL, id, [['ori_dada', 6]])).rejects.toThrow(/Transfer tidak ditemukan/);
		await expect(terima(kasirKP, id, [['ori_dada', 6]])).rejects.toThrow(/Transfer tidak ditemukan/);
		await terima(adminId, id, [['ori_dada', 6]]);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(6);
	});

	it('kirim: id sama sekali saja; ke outlet sendiri, kosong, dan atas nama outlet lain ditolak', async () => {
		const id = crypto.randomUUID();
		await kirim([['ori_dada', 1]], { id });
		await kirim([['ori_dada', 1]], { id });
		expect((await db.query<{ n: number }>('select count(*)::int as n from public.transfer')).rows[0].n).toBe(1);
		await expect(kirim([['ori_dada', 1]], { ke_outlet_id: await idOutlet(db, 'BL') })).rejects.toThrow(/harus berbeda/);
		await expect(kirim([])).rejects.toThrow(/minimal satu bahan/);
		await expect(kirim([['ori_dada', 1]], { dari_outlet_id: await idOutlet(db, 'KP') })).rejects.toThrow(/tidak berhak/);
	});
});

describe('ubah & batal oleh pengirim', () => {
	it('pengirim mengubah jumlah → penerima mengonfirmasi angka baru', async () => {
		const id = await kirim([['ori_dada', 6]]);
		await expect(terima(kasirTK, id, [['ori_dada', 3]])).rejects.toThrow(/perbedaan/);
		await ubah(kasirBL, id, [['ori_dada', 3]]);
		await terima(kasirTK, id, [['ori_dada', 3]]);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(3);
	});
	it('penerima tidak bisa mengubah/membatalkan; setelah diterima tidak bisa diubah/dibatalkan', async () => {
		const id = await kirim([['ori_dada', 6]]);
		await expect(ubah(kasirTK, id, [['ori_dada', 1]])).rejects.toThrow(/Transfer tidak ditemukan/);
		await expect(batal(kasirTK, id)).rejects.toThrow(/Transfer tidak ditemukan/);
		await terima(kasirTK, id, [['ori_dada', 6]]);
		await expect(ubah(kasirBL, id, [['ori_dada', 1]])).rejects.toThrow(/sudah diterima atau dibatalkan/);
		await expect(batal(kasirBL, id)).rejects.toThrow(/sudah diterima atau dibatalkan/);
	});
	it('dibatalkan (pengirim atau admin) → tidak bisa diterima, stok tidak berubah', async () => {
		const id = await kirim([['ori_dada', 6]]);
		await expect(batal(kasirBL, id, 'x')).rejects.toThrow(/Alasan/);
		await batal(adminId, id);
		await expect(terima(kasirTK, id, [['ori_dada', 6]])).rejects.toThrow(/sudah dibatalkan/);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(0);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/stok-transfer.test.ts`
Expected: FAIL — `function public.kirim_transfer(jsonb) does not exist`.

- [ ] **Step 3: Migrasi**

`supabase/migrations/20261007000015_fungsi_transfer.sql`:
```sql
-- Tahap 3b: transfer antar outlet. Tanpa persetujuan admin (keputusan owner). Stok pindah saat
-- penerima mengetik jumlah yang SAMA PERSIS dengan kiriman (hitung buta).

-- Pengirim (kasir outlet asal) atau admin; transfer orang lain disamarkan "tidak ditemukan".
create function public._transfer_milik_pengirim(p_id uuid) returns public.transfer
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer;
begin
  select * into t from public.transfer where id = p_id for update;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = t.dari_outlet_id, false)) then
    raise exception 'Transfer tidak ditemukan' using errcode = '22023';
  end if;
  if t.status <> 'dikirim' then
    raise exception 'Transfer sudah diterima atau dibatalkan' using errcode = '22023';
  end if;
  return t;
end
$$;

create function public.kirim_transfer(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_dari uuid := (p ->> 'dari_outlet_id')::uuid;
  v_ke uuid;
  v_id uuid;
  v_catatan text;
begin
  perform public._cek_akses_outlet(v_dari);
  v_id := (p ->> 'id')::uuid;
  v_ke := (p ->> 'ke_outlet_id')::uuid;
  v_catatan := nullif(trim(coalesce(p ->> 'catatan', '')), '');
  if v_id is null or v_ke is null then
    raise exception 'Data transfer tidak lengkap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  if exists (select 1 from public.transfer where id = v_id) then
    return v_id;
  end if;
  if v_ke = v_dari then
    raise exception 'Outlet tujuan harus berbeda dengan outlet pengirim' using errcode = '22023';
  end if;
  if not exists (select 1 from public.outlets where id = v_ke and aktif) then
    raise exception 'Outlet tujuan tidak ditemukan atau nonaktif' using errcode = '22023';
  end if;
  if v_catatan is not null and length(v_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._cek_isian_positif(p -> 'item');
  insert into public.transfer (id, dari_outlet_id, ke_outlet_id, catatan, dikirim_oleh)
  values (v_id, v_dari, v_ke, v_catatan, auth.uid());
  insert into public.transfer_item (transfer_id, bahan_id, qty)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric);
  return v_id;
end
$$;

create function public.ubah_transfer(p_id uuid, p_item jsonb, p_catatan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer := public._transfer_milik_pengirim(p_id);
begin
  if p_catatan is not null and length(trim(p_catatan)) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._cek_isian_positif(p_item);
  delete from public.transfer_item where transfer_id = t.id;
  insert into public.transfer_item (transfer_id, bahan_id, qty)
  select t.id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  update public.transfer set diubah_at = now(), catatan = coalesce(nullif(trim(coalesce(p_catatan, '')), ''), catatan) where id = t.id;
end
$$;

create function public.batal_transfer(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer := public._transfer_milik_pengirim(p_id);
begin
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  update public.transfer set status = 'dibatalkan', batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan)
  where id = t.id;
end
$$;

create function public.terima_transfer(p_id uuid, p_item jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer;
  v_nama text;
begin
  select * into t from public.transfer where id = p_id;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = t.ke_outlet_id, false)) then
    raise exception 'Transfer tidak ditemukan' using errcode = '22023';
  end if;
  -- Kunci kedua outlet dalam urutan tetap (tidak saling menunggu), baru kunci baris transfer.
  perform public._kunci_stok(least(t.dari_outlet_id, t.ke_outlet_id));
  perform public._kunci_stok(greatest(t.dari_outlet_id, t.ke_outlet_id));
  select * into t from public.transfer where id = p_id for update;
  if t.status = 'diterima' then
    raise exception 'Transfer sudah diterima' using errcode = '22023';
  end if;
  if t.status = 'dibatalkan' then
    raise exception 'Transfer sudah dibatalkan oleh pengirim' using errcode = '22023';
  end if;
  perform public._cek_isian_positif(p_item);
  if exists (
    select 1
    from (select bahan_id, qty from public.transfer_item where transfer_id = p_id) a
    full join (select x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric)) b on a.bahan_id = b.bahan_id
    where a.bahan_id is null or b.bahan_id is null or abs(a.qty - b.qty) > 0.0001
  ) then
    select nama into v_nama from public.outlets where id = t.dari_outlet_id;
    raise exception 'Ada perbedaan jumlah. Silakan hubungi outlet pengirim (%)', v_nama using errcode = '22023';
  end if;
  update public.transfer set status = 'diterima', diterima_at = now(), diterima_oleh = auth.uid() where id = p_id;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, transfer_id)
  select t.dari_outlet_id, i.bahan_id, -i.qty, 'transfer_keluar', now(), auth.uid(), p_id from public.transfer_item i where i.transfer_id = p_id
  union all
  select t.ke_outlet_id, i.bahan_id, i.qty, 'transfer_masuk', now(), auth.uid(), p_id from public.transfer_item i where i.transfer_id = p_id;
end
$$;

revoke execute on function public._transfer_milik_pengirim(uuid) from public, anon, authenticated;
revoke execute on function public.kirim_transfer(jsonb) from public, anon;
revoke execute on function public.ubah_transfer(uuid, jsonb, text) from public, anon;
revoke execute on function public.batal_transfer(uuid, text) from public, anon;
revoke execute on function public.terima_transfer(uuid, jsonb) from public, anon;
grant execute on function public.kirim_transfer(jsonb) to authenticated;
grant execute on function public.ubah_transfer(uuid, jsonb, text) to authenticated;
grant execute on function public.batal_transfer(uuid, text) to authenticated;
grant execute on function public.terima_transfer(uuid, jsonb) to authenticated;
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/db`
Expected: PASS semua.

- [ ] **Step 5: Mutasi cepat**

Ganti sementara `abs(a.qty - b.qty) > 0.0001` dengan `false` → tes "jumlah beda" harus FAIL; ganti `a.bahan_id is null or b.bahan_id is null or` dengan kosong → "bahan kurang/lebih" harus FAIL; kembalikan.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261007000015_fungsi_transfer.sql tests/db/stok-transfer.test.ts
git commit -m "feat(stok): transfer antar outlet — kirim, ubah/batal pengirim, terima dengan jumlah buta"
```

---

### Task 4: Opname mingguan

**Files:**
- Create: `supabase/migrations/20261007000016_fungsi_opname.sql`
- Test: `tests/db/stok-opname.test.ts`

**Interfaces:**
- Consumes: Task 1–3; `_cek_isian_stok` (0011).
- Produces (RPC): `ajukan_opname(p_outlet uuid, p_item jsonb) returns uuid`; `pratinjau_opname(p_id uuid) returns table (bahan_id uuid, qty_hitung numeric, qty_sistem numeric)` (admin); `putuskan_opname(p_id uuid, p_setuju boolean, p_item jsonb, p_catatan text) returns void` (admin).

- [ ] **Step 1: Tes (gagal dulu)**

`tests/db/stok-opname.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { isian, rpc, setujuiStokAwal } from './harness-3b';
import { idMenu, idOutlet, shiftLangsung } from './harness-kasir';
import { idBahan, stokBahan } from './harness-stok';

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

const stok = (kode: string) => stokBahan(db, 'BL', kode);
const ajukan = async (oleh: string, item: [string, number][]) =>
	rpc<string>(db, oleh, 'public.ajukan_opname($1, $2::jsonb)', [await idOutlet(db, 'BL'), JSON.stringify(await isian(db, item))]);
const putuskan = (oleh: string, id: string, setuju: boolean, item: unknown = null, catatan: string | null = null) =>
	rpc(db, oleh, 'public.putuskan_opname($1, $2, $3::jsonb, $4)', [id, setuju, item === null ? null : JSON.stringify(item), catatan]);
async function jual(qty: number) {
	const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), metode: 'qris', item: [{ menu_id: await idMenu(db, 'ori_dada'), qty }] };
	await rpc(db, kasirBL, 'public.catat_penjualan($1::jsonb)', [JSON.stringify(p)]);
	return p.id;
}

describe('ajukan opname', () => {
	it('butuh stok awal disetujui', async () => {
		await expect(ajukan(kasirBL, [['ori_dada', 1]])).rejects.toThrow(/butuh stok awal/);
	});
	it('satu ajuan menunggu; ditolak saat ada transfer menunggu (keluar maupun masuk)', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 3);
		const t = { id: crypto.randomUUID(), dari_outlet_id: await idOutlet(db, 'TK'), ke_outlet_id: await idOutlet(db, 'BL'), item: await isian(db, [['box', 1]]) };
		await rpc(db, kasirTK, 'public.kirim_transfer($1::jsonb)', [JSON.stringify(t)]);
		await expect(ajukan(kasirBL, [['ori_dada', 1]])).rejects.toThrow(/Selesaikan kiriman/);
		await rpc(db, kasirTK, 'public.batal_transfer($1, $2)', [t.id, 'tidak jadi']);
		await ajukan(kasirBL, [['ori_dada', 1]]);
		await expect(ajukan(kasirBL, [['ori_dada', 2]])).rejects.toThrow(/masih menunggu/);
	});
	it('kasir outlet lain ditolak', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 3);
		await expect(ajukan(kasirTK, [['ori_dada', 1]])).rejects.toThrow(/tidak berhak/);
	});
});

describe('putuskan opname', () => {
	it('stok = hitungan pada jam dihitung; jual sesudahnya tetap memotong; qty_sistem tersimpan', async () => {
		await shiftLangsung(db, 'BL', kasirBL);
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 20]], 3);
		const sebelum = await jual(2);
		await db.query(`update public.gerakan_stok set waktu = now() - interval '2 hours' where penjualan_id = $1`, [sebelum]);
		const id = await ajukan(kasirBL, [['ori_dada', 15]]);
		await db.query(`update public.opname set dihitung_at = now() - interval '1 hour' where id = $1`, [id]);
		await jual(1);
		const pratinjau = await rpc<unknown>(db, adminId, `(select json_agg(x) from public.pratinjau_opname($1) x)`, [id]);
		expect(pratinjau).toEqual([{ bahan_id: await idBahan(db, 'ori_dada'), qty_hitung: 15, qty_sistem: 18 }]);
		await putuskan(adminId, id, true);
		expect(await stok('ori_dada')).toBe(14);
		const s = (await db.query<{ q: string }>('select qty_sistem as q from public.opname_item where opname_id = $1', [id])).rows[0].q;
		expect(Number(s)).toBe(18);
	});
	it('admin membetulkan angka; tolak dengan alasan; diputuskan dua kali ditolak; kasir tidak boleh', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 20]], 3);
		const id = await ajukan(kasirBL, [['ori_dada', 15]]);
		await expect(putuskan(kasirBL, id, true)).rejects.toThrow(/Hanya admin/);
		await putuskan(adminId, id, true, await isian(db, [['ori_dada', 17]]));
		expect(await stok('ori_dada')).toBe(17);
		await expect(putuskan(adminId, id, true)).rejects.toThrow(/sudah diputuskan/);
		const id2 = await ajukan(kasirBL, [['ori_dada', 1]]);
		await expect(putuskan(adminId, id2, false, null, 'x')).rejects.toThrow(/Alasan penolakan/);
		await putuskan(adminId, id2, false, null, 'hitung ulang');
		expect(await stok('ori_dada')).toBe(17);
	});
	it('opname disetujui menjadi batas "sebelum dihitung" untuk barang masuk', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['box', 0]], 72);
		const id = await ajukan(kasirBL, [['box', 0]]);
		await db.query(`update public.opname set dihitung_at = now() - interval '1 hour' where id = $1`, [id]);
		await putuskan(adminId, id, true);
		const tanggal = (await db.query<{ t: string }>('select (public.tanggal_wib(now()) - 1)::text as t')).rows[0].t;
		const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), tanggal, item: [{ satuan_beli_id: (await db.query<{ id: string }>(`select id from public.satuan_beli where kode = 'pack_box'`)).rows[0].id, qty: 1, harga: 1 }] };
		await expect(rpc(db, adminId, 'public.catat_barang_masuk($1::jsonb)', [JSON.stringify(p)])).rejects.toThrow(/sebelum stok dihitung/);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/stok-opname.test.ts`
Expected: FAIL — `function public.ajukan_opname(uuid, jsonb) does not exist`.

- [ ] **Step 3: Migrasi**

`supabase/migrations/20261007000016_fungsi_opname.sql`:
```sql
-- Tahap 3b: opname mingguan (hitung buta). Rumus sama dengan stok awal: hitungan berlaku pada jam
-- dihitung; koreksi = hitungan − saldo s.d. jam itu; angka sistem disimpan untuk laporan susut.

create function public.ajukan_opname(p_outlet uuid, p_item jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public._cek_akses_outlet(p_outlet);
  perform public._kunci_stok(p_outlet);
  if not exists (select 1 from public.stok_awal where outlet_id = p_outlet and status = 'disetujui') then
    raise exception 'Opname butuh stok awal yang sudah disetujui' using errcode = '22023';
  end if;
  if exists (select 1 from public.opname where outlet_id = p_outlet and status = 'diajukan') then
    raise exception 'Opname outlet ini masih menunggu persetujuan admin' using errcode = '22023';
  end if;
  if exists (select 1 from public.transfer where status = 'dikirim' and (dari_outlet_id = p_outlet or ke_outlet_id = p_outlet)) then
    raise exception 'Selesaikan kiriman/penerimaan dulu sebelum opname' using errcode = '22023';
  end if;
  perform public._cek_isian_stok(p_item);
  insert into public.opname (outlet_id, diajukan_oleh) values (p_outlet, auth.uid()) returning id into v_id;
  insert into public.opname_item (opname_id, bahan_id, qty_hitung)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  return v_id;
end
$$;

create function public.pratinjau_opname(p_id uuid) returns table (bahan_id uuid, qty_hitung numeric, qty_sistem numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._wajib_admin_stok();
  return query
  select i.bahan_id, i.qty_hitung::numeric,
         coalesce((select sum(g.qty) from public.gerakan_stok g
                   where g.outlet_id = o.outlet_id and g.bahan_id = i.bahan_id and g.waktu <= o.dihitung_at), 0)::numeric
  from public.opname_item i
  join public.opname o on o.id = i.opname_id
  where i.opname_id = p_id;
end
$$;

create function public.putuskan_opname(p_id uuid, p_setuju boolean, p_item jsonb, p_catatan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.opname;
begin
  perform public._wajib_admin_stok();
  select * into s from public.opname where id = p_id for update;
  if not found then
    raise exception 'Ajuan opname tidak ditemukan' using errcode = '22023';
  end if;
  if s.status <> 'diajukan' then
    raise exception 'Ajuan opname sudah diputuskan' using errcode = '22023';
  end if;
  if p_setuju is null then
    raise exception 'Ajuan opname tidak lengkap' using errcode = '22023';
  end if;
  if not p_setuju then
    if p_catatan is null or length(trim(p_catatan)) < 3 or length(p_catatan) > 200 then
      raise exception 'Alasan penolakan wajib diisi (3–200 karakter)' using errcode = '22023';
    end if;
    update public.opname set status = 'ditolak', diputus_at = now(), diputus_oleh = auth.uid(), catatan = trim(p_catatan) where id = p_id;
    return;
  end if;
  if p_catatan is not null and length(p_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._kunci_stok(s.outlet_id);
  if p_item is not null and jsonb_typeof(p_item) <> 'null' then
    perform public._cek_isian_stok(p_item);
    delete from public.opname_item where opname_id = p_id;
    insert into public.opname_item (opname_id, bahan_id, qty_hitung)
    select p_id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  end if;
  update public.opname_item i
  set qty_sistem = coalesce((select sum(g.qty) from public.gerakan_stok g
                             where g.outlet_id = s.outlet_id and g.bahan_id = i.bahan_id and g.waktu <= s.dihitung_at), 0)
  where i.opname_id = p_id;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, opname_id)
  select s.outlet_id, i.bahan_id, i.qty_hitung - i.qty_sistem, 'opname', s.dihitung_at, auth.uid(), s.id
  from public.opname_item i
  where i.opname_id = p_id and i.qty_hitung <> i.qty_sistem;
  update public.opname
  set status = 'disetujui', diputus_at = now(), diputus_oleh = auth.uid(), catatan = nullif(trim(coalesce(p_catatan, '')), '')
  where id = p_id;
end
$$;

revoke execute on function public.ajukan_opname(uuid, jsonb) from public, anon;
revoke execute on function public.pratinjau_opname(uuid) from public, anon;
revoke execute on function public.putuskan_opname(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.ajukan_opname(uuid, jsonb) to authenticated;
grant execute on function public.pratinjau_opname(uuid) to authenticated;
grant execute on function public.putuskan_opname(uuid, boolean, jsonb, text) to authenticated;
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/db`
Expected: PASS semua. Catatan hitungan tes rumus: stok awal 20 (dihitung 3 jam lalu) → jual 2 (dimundurkan ke 2 jam lalu) → saldo s.d. dihitung opname (1 jam lalu) = 18 → hitungan 15 → koreksi −3 → jual 1 sesudahnya → 14.

- [ ] **Step 5: Mutasi cepat**

Ganti sementara `g.waktu <= s.dihitung_at` (di `update public.opname_item`) dengan `true` → tes rumus harus FAIL; hapus sementara cek transfer `dikirim` → tes "Selesaikan kiriman" harus FAIL; kembalikan.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261007000016_fungsi_opname.sql tests/db/stok-opname.test.ts
git commit -m "feat(stok): opname mingguan hitung buta, pratinjau selisih admin, angka sistem tersimpan"
```

---

### Task 5: Logika klien 3b (isian opsional, sisa harian, opname, pesan, API)

**Files:**
- Create: `src/lib/stok/sisa.ts`, `src/lib/stok/opname.ts`, `src/lib/stok/api-lanjut.ts`
- Modify: `src/lib/stok/types.ts`, `src/lib/stok/tampil.ts`, `src/lib/stok/isian.ts`, `src/lib/stok/pesan.ts`, `src/lib/stok/pesan.test.ts`
- Test: `src/lib/stok/sisa.test.ts`, `src/lib/stok/opname.test.ts`, `src/lib/stok/isian.test.ts`, `src/lib/stok/tampil.test.ts`

**Interfaces:**
- Consumes: Task 2–4 RPC; `Bahan`, `Menu`, `Resep`, `SatuanBeli`, `IsiSatuanBeli` (`#lib/master/types.ts`); `tanggalWib` (`#lib/kasir/waktu.ts`).
- Produces:
  - `types.ts`: `AlasanRusak`, `Rusak { id; outlet_id; waktu; alasan; catatan; batal_at; batal_alasan; item: ItemHitung[] }`, `Transfer { id; dari_outlet_id; ke_outlet_id; status: 'dikirim'|'diterima'|'dibatalkan'; catatan; dikirim_at; diterima_at; batal_alasan; item: ItemHitung[] }`, `Opname { id; outlet_id; status; dihitung_at; catatan }`, `BarisPratinjau { bahan_id; qty_hitung: number; qty_sistem: number }`.
  - `tampil.ts`: `LABEL_JENIS` (+5), `LABEL_ALASAN: Record<AlasanRusak, string>`, `ALASAN_RUSAK: AlasanRusak[]`.
  - `isian.ts`: `kumpulkanIsianOpsional(isian, teks): { item: ItemHitung[]; galat: Record<string,string> }` — kotak kosong dilewati, 0 dilewati.
  - `sisa.ts`: `interface BarisSisa { kunci; label; satuan: string; ke: { bahan_id: string; faktor: number }[] }`, `bentukSisa(bahan, menu, resep): BarisSisa[]`, `kumpulkanSisa(baris, teks: Record<string,string>): { item: ItemHitung[]; galat: Record<string,string> }`.
  - `opname.ts`: `isiPerBahan(satuan, isi): Map<string, number>`, `selisihBesar(hitung, sistem, isiPack?: number): boolean`, `perluOpname(sekarang: Date, adaStokAwal: boolean, opname: { status: string; dihitung_at: string }[]): boolean`, `awalMingguWib(sekarang: Date): Date`.
  - `api-lanjut.ts`: `catatRusak`, `batalRusak`, `muatRusak(outletId)`, `kirimTransfer`, `ubahTransfer`, `batalTransfer`, `terimaTransfer`, `muatTransfer(outletId?)`, `ajukanOpname`, `muatOpname(outletId?)`, `pratinjauOpname(id)`, `putuskanOpname`.

- [ ] **Step 1: Tes (gagal dulu)**

`src/lib/stok/sisa.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Bahan, Menu, Resep } from '#lib/master/types.ts';
import { bentukSisa, kumpulkanSisa } from './sisa';

const b = (id: string, nama: string, satuan: string, urutan: number): Bahan => ({ id, kode: id, nama, satuan, mode: 'otomatis', urutan, aktif: true });
const m = (id: string, nama: string, kategori: Menu['kategori'], varian: Menu['varian'] = null): Menu => ({ id, kode: id, nama, kategori, varian, urutan: 0, aktif: true });
const bahan = [b('dada', 'Dada Ori', 'potong', 10), b('sayap_hot', 'Sayap Hot', 'potong', 23), b('kulit', 'Kulit Mentah', 'porsi', 30), b('cup', 'Cup Kulit', 'pcs', 31), b('beras', 'Beras', 'kg', 40), b('kertas', 'Kertas Nasi', 'lembar', 41)];
const menu = [m('m_dada', 'Dada Ori', 'ayam', 'ori'), m('m_sayap', 'Sayap Hot', 'ayam', 'hot'), m('m_kulit', 'Kulit Krispy', 'kulit'), m('m_nasi', 'Nasi', 'nasi'), m('m_box', 'Box', 'box')];
const resep: Resep[] = [
	{ menu_id: 'm_dada', bahan_id: 'dada', qty: 1 },
	{ menu_id: 'm_sayap', bahan_id: 'sayap_hot', qty: 1 },
	{ menu_id: 'm_kulit', bahan_id: 'kulit', qty: 1 },
	{ menu_id: 'm_kulit', bahan_id: 'cup', qty: 1 },
	{ menu_id: 'm_nasi', bahan_id: 'beras', qty: 0.1 },
	{ menu_id: 'm_nasi', bahan_id: 'kertas', qty: 1 }
];

describe('bentukSisa', () => {
	it('ayam per potongan, kulit (tanpa cup), nasi → beras saja (tanpa kertas)', () => {
		expect(bentukSisa(bahan, menu, resep)).toEqual([
			{ kunci: 'dada', label: 'Dada Ori', satuan: 'potong', ke: [{ bahan_id: 'dada', faktor: 1 }] },
			{ kunci: 'sayap_hot', label: 'Sayap Hot', satuan: 'potong', ke: [{ bahan_id: 'sayap_hot', faktor: 1 }] },
			{ kunci: 'kulit', label: 'Kulit', satuan: 'porsi', ke: [{ bahan_id: 'kulit', faktor: 1 }] },
			{ kunci: 'nasi', label: 'Nasi', satuan: 'porsi', ke: [{ bahan_id: 'beras', faktor: 0.1 }] }
		]);
	});
});

describe('kumpulkanSisa', () => {
	const f = bentukSisa(bahan, menu, resep);
	it('kosong dilewati; nasi porsi → kg beras', () => {
		expect(kumpulkanSisa(f, { dada: '2', nasi: '3', kulit: '' })).toEqual({
			item: [
				{ bahan_id: 'dada', qty: 2 },
				{ bahan_id: 'beras', qty: 0.3 }
			],
			galat: {}
		});
	});
	it('bukan bilangan bulat → galat', () => {
		expect(kumpulkanSisa(f, { dada: '1,5' }).galat).toHaveProperty('dada');
	});
});
```

`src/lib/stok/opname.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import { awalMingguWib, isiPerBahan, perluOpname, selisihBesar } from './opname';

describe('selisihBesar', () => {
	it('≥ 1 pack-setara atau ≥ 10% dari angka sistem', () => {
		expect(selisihBesar(97, 100, 100)).toBe(false);
		expect(selisihBesar(0, 100, 100)).toBe(true);
		expect(selisihBesar(8, 10, 100)).toBe(true);
		expect(selisihBesar(9.5, 10)).toBe(false);
		expect(selisihBesar(1, 0)).toBe(true);
		expect(selisihBesar(0, 0)).toBe(false);
	});
});

describe('isiPerBahan', () => {
	it('isi terkecil dari satuan beli aktif yang memuat bahan', () => {
		const s = (id: string): SatuanBeli => ({ id, kode: id, nama: id, ambang: null, harga_tetap: true, urutan: 0, aktif: true });
		const isi: IsiSatuanBeli[] = [
			{ satuan_beli_id: 'ori', bahan_id: 'dada', qty: 3 },
			{ satuan_beli_id: 'pack', bahan_id: 'tepung', qty: 1.3 },
			{ satuan_beli_id: 'karung', bahan_id: 'tepung', qty: 19.5 }
		];
		expect(isiPerBahan([s('ori'), s('pack'), s('karung')], isi)).toEqual(new Map([['dada', 3], ['tepung', 1.3]]));
	});
});

describe('pengingat opname mingguan (WIB)', () => {
	// 2026-10-04 adalah hari Minggu.
	const minggu = new Date('2026-10-04T05:00:00Z');
	const senin = new Date('2026-10-05T05:00:00Z');
	it('awal minggu = Minggu 00:00 WIB', () => {
		expect(awalMingguWib(senin).toISOString()).toBe('2026-10-03T17:00:00.000Z');
	});
	it('tanpa stok awal → tidak perlu', () => {
		expect(perluOpname(minggu, false, [])).toBe(false);
	});
	it('belum ada opname minggu ini → perlu, termasuk Senin bila Minggu terlewat', () => {
		expect(perluOpname(minggu, true, [])).toBe(true);
		expect(perluOpname(senin, true, [{ status: 'disetujui', dihitung_at: '2026-09-27T10:00:00Z' }])).toBe(true);
	});
	it('sudah dikirim/disetujui minggu ini → tidak perlu; yang ditolak tidak dihitung', () => {
		expect(perluOpname(senin, true, [{ status: 'diajukan', dihitung_at: '2026-10-04T12:00:00Z' }])).toBe(false);
		expect(perluOpname(senin, true, [{ status: 'ditolak', dihitung_at: '2026-10-04T12:00:00Z' }])).toBe(true);
	});
});
```

Tambahkan ke akhir `src/lib/stok/isian.test.ts`:
```ts
import { kumpulkanIsianOpsional } from './isian';

describe('kumpulkanIsianOpsional (rusak, transfer)', () => {
	const f = bentukIsian(bahan, satuan, isi);
	it('kotak kosong & 0 dilewati; pack + lepas dikonversi', () => {
		expect(kumpulkanIsianOpsional(f, { dada: { a: '3', b: '' }, kemasan: { a: '1', b: '20' }, beras: { a: '0', b: '' } })).toEqual({
			item: [
				{ bahan_id: 'dada', qty: 3 },
				{ bahan_id: 'kemasan', qty: 120 }
			],
			galat: {}
		});
	});
	it('isian salah tetap diberi galat', () => {
		expect(kumpulkanIsianOpsional(f, { dada: { a: '1,5', b: '' } }).galat).toHaveProperty('dada');
	});
});
```

Tambahkan ke akhir `src/lib/stok/tampil.test.ts`:
```ts
import { ALASAN_RUSAK, LABEL_ALASAN } from './tampil';

describe('label 3b', () => {
	it('jenis gerakan & alasan rusak berlabel Indonesia', () => {
		expect(LABEL_JENIS.transfer_masuk).toBe('Transfer masuk');
		expect(LABEL_JENIS.opname).toBe('Opname');
		expect(ALASAN_RUSAK.map((a) => LABEL_ALASAN[a])).toEqual([
			'Sisa tidak laku (dibuang)',
			'Dimakan/dibawa karyawan',
			'Gosong',
			'Basi',
			'Jatuh/rusak',
			'Lainnya'
		]);
	});
});
```

Ganti isi `src/lib/stok/pesan.test.ts` menjadi:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pesanStok } from './pesan';

const MIGRASI = [
	'20261006000011_fungsi_stok.sql',
	'20261007000014_fungsi_rusak.sql',
	'20261007000015_fungsi_transfer.sql',
	'20261007000016_fungsi_opname.sql'
];
const resmi = MIGRASI.flatMap((f) => {
	const sql = readFileSync(join(import.meta.dirname, '../../../supabase/migrations', f), 'utf8');
	return [...sql.matchAll(/raise exception '([^'%]+)' using errcode = '(\d+)'/g)].map((m) => ({ f, message: m[1], code: m[2] }));
});

describe('pesanStok', () => {
	it('semua pesan resmi fungsi stok diteruskan apa adanya, berakhiran titik', () => {
		expect(resmi.length).toBeGreaterThanOrEqual(45);
		for (const e of resmi) expect(pesanStok(e), `${e.f}: ${e.message}`).toBe(`${e.message}.`);
	});
	it('pesan transfer berisi nama outlet (format %) juga diteruskan', () => {
		const m = 'Ada perbedaan jumlah. Silakan hubungi outlet pengirim (Bukit Lama)';
		expect(pesanStok({ code: '22023', message: m })).toBe(`${m}.`);
	});
	it('pesan akses outlet dari 0009 juga diteruskan', () => {
		expect(pesanStok({ code: '42501', message: 'Anda tidak berhak mengakses outlet ini' })).toBe('Anda tidak berhak mengakses outlet ini.');
	});
	it('pesan Postgres mentah tidak diteruskan', () => {
		expect(pesanStok({ code: '22023', message: 'cannot extract elements from a scalar' })).toBe('Isian tidak sah.');
		expect(pesanStok(null)).toBeNull();
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/stok`
Expected: FAIL — `./sisa`, `./opname` belum ada; `kumpulkanIsianOpsional`, `LABEL_ALASAN` belum diekspor; pesan 0014–0016 belum di allowlist.

- [ ] **Step 3: Implementasi**

Di `src/lib/stok/types.ts`: ubah `JenisGerakan` dan tambahkan tipe baru:
```ts
export type JenisGerakan =
	| 'awal'
	| 'masuk'
	| 'masuk_batal'
	| 'jual'
	| 'jual_batal'
	| 'rusak'
	| 'rusak_batal'
	| 'transfer_keluar'
	| 'transfer_masuk'
	| 'opname';
```
dan tambahkan di akhir file:
```ts
export type AlasanRusak = 'sisa_tidak_laku' | 'dimakan_karyawan' | 'gosong' | 'basi' | 'jatuh_rusak' | 'lainnya';

export interface Rusak {
	id: string;
	outlet_id: string;
	waktu: string;
	alasan: AlasanRusak;
	catatan: string | null;
	batal_at: string | null;
	batal_alasan: string | null;
	item: ItemHitung[];
}

export interface Transfer {
	id: string;
	dari_outlet_id: string;
	ke_outlet_id: string;
	status: 'dikirim' | 'diterima' | 'dibatalkan';
	catatan: string | null;
	dikirim_at: string;
	diterima_at: string | null;
	batal_alasan: string | null;
	/** Kosong bagi outlet tujuan selama status 'dikirim' (hitung buta). */
	item: ItemHitung[];
}

export interface Opname {
	id: string;
	outlet_id: string;
	status: 'diajukan' | 'disetujui' | 'ditolak';
	dihitung_at: string;
	catatan: string | null;
}

export interface BarisPratinjau {
	bahan_id: string;
	qty_hitung: number;
	qty_sistem: number;
}
```

Di `src/lib/stok/tampil.ts`: ubah impor tipe menjadi `import type { AlasanRusak, BarisStok, JenisGerakan, StatusStok } from './types.ts';`, ganti `LABEL_JENIS` dan tambahkan label alasan:
```ts
export const LABEL_JENIS: Record<JenisGerakan, string> = {
	awal: 'Stok awal',
	masuk: 'Barang masuk',
	masuk_batal: 'Batal barang masuk',
	jual: 'Terjual',
	jual_batal: 'Batal jual',
	rusak: 'Rusak/terbuang',
	rusak_batal: 'Batal rusak',
	transfer_keluar: 'Transfer keluar',
	transfer_masuk: 'Transfer masuk',
	opname: 'Opname'
};

export const ALASAN_RUSAK: AlasanRusak[] = ['sisa_tidak_laku', 'dimakan_karyawan', 'gosong', 'basi', 'jatuh_rusak', 'lainnya'];
export const LABEL_ALASAN: Record<AlasanRusak, string> = {
	sisa_tidak_laku: 'Sisa tidak laku (dibuang)',
	dimakan_karyawan: 'Dimakan/dibawa karyawan',
	gosong: 'Gosong',
	basi: 'Basi',
	jatuh_rusak: 'Jatuh/rusak',
	lainnya: 'Lainnya'
};
```

Tambahkan ke akhir `src/lib/stok/isian.ts`:
```ts
/** Rusak & transfer: hanya kotak yang diisi (> 0) yang dikirim; kosong/0 = tidak ada. */
export function kumpulkanIsianOpsional(isian: Isian[], teks: TeksIsian): { item: ItemHitung[]; galat: Record<string, string> } {
	const terisi = isian.filter((f) => {
		const t = teks[f.bahan_id];
		return t && (t.a.trim() !== '' || t.b.trim() !== '');
	});
	const h = kumpulkanIsian(terisi, teks);
	return { item: h.item.filter((i) => i.qty > 0), galat: h.galat };
}
```

`src/lib/stok/sisa.ts`:
```ts
// Langkah "sisa tidak terjual" di Tutup toko: isian per menu yang dimasak (ayam, kulit, nasi) → bahan.
import type { Bahan, Menu, Resep } from '#lib/master/types.ts';
import type { ItemHitung } from './types.ts';

export interface BarisSisa {
	kunci: string;
	label: string;
	satuan: string;
	/** Bahan yang terbuang per 1 satuan isian (nasi 1 porsi → beras 0,1 kg). */
	ke: { bahan_id: string; faktor: number }[];
}

/**
 * Ayam: satu baris per potongan (bahan resep menu ayam). Kulit: bahan porsi kulit saja (cup tidak terbuang).
 * Nasi: beras saja (kertas belum dipakai). Urut menurut urutan bahan.
 */
export function bentukSisa(bahan: Bahan[], menu: Menu[], resep: Resep[]): BarisSisa[] {
	const perId = new Map(bahan.filter((b) => b.aktif).map((b) => [b.id, b]));
	const resepMenu = (m: Menu) => resep.filter((r) => r.menu_id === m.id && perId.has(r.bahan_id));
	const hasil: (BarisSisa & { urutan: number })[] = [];
	for (const m of menu.filter((x) => x.aktif)) {
		if (m.kategori === 'ayam') {
			for (const r of resepMenu(m)) {
				const b = perId.get(r.bahan_id)!;
				if (b.satuan !== 'potong' || hasil.some((h) => h.kunci === b.id)) continue;
				hasil.push({ kunci: b.id, label: b.nama, satuan: 'potong', ke: [{ bahan_id: b.id, faktor: r.qty }], urutan: b.urutan });
			}
		} else if (m.kategori === 'kulit') {
			const r = resepMenu(m).find((x) => perId.get(x.bahan_id)!.satuan === 'porsi');
			if (r) hasil.push({ kunci: 'kulit', label: 'Kulit', satuan: 'porsi', ke: [{ bahan_id: r.bahan_id, faktor: r.qty }], urutan: perId.get(r.bahan_id)!.urutan });
		} else if (m.kategori === 'nasi') {
			const r = resepMenu(m).find((x) => perId.get(x.bahan_id)!.satuan === 'kg');
			if (r) hasil.push({ kunci: 'nasi', label: 'Nasi', satuan: 'porsi', ke: [{ bahan_id: r.bahan_id, faktor: r.qty }], urutan: perId.get(r.bahan_id)!.urutan });
		}
	}
	return hasil.sort((a, b) => a.urutan - b.urutan).map(({ urutan: _, ...x }) => x);
}

/** Bilangan bulat ≥ 0 per baris; kosong/0 dilewati; bahan sama digabung. */
export function kumpulkanSisa(baris: BarisSisa[], teks: Record<string, string>): { item: ItemHitung[]; galat: Record<string, string> } {
	const jumlah = new Map<string, number>();
	const galat: Record<string, string> = {};
	for (const r of baris) {
		const t = (teks[r.kunci] ?? '').trim();
		if (t === '') continue;
		if (!/^\d+$/.test(t) || Number(t) > 10000) {
			galat[r.kunci] = 'Isi angka bulat.';
			continue;
		}
		const n = Number(t);
		for (const k of r.ke) jumlah.set(k.bahan_id, Math.round(((jumlah.get(k.bahan_id) ?? 0) + n * k.faktor) * 10000) / 10000);
	}
	return { item: [...jumlah].filter(([, q]) => q > 0).map(([bahan_id, qty]) => ({ bahan_id, qty })), galat };
}
```

`src/lib/stok/opname.ts`:
```ts
// Opname: penanda selisih besar & pengingat mingguan (WIB, minggu dimulai hari Minggu).
import type { IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';

const WIB_MS = 7 * 3_600_000;

/** Isi terkecil dari satuan beli aktif yang memuat bahan (1 pack-setara per bahan). */
export function isiPerBahan(satuan: SatuanBeli[], isi: IsiSatuanBeli[]): Map<string, number> {
	const aktif = new Set(satuan.filter((s) => s.aktif).map((s) => s.id));
	const hasil = new Map<string, number>();
	for (const x of isi) {
		if (!aktif.has(x.satuan_beli_id)) continue;
		const lama = hasil.get(x.bahan_id);
		if (lama === undefined || x.qty < lama) hasil.set(x.bahan_id, x.qty);
	}
	return hasil;
}

/** Selisih besar: ≥ 1 pack-setara (bila diketahui) atau ≥ 10% dari angka sistem. */
export function selisihBesar(hitung: number, sistem: number, isiPack?: number): boolean {
	const d = Math.abs(hitung - sistem);
	if (d < 1e-9) return false;
	if (isiPack !== undefined && d >= isiPack - 1e-9) return true;
	return sistem === 0 || d >= Math.abs(sistem) * 0.1 - 1e-9;
}

/** Minggu 00:00 WIB terakhir (≤ sekarang). */
export function awalMingguWib(sekarang: Date): Date {
	const wib = new Date(sekarang.getTime() + WIB_MS);
	const tengahMalam = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - WIB_MS;
	return new Date(tengahMalam - wib.getUTCDay() * 86_400_000);
}

/** Pengingat tampil sejak Minggu sampai ada opname (diajukan/disetujui) yang dihitung minggu ini. */
export function perluOpname(sekarang: Date, adaStokAwal: boolean, opname: { status: string; dihitung_at: string }[]): boolean {
	if (!adaStokAwal) return false;
	const awal = awalMingguWib(sekarang).getTime();
	return !opname.some((o) => o.status !== 'ditolak' && new Date(o.dihitung_at).getTime() >= awal);
}
```

Di `src/lib/stok/pesan.ts`: ganti `Barang masuk sebelum stok awal dihitung` dengan `Barang masuk sebelum stok`, dan tambahkan sebelum `|Anda tidak berhak mengakses outlet ini)`:
```
|Data rusak tidak lengkap|Catatan wajib diisi untuk alasan lainnya|Catatan rusak|Data transfer tidak lengkap|Outlet tujuan|Transfer tidak ditemukan|Transfer sudah|Ada perbedaan jumlah\. Silakan hubungi outlet pengirim|Opname butuh stok awal|Opname outlet ini masih menunggu|Selesaikan kiriman\/penerimaan dulu|Ajuan opname
```

`src/lib/stok/api-lanjut.ts`:
```ts
// Rusak, transfer, opname (Tahap 3b) via Supabase. Penulisan lewat RPC; pembacaan mengikuti RLS.
import { supabase } from '#lib/supabase/client.ts';
import { pesanStok } from './pesan.ts';
import type { AlasanRusak, BarisPratinjau, ItemHitung, Opname, Rusak, Transfer } from './types.ts';

type Galat = Parameters<typeof pesanStok>[0];
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanStok(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}
const angka = (v: unknown): number => Number(v);
const item = (xs: { bahan_id: string; qty: unknown }[] | null): ItemHitung[] => (xs ?? []).map((i) => ({ bahan_id: i.bahan_id, qty: angka(i.qty) }));

export async function catatRusak(p: { id: string; outlet_id: string; alasan: AlasanRusak; catatan?: string; item: ItemHitung[] }): Promise<void> {
	periksa(await supabase.rpc('catat_rusak', { p }));
}
export async function batalRusak(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('batal_rusak', { p_id: id, p_alasan: alasan }));
}
export async function muatRusak(outletId: string): Promise<Rusak[]> {
	const rows = periksa(
		await supabase
			.from('rusak')
			.select('id, outlet_id, waktu, alasan, catatan, batal_at, batal_alasan, item:rusak_item(bahan_id, qty)')
			.eq('outlet_id', outletId)
			.order('waktu', { ascending: false })
			.limit(100)
	) as (Omit<Rusak, 'item'> & { item: { bahan_id: string; qty: unknown }[] })[];
	return rows.map((r) => ({ ...r, item: item(r.item) }));
}

export async function kirimTransfer(p: { id: string; dari_outlet_id: string; ke_outlet_id: string; catatan?: string; item: ItemHitung[] }): Promise<void> {
	periksa(await supabase.rpc('kirim_transfer', { p }));
}
export async function ubahTransfer(id: string, it: ItemHitung[], catatan: string | null): Promise<void> {
	periksa(await supabase.rpc('ubah_transfer', { p_id: id, p_item: it, p_catatan: catatan }));
}
export async function batalTransfer(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('batal_transfer', { p_id: id, p_alasan: alasan }));
}
export async function terimaTransfer(id: string, it: ItemHitung[]): Promise<void> {
	periksa(await supabase.rpc('terima_transfer', { p_id: id, p_item: it }));
}
/** Semua transfer yang terlihat (admin: semua; kasir: dari/ke outletnya). */
export async function muatTransfer(outletId?: string): Promise<Transfer[]> {
	let q = supabase
		.from('transfer')
		.select('id, dari_outlet_id, ke_outlet_id, status, catatan, dikirim_at, diterima_at, batal_alasan, item:transfer_item(bahan_id, qty)')
		.order('dikirim_at', { ascending: false })
		.limit(100);
	if (outletId) q = q.or(`dari_outlet_id.eq.${outletId},ke_outlet_id.eq.${outletId}`);
	const rows = periksa(await q) as (Omit<Transfer, 'item'> & { item: { bahan_id: string; qty: unknown }[] })[];
	return rows.map((t) => ({ ...t, item: item(t.item) }));
}

export async function ajukanOpname(outletId: string, it: ItemHitung[]): Promise<string> {
	return periksa(await supabase.rpc('ajukan_opname', { p_outlet: outletId, p_item: it })) as string;
}
export async function muatOpname(outletId?: string): Promise<Opname[]> {
	let q = supabase.from('opname').select('id, outlet_id, status, dihitung_at, catatan').order('dihitung_at', { ascending: false }).limit(20);
	if (outletId) q = q.eq('outlet_id', outletId);
	return periksa(await q) as Opname[];
}
export async function pratinjauOpname(id: string): Promise<BarisPratinjau[]> {
	const rows = periksa(await supabase.rpc('pratinjau_opname', { p_id: id })) as { bahan_id: string; qty_hitung: unknown; qty_sistem: unknown }[];
	return rows.map((r) => ({ bahan_id: r.bahan_id, qty_hitung: angka(r.qty_hitung), qty_sistem: angka(r.qty_sistem) }));
}
export async function putuskanOpname(id: string, setuju: boolean, it: ItemHitung[] | null, catatan: string | null): Promise<void> {
	periksa(await supabase.rpc('putuskan_opname', { p_id: id, p_setuju: setuju, p_item: it, p_catatan: catatan }));
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src/lib/stok && npm run check`
Expected: PASS; 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stok
git commit -m "feat(stok): logika klien 3b — isian opsional, sisa harian, selisih & pengingat opname, API"
```

---

### Task 6: Kasir — catat rusak, kirim & terima transfer, tombol di tab Stok

**Files:**
- Modify: `src/lib/components/stok/FormStokAwal.svelte`, `src/routes/kasir/stok/+page.svelte`
- Create: `src/routes/kasir/stok/rusak/+page.svelte`, `src/routes/kasir/stok/kirim/+page.svelte`, `src/routes/kasir/stok/terima/+page.svelte`
- Test: `src/lib/components/stok/stok-ui.test.ts`

**Interfaces:**
- Consumes: Task 5 (`kumpulkanIsianOpsional`, `LABEL_ALASAN`, `ALASAN_RUSAK`, `catatRusak`, `kirimTransfer`, `ubahTransfer`, `batalTransfer`, `terimaTransfer`, `muatTransfer`, `muatOpname`), `bentukIsian`, `muatDataStok`, `muatOutlets`, `pos`.
- Produces: `FormStokAwal` prop baru `opsional?: boolean` (default false) — bila true memakai `kumpulkanIsianOpsional` dan menolak kiriman kosong ("Isi minimal satu bahan.").

- [ ] **Step 1: Tes render (gagal dulu)**

Tambahkan ke akhir `src/lib/components/stok/stok-ui.test.ts`:
```ts
describe('FormStokAwal opsional (rusak/transfer)', () => {
	it('mode opsional memberi petunjuk "kosongkan yang tidak ada"', () => {
		const { body } = render(FormStokAwal, {
			props: {
				isian: [{ bahan_id: 'd', label: 'Dada Ori', jenis: 'satu' as const, satuan: 'potong', desimal: false }],
				labelKirim: 'Catat rusak',
				opsional: true,
				onkirim: async () => {}
			}
		});
		expect(body).toContain('Isi hanya bahan yang');
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/components/stok`
Expected: FAIL — petunjuk belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/components/stok/FormStokAwal.svelte`:
1. Ubah impor isian: `import { kumpulkanIsian, kumpulkanIsianOpsional, teksDari, type Isian, type TeksIsian } from '#lib/stok/isian.ts';`
2. Ganti blok props menjadi:
```ts
	let {
		isian,
		awal = new Map(),
		labelKirim,
		opsional = false,
		onkirim
	}: {
		isian: Isian[];
		awal?: ReadonlyMap<string, number>;
		labelKirim: string;
		/** Rusak & transfer: hanya kotak yang diisi yang dikirim. Stok awal & opname: semua wajib. */
		opsional?: boolean;
		onkirim: (item: ItemHitung[]) => Promise<void>;
	} = $props();
```
3. Di `kirim()`, ganti `const h = kumpulkanIsian(isian, teks);` dengan:
```ts
		const h = opsional ? kumpulkanIsianOpsional(isian, teks) : kumpulkanIsian(isian, teks);
```
dan setelah blok `if (Object.keys(h.galat).length) { ... }` tambahkan:
```ts
		if (opsional && h.item.length === 0) {
			pesan = 'Isi minimal satu bahan.';
			return;
		}
```
4. Tepat setelah `<form ...>` pembuka tambahkan:
```svelte
	{#if opsional}<p class="text-sm text-muted">Isi hanya bahan yang ada; kosongkan sisanya.</p>{/if}
```

`src/routes/kasir/stok/rusak/+page.svelte`:
```svelte
<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { catatRusak } from '#lib/stok/api-lanjut.ts';
	import { muatDataStok, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import { ALASAN_RUSAK, LABEL_ALASAN } from '#lib/stok/tampil.ts';
	import type { AlasanRusak, ItemHitung } from '#lib/stok/types.ts';

	let data = $state<DataStok | null>(null);
	let pesan = $state('');
	let alasan = $state<AlasanRusak>('gosong');
	let catatan = $state('');
	let tercatat = $state('');
	let ulang = $state(0);
	// id per formulir: simpan dua kali tidak menggandakan.
	let id = $state(crypto.randomUUID());

	$effect(() => {
		void ulang;
		muatDataStok()
			.then((d) => (data = d))
			.catch((e) => (pesan = (e as Error).message));
	});

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);

	async function kirim(item: ItemHitung[]) {
		await catatRusak({ id, outlet_id: pos.outlet!.id, alasan, ...(catatan.trim() ? { catatan: catatan.trim() } : {}), item });
		tercatat = `Tercatat: ${item.length} bahan (${LABEL_ALASAN[alasan]}).`;
		id = crypto.randomUUID();
		catatan = '';
	}
</script>

<svelte:head><title>Catat Rusak · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Catat rusak/terbuang</h1>

{#if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ((pesan = ''), ulang++)}>Coba lagi</button>
{:else if !data}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else}
	<div class="mt-4 grid gap-3">
		<div class="grid gap-1.5">
			<label for="alasan-rusak" class="text-sm font-semibold">Alasan</label>
			<select id="alasan-rusak" bind:value={alasan} class="min-h-12 rounded-xl border border-line-strong bg-surface px-3">
				{#each ALASAN_RUSAK as a (a)}<option value={a}>{LABEL_ALASAN[a]}</option>{/each}
			</select>
		</div>
		<div class="grid gap-1.5">
			<label for="catatan-rusak" class="text-sm font-semibold">Catatan {alasan === 'lainnya' ? '(wajib)' : '(opsional)'}</label>
			<input id="catatan-rusak" bind:value={catatan} maxlength="200" class="min-h-12 rounded-xl border border-line-strong bg-surface px-3" />
		</div>
		{#if tercatat}<p class="rounded-xl bg-surface-2 p-3 font-semibold text-ok" role="status">{tercatat}</p>{/if}
		{#key id}<FormStokAwal {isian} opsional labelKirim="Catat rusak" onkirim={kirim} />{/key}
	</div>
{/if}
```

`src/routes/kasir/stok/kirim/+page.svelte`:
```svelte
<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { batalTransfer, kirimTransfer, muatTransfer, ubahTransfer } from '#lib/stok/api-lanjut.ts';
	import { muatDataStok, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import { angkaStok } from '#lib/stok/tampil.ts';
	import type { ItemHitung, Transfer } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let data = $state<DataStok | null>(null);
	let outlets = $state<Outlet[]>([]);
	let keluar = $state<Transfer[]>([]);
	let pesan = $state('');
	let tujuan = $state('');
	let catatan = $state('');
	let diubah = $state<Transfer | null>(null);
	let id = $state(crypto.randomUUID());
	let tercatat = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		const o = pos.outlet!;
		pesan = '';
		try {
			const [d, os, t] = await Promise.all([muatDataStok(), muatOutlets(), muatTransfer(o.id)]);
			data = d;
			outlets = os;
			keluar = t.filter((x) => x.dari_outlet_id === o.id && x.status === 'dikirim');
		} catch (e) {
			pesan = (e as Error).message;
		}
	}
	$effect(() => {
		if (pos.outlet) void muat();
	});

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const lain = $derived(outlets.filter((o) => o.aktif && o.id !== pos.outlet?.id));
	const namaOutlet = (oid: string) => outlets.find((o) => o.id === oid)?.nama ?? '';
	const namaBahan = (bid: string) => data?.bahan.find((b) => b.id === bid)?.nama ?? '';

	async function kirim(item: ItemHitung[]) {
		if (diubah) {
			await ubahTransfer(diubah.id, item, catatan.trim() || null);
			tercatat = `Kiriman ke ${namaOutlet(diubah.ke_outlet_id)} diubah.`;
			diubah = null;
		} else {
			if (!tujuan) throw new Error('Pilih outlet tujuan.');
			await kirimTransfer({ id, dari_outlet_id: pos.outlet!.id, ke_outlet_id: tujuan, ...(catatan.trim() ? { catatan: catatan.trim() } : {}), item });
			tercatat = `Terkirim ke ${namaOutlet(tujuan)}. Menunggu outlet tujuan mengonfirmasi.`;
			id = crypto.randomUUID();
		}
		catatan = '';
		await muat();
	}

	async function batal(t: Transfer) {
		pesanBaris[t.id] = '';
		try {
			await batalTransfer(t.id, alasan[t.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[t.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Kirim ke Outlet Lain · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Kirim ke outlet lain</h1>

{#if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else if !data}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else}
	{#if keluar.length}
		<section class="mt-4 grid gap-2" aria-label="Kiriman menunggu">
			<h2 class="font-display text-xl">Menunggu diterima</h2>
			{#each keluar as t (t.id)}
				<div class="rounded-2xl border border-line bg-surface p-3">
					<p class="font-semibold">Ke {namaOutlet(t.ke_outlet_id)} · {formatWaktuWib(t.dikirim_at)}</p>
					<p class="text-sm text-muted">{t.item.map((i) => `${angkaStok(i.qty)} ${namaBahan(i.bahan_id)}`).join(', ')}</p>
					<div class="mt-2 flex flex-wrap items-center gap-2">
						<button type="button" class="min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ((diubah = t), (catatan = t.catatan ?? ''))}>Ubah</button>
						<label class="sr-only" for="batal-{t.id}">Alasan batal</label>
						<input id="batal-{t.id}" bind:value={alasan[t.id]} maxlength="200" placeholder="Alasan batal" class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3" />
						<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(t)} />
					</div>
					{#if pesanBaris[t.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[t.id]}</p>{/if}
				</div>
			{/each}
		</section>
	{/if}

	<section class="mt-6 grid gap-3" aria-label="Formulir kiriman">
		<h2 class="font-display text-xl">{diubah ? `Ubah kiriman ke ${namaOutlet(diubah.ke_outlet_id)}` : 'Kiriman baru'}</h2>
		{#if !diubah}
			<div class="grid gap-1.5">
				<label for="tujuan" class="text-sm font-semibold">Outlet tujuan</label>
				<select id="tujuan" bind:value={tujuan} class="min-h-12 rounded-xl border border-line-strong bg-surface px-3">
					<option value="">Pilih outlet…</option>
					{#each lain as o (o.id)}<option value={o.id}>{o.nama}</option>{/each}
				</select>
			</div>
		{/if}
		<div class="grid gap-1.5">
			<label for="catatan-kirim" class="text-sm font-semibold">Catatan (opsional)</label>
			<input id="catatan-kirim" bind:value={catatan} maxlength="200" class="min-h-12 rounded-xl border border-line-strong bg-surface px-3" />
		</div>
		{#if tercatat}<p class="rounded-xl bg-surface-2 p-3 font-semibold text-ok" role="status">{tercatat}</p>{/if}
		{#key diubah?.id ?? id}
			<FormStokAwal
				{isian}
				opsional
				awal={new Map((diubah?.item ?? []).map((i) => [i.bahan_id, i.qty]))}
				labelKirim={diubah ? 'Simpan perubahan' : 'Kirim'}
				onkirim={kirim}
			/>
		{/key}
		{#if diubah}<button type="button" class="min-h-12 rounded-xl px-4 text-sm" onclick={() => (diubah = null)}>Batal mengubah</button>{/if}
	</section>
{/if}
```

`src/routes/kasir/stok/terima/+page.svelte`:
```svelte
<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatTransfer, terimaTransfer } from '#lib/stok/api-lanjut.ts';
	import { muatDataStok, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import type { ItemHitung, Transfer } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let data = $state<DataStok | null>(null);
	let outlets = $state<Outlet[]>([]);
	let masuk = $state<Transfer[]>([]);
	let dipilih = $state<Transfer | null>(null);
	let pesan = $state('');
	let tercatat = $state('');

	async function muat() {
		const o = pos.outlet!;
		pesan = '';
		try {
			const [d, os, t] = await Promise.all([muatDataStok(), muatOutlets(), muatTransfer(o.id)]);
			data = d;
			outlets = os;
			masuk = t.filter((x) => x.ke_outlet_id === o.id && x.status === 'dikirim');
		} catch (e) {
			pesan = (e as Error).message;
		}
	}
	$effect(() => {
		if (pos.outlet) void muat();
	});

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const namaOutlet = (oid: string) => outlets.find((o) => o.id === oid)?.nama ?? '';

	async function terima(item: ItemHitung[]) {
		const t = dipilih!;
		await terimaTransfer(t.id, item);
		tercatat = `Kiriman dari ${namaOutlet(t.dari_outlet_id)} diterima. Stok sudah bertambah.`;
		dipilih = null;
		await muat();
	}
</script>

<svelte:head><title>Terima Kiriman · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Terima kiriman</h1>

{#if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else if !data}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else}
	{#if tercatat}<p class="mt-4 rounded-xl bg-surface-2 p-3 font-semibold text-ok" role="status">{tercatat}</p>{/if}
	{#if dipilih}
		<section class="mt-4 grid gap-3" aria-label="Konfirmasi kiriman">
			<h2 class="font-display text-xl">Dari {namaOutlet(dipilih.dari_outlet_id)} · {formatWaktuWib(dipilih.dikirim_at)}</h2>
			{#if dipilih.catatan}<p class="text-sm text-muted">Catatan pengirim: {dipilih.catatan}</p>{/if}
			<p class="text-sm">Hitung barang yang benar-benar datang, lalu isi jumlahnya. Angka harus sama dengan yang dikirim.</p>
			{#key dipilih.id}<FormStokAwal {isian} opsional labelKirim="Konfirmasi terima" onkirim={terima} />{/key}
			<button type="button" class="min-h-12 rounded-xl px-4 text-sm" onclick={() => (dipilih = null)}>Kembali ke daftar</button>
		</section>
	{:else if masuk.length === 0}
		<p class="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-muted">Tidak ada kiriman yang menunggu.</p>
	{:else}
		<ul class="mt-4 grid gap-2">
			{#each masuk as t (t.id)}
				<li>
					<button type="button" class="flex min-h-14 w-full flex-col items-start rounded-2xl border border-line bg-surface px-4 py-2 text-left hover:border-brand" onclick={() => ((dipilih = t), (tercatat = ''))}>
						<span class="font-semibold">Dari {namaOutlet(t.dari_outlet_id)}</span>
						<span class="text-sm text-muted">Dikirim {formatWaktuWib(t.dikirim_at)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
```

Di `src/routes/kasir/stok/+page.svelte`:
1. Tambahkan impor:
```ts
	import { muatOpname, muatTransfer } from '#lib/stok/api-lanjut.ts';
	import { perluOpname } from '#lib/stok/opname.ts';
	import type { Opname, Transfer } from '#lib/stok/types.ts';
```
2. Tambahkan state: `let transfer = $state<Transfer[]>([]);` dan `let opname = $state<Opname[]>([]);`
3. Ganti `Promise.all([muatDataStok(), muatStok(o.id), muatStokAwal(o.id)])` dengan `Promise.all([muatDataStok(), muatStok(o.id), muatStokAwal(o.id), muatTransfer(o.id), muatOpname(o.id)])` dan callback `.then(([d, s, a, t, op]) => { ...; transfer = t; opname = op; status = 'siap'; })` (tetap memeriksa `batal`).
4. Tambahkan derived:
```ts
	const masukMenunggu = $derived(transfer.filter((t) => t.ke_outlet_id === pos.outlet?.id && t.status === 'dikirim').length);
	const keluarMenunggu = $derived(transfer.filter((t) => t.dari_outlet_id === pos.outlet?.id && t.status === 'dikirim').length);
	const ingatOpname = $derived(perluOpname(new Date(), disetujui, opname));
	const opnameMenunggu = $derived(opname.some((o) => o.status === 'diajukan'));
```
5. Sisipkan tepat sebelum `<div class="mt-4"><DaftarStok ...` (di cabang siap):
```svelte
	{#if disetujui}
		{#if ingatOpname}
			<p class="mt-4 rounded-xl border-2 border-warn bg-surface p-3 font-semibold" role="status">
				Waktunya opname mingguan. <a class="text-brand underline" href={href('/kasir/stok/opname')}>Mulai opname</a>
			</p>
		{:else if opnameMenunggu}
			<p class="mt-4 rounded-xl bg-surface-2 p-3 text-sm" role="status">Opname minggu ini sudah dikirim, menunggu persetujuan admin.</p>
		{/if}
		<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
			<a href={href('/kasir/stok/rusak')} class="flex min-h-14 items-center justify-center rounded-2xl bg-surface-2 px-3 text-center font-semibold">Catat rusak</a>
			<a href={href('/kasir/stok/kirim')} class="flex min-h-14 items-center justify-center rounded-2xl bg-surface-2 px-3 text-center font-semibold"
				>Kirim ke outlet lain{keluarMenunggu ? ` (${keluarMenunggu})` : ''}</a
			>
			<a href={href('/kasir/stok/terima')} class="flex min-h-14 items-center justify-center rounded-2xl px-3 text-center font-semibold {masukMenunggu ? 'bg-brand text-on-brand' : 'bg-surface-2'}"
				>Terima kiriman{masukMenunggu ? ` (${masukMenunggu})` : ''}</a
			>
			<a href={href('/kasir/stok/opname')} class="flex min-h-14 items-center justify-center rounded-2xl bg-surface-2 px-3 text-center font-semibold">Opname</a>
		</div>
	{/if}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src && npm run check && npm run build`
Expected: PASS; 0 errors; build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/stok/FormStokAwal.svelte src/lib/components/stok/stok-ui.test.ts src/routes/kasir/stok
git commit -m "feat(stok): kasir mencatat rusak, mengirim & menerima transfer (jumlah buta)"
```

---

### Task 7: Kasir — opname & langkah sisa di Tutup toko

**Files:**
- Create: `src/routes/kasir/stok/opname/+page.svelte`, `src/lib/components/stok/LangkahSisa.svelte`
- Modify: `src/routes/kasir/tutup/+page.svelte`
- Test: `src/lib/components/stok/stok-ui.test.ts`

**Interfaces:**
- Consumes: Task 5 (`bentukSisa`, `kumpulkanSisa`, `ALASAN_RUSAK`, `LABEL_ALASAN`, `catatRusak`, `ajukanOpname`, `muatOpname`, `muatTransfer`), `muatMenu`, `muatResep`, `muatBahan` (`#lib/master/api.ts`).
- Produces: `LangkahSisa` props `{ outletId: string; shiftId: string; onselesai: () => void }`; kunci sessionStorage `dk-sisa-<shiftId>` = `'1'` setelah dijawab.

- [ ] **Step 1: Tes render (gagal dulu)**

Tambahkan ke akhir `src/lib/components/stok/stok-ui.test.ts`:
```ts
import LangkahSisa from './LangkahSisa.svelte';

describe('LangkahSisa', () => {
	it('menampilkan pertanyaan wajib dengan pilihan Tidak ada / Ada', () => {
		const { body } = render(LangkahSisa, { props: { outletId: 'o', shiftId: 's', onselesai: () => {} } });
		expect(body).toContain('Ada sisa yang tidak terjual?');
		expect(body).toContain('Tidak ada sisa');
		expect(body).toContain('Ada sisa');
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/components/stok`
Expected: FAIL — `LangkahSisa.svelte` belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/components/stok/LangkahSisa.svelte`:
```svelte
<script module lang="ts">
	export const kunciSisa = (shiftId: string) => `dk-sisa-${shiftId}`;
	export function sudahDijawab(shiftId: string): boolean {
		try {
			return sessionStorage.getItem(kunciSisa(shiftId)) === '1';
		} catch {
			return false;
		}
	}
</script>

<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import { muatBahan, muatMenu, muatResep } from '#lib/master/api.ts';
	import { catatRusak } from '#lib/stok/api-lanjut.ts';
	import { bentukSisa, kumpulkanSisa, type BarisSisa } from '#lib/stok/sisa.ts';
	import { ALASAN_RUSAK, LABEL_ALASAN } from '#lib/stok/tampil.ts';
	import type { AlasanRusak } from '#lib/stok/types.ts';

	let { outletId, shiftId, onselesai }: { outletId: string; shiftId: string; onselesai: () => void } = $props();

	let tahap = $state<'tanya' | 'isi'>('tanya');
	let baris = $state<BarisSisa[]>([]);
	let teks = $state<Record<string, string>>({});
	let galat = $state<Record<string, string>>({});
	let alasan = $state<AlasanRusak>('sisa_tidak_laku');
	let pesan = $state('');
	let tercatat = $state('');
	let menyimpan = $state(false);
	let id = $state(crypto.randomUUID());
	const kotak =
		'tabular min-h-12 w-20 rounded-xl border border-line-strong bg-surface px-3 text-right text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none';

	function selesai() {
		try {
			sessionStorage.setItem(kunciSisa(shiftId), '1');
		} catch {
			// abaikan: pertanyaan akan muncul lagi bila halaman dibuka ulang
		}
		onselesai();
	}

	async function ada() {
		tahap = 'isi';
		pesan = '';
		try {
			const [bahan, menu, resep] = await Promise.all([muatBahan(), muatMenu(), muatResep()]);
			baris = bentukSisa(bahan, menu, resep);
		} catch (e) {
			pesan = (e as Error).message;
		}
	}

	async function simpan(e: SubmitEvent) {
		e.preventDefault();
		pesan = '';
		const h = kumpulkanSisa(baris, teks);
		galat = h.galat;
		if (Object.keys(h.galat).length) return;
		if (h.item.length === 0) {
			pesan = 'Isi jumlah sisa, atau kembali dan pilih "Tidak ada sisa".';
			return;
		}
		menyimpan = true;
		try {
			await catatRusak({ id, outlet_id: outletId, alasan, item: h.item });
			tercatat = `Tercatat sebagai "${LABEL_ALASAN[alasan]}". Ada sisa dengan alasan lain? Isi lagi, atau lanjut.`;
			id = crypto.randomUUID();
			teks = {};
		} catch (err) {
			pesan = (err as Error).message;
		} finally {
			menyimpan = false;
		}
	}
</script>

<section class="grid max-w-md gap-3 rounded-2xl border-2 border-brand bg-surface p-4" aria-label="Sisa tidak terjual">
	<h2 class="font-display text-xl">Ada sisa yang tidak terjual?</h2>
	{#if tahap === 'tanya'}
		<p class="text-sm text-muted">Ayam/kulit/nasi yang dibuang atau dibawa karyawan. Yang disimpan untuk dijual besok tidak perlu dicatat.</p>
		<div class="flex flex-wrap gap-2">
			<Button onclick={selesai}>Tidak ada sisa</Button>
			<Button variant="secondary" onclick={ada}>Ada sisa</Button>
		</div>
	{:else}
		<form class="grid gap-3" onsubmit={simpan} novalidate>
			<div class="grid gap-1.5">
				<label for="alasan-sisa" class="text-sm font-semibold">Alasan</label>
				<select id="alasan-sisa" bind:value={alasan} class="min-h-12 rounded-xl border border-line-strong bg-surface px-3">
					{#each ALASAN_RUSAK.filter((a) => a !== 'lainnya') as a (a)}<option value={a}>{LABEL_ALASAN[a]}</option>{/each}
				</select>
			</div>
			<ul class="grid gap-2">
				{#each baris as r (r.kunci)}
					<li class="flex flex-wrap items-center gap-2">
						<label for="sisa-{r.kunci}" class="min-w-0 flex-1 font-semibold">{r.label}</label>
						<input id="sisa-{r.kunci}" bind:value={teks[r.kunci]} inputmode="numeric" placeholder="0" class={kotak} />
						<span class="w-14 text-sm text-muted">{r.satuan}</span>
						{#if galat[r.kunci]}<p class="w-full text-sm text-danger" role="alert">{galat[r.kunci]}</p>{/if}
					</li>
				{/each}
			</ul>
			{#if tercatat}<p class="text-sm font-semibold text-ok" role="status">{tercatat}</p>{/if}
			{#if pesan}<p class="text-sm font-semibold text-danger" role="alert">{pesan}</p>{/if}
			<Button type="submit" loading={menyimpan}>Catat sisa</Button>
			<Button variant="secondary" onclick={selesai} disabled={!tercatat}>Lanjut tutup toko</Button>
			{#if !tercatat}<button type="button" class="min-h-12 text-sm text-muted underline" onclick={() => (tahap = 'tanya')}>Kembali</button>{/if}
		</form>
	{/if}
</section>
```

`src/routes/kasir/tutup/+page.svelte`:
1. Tambahkan impor: `import LangkahSisa, { sudahDijawab } from '#lib/components/stok/LangkahSisa.svelte';`
2. Tambahkan state di bawah `let pesan = $state('');`:
```ts
	// Langkah wajib "sisa tidak terjual" sekali per shift (diingat di tablet ini).
	let sisaSelesai = $state(false);
	$effect(() => {
		const s = pos.shift;
		if (s) sisaSelesai = sudahDijawab(s.id);
	});
```
3. Ganti baris `{:else if r}` menjadi:
```svelte
{:else if !sisaSelesai}
	<div class="mt-4"><LangkahSisa outletId={pos.shift.outlet_id} shiftId={pos.shift.id} onselesai={() => (sisaSelesai = true)} /></div>
{:else if r}
```

`src/routes/kasir/stok/opname/+page.svelte`:
```svelte
<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { ajukanOpname, muatOpname, muatTransfer } from '#lib/stok/api-lanjut.ts';
	import { muatDataStok, muatStokAwal, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import type { ItemHitung } from '#lib/stok/types.ts';

	let data = $state<DataStok | null>(null);
	let halangan = $state('');
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let terkirim = $state(false);
	let ulang = $state(0);

	$effect(() => {
		const o = pos.outlet;
		void ulang;
		if (!o) return;
		let batal = false;
		status = 'memuat';
		terkirim = false;
		Promise.all([muatDataStok(), muatStokAwal(o.id), muatOpname(o.id), muatTransfer(o.id)])
			.then(([d, a, op, t]) => {
				if (batal) return;
				data = d;
				halangan = !a.some((x) => x.status === 'disetujui')
					? 'Stok awal outlet ini belum disetujui admin.'
					: op.some((x) => x.status === 'diajukan')
						? 'Opname sebelumnya masih menunggu persetujuan admin.'
						: t.some((x) => x.status === 'dikirim')
							? 'Masih ada kiriman/penerimaan yang belum selesai. Selesaikan dulu sebelum opname.'
							: '';
				status = 'siap';
			})
			.catch((e) => {
				if (batal) return;
				pesan = (e as Error).message;
				status = 'gagal';
			});
		return () => {
			batal = true;
		};
	});

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);

	async function kirim(item: ItemHitung[]) {
		await ajukanOpname(pos.outlet!.id, item);
		terkirim = true;
	}
</script>

<svelte:head><title>Opname · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Opname mingguan {pos.outlet?.nama}</h1>
<p class="mt-1 max-w-prose text-sm text-muted">Hitung semua bahan yang ada sekarang dan isi apa adanya. Isi 0 bila habis. Penjualan sesudah dikirim tetap memotong stok.</p>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ulang++}>Coba lagi</button>
{:else if terkirim}
	<p class="mt-4 rounded-xl bg-surface-2 p-4 font-semibold text-ok" role="status">Opname terkirim. Menunggu persetujuan admin.</p>
	<a href={href('/kasir/stok')} class="mt-3 inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Kembali ke Stok</a>
{:else if halangan}
	<p class="mt-4 rounded-xl border-2 border-warn bg-surface p-4" role="status">{halangan}</p>
{:else}
	<div class="mt-4"><FormStokAwal {isian} labelKirim="Kirim opname ke admin" onkirim={kirim} /></div>
{/if}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src && npm run check && npm run build`
Expected: PASS; 0 errors; build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/stok/LangkahSisa.svelte src/lib/components/stok/stok-ui.test.ts src/routes/kasir/tutup/+page.svelte src/routes/kasir/stok/opname
git commit -m "feat(stok): opname kasir (hitung buta) & langkah wajib sisa tidak terjual di Tutup toko"
```

---

### Task 8: Admin — rusak, transfer, opname, ringkasan

**Files:**
- Create: `src/routes/admin/stok/rusak/+page.svelte`, `src/routes/admin/stok/transfer/+page.svelte`, `src/routes/admin/stok/opname/+page.svelte`
- Modify: `src/routes/admin/stok/+page.svelte`, `src/lib/components/stok/RingkasanStok.svelte`

**Interfaces:**
- Consumes: Task 5 (`muatRusak`, `batalRusak`, `muatTransfer`, `batalTransfer`, `muatOpname`, `pratinjauOpname`, `putuskanOpname`, `isiPerBahan`, `selisihBesar`, `LABEL_ALASAN`, `angkaStok`), `FormStokAwal`, `Konfirmasi`.

- [ ] **Step 1: Halaman admin rusak**

`src/routes/admin/stok/rusak/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatBahan, muatOutlets } from '#lib/master/api.ts';
	import type { Bahan } from '#lib/master/types.ts';
	import { href } from '#lib/nav.ts';
	import { batalRusak, muatRusak } from '#lib/stok/api-lanjut.ts';
	import { LABEL_ALASAN, angkaStok } from '#lib/stok/tampil.ts';
	import type { Rusak } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let bahan = $state<Bahan[]>([]);
	let outletId = $state<string | null>(null);
	let daftar = $state<Rusak[]>([]);
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muatDaftar() {
		const id = outletId;
		if (!id) return;
		pesan = '';
		try {
			const d = await muatRusak(id);
			if (id === outletId) daftar = d;
		} catch (e) {
			if (id === outletId) pesan = (e as Error).message;
		}
	}
	onMount(async () => {
		try {
			[outlets, bahan] = await Promise.all([muatOutlets(), muatBahan()]);
			outletId = outlets.find((o) => o.aktif)?.id ?? null;
			await muatDaftar();
		} catch (e) {
			pesan = (e as Error).message;
		}
	});
	const nama = (id: string) => bahan.find((b) => b.id === id)?.nama ?? '';

	async function batal(r: Rusak) {
		pesanBaris[r.id] = '';
		try {
			await batalRusak(r.id, alasan[r.id] ?? '');
			await muatDaftar();
		} catch (e) {
			pesanBaris[r.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Rusak · Admin · Kasir D'Kriuk</title></svelte:head>

<a href={href('/admin/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-3xl">Rusak/terbuang</h1>
<div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Pilih outlet">
	{#each outlets.filter((o) => o.aktif) as o (o.id)}
		<button type="button" aria-pressed={outletId === o.id} onclick={() => ((outletId = o.id), (daftar = []), void muatDaftar())}
			class="min-h-12 rounded-xl border-2 border-line px-4 font-semibold aria-pressed:border-brand aria-pressed:text-brand">{o.nama}</button>
	{/each}
</div>
{#if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-2 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muatDaftar}>Coba lagi</button>
{:else if daftar.length === 0}
	<p class="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada catatan rusak.</p>
{:else}
	<ul class="mt-4 grid gap-2">
		{#each daftar as r (r.id)}
			<li class="rounded-2xl border border-line bg-surface p-3 {r.batal_at ? 'opacity-60' : ''}">
				<p class="flex flex-wrap justify-between gap-2"><span class="font-semibold">{LABEL_ALASAN[r.alasan]}</span><span class="text-sm text-muted">{formatWaktuWib(r.waktu)}</span></p>
				<p class="text-sm">{r.item.map((i) => `${angkaStok(i.qty)} ${nama(i.bahan_id)}`).join(', ')}</p>
				{#if r.catatan}<p class="text-sm text-muted">{r.catatan}</p>{/if}
				{#if r.batal_at}
					<p class="text-sm font-semibold text-danger">Dibatalkan: {r.batal_alasan}</p>
				{:else}
					<div class="mt-2 flex flex-wrap items-center gap-2">
						<label class="sr-only" for="alasan-{r.id}">Alasan pembatalan</label>
						<input id="alasan-{r.id}" bind:value={alasan[r.id]} maxlength="200" placeholder="Alasan batal" class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3" />
						<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(r)} />
					</div>
					{#if pesanBaris[r.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[r.id]}</p>{/if}
				{/if}
			</li>
		{/each}
	</ul>
{/if}
```

- [ ] **Step 2: Halaman admin transfer**

`src/routes/admin/stok/transfer/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatBahan, muatOutlets } from '#lib/master/api.ts';
	import type { Bahan } from '#lib/master/types.ts';
	import { href } from '#lib/nav.ts';
	import { batalTransfer, muatTransfer } from '#lib/stok/api-lanjut.ts';
	import { angkaStok } from '#lib/stok/tampil.ts';
	import type { Transfer } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let bahan = $state<Bahan[]>([]);
	let daftar = $state<Transfer[]>([]);
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		pesan = '';
		try {
			[outlets, bahan, daftar] = await Promise.all([muatOutlets(), muatBahan(), muatTransfer()]);
		} catch (e) {
			pesan = (e as Error).message;
		}
	}
	onMount(muat);
	const outlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '';
	const nama = (id: string) => bahan.find((b) => b.id === id)?.nama ?? '';
	const LABEL = { dikirim: 'Menunggu diterima', diterima: 'Diterima', dibatalkan: 'Dibatalkan' } as const;

	async function batal(t: Transfer) {
		pesanBaris[t.id] = '';
		try {
			await batalTransfer(t.id, alasan[t.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[t.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Transfer · Admin · Kasir D'Kriuk</title></svelte:head>

<a href={href('/admin/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-3xl">Transfer antar outlet</h1>
{#if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-2 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else if daftar.length === 0}
	<p class="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada transfer.</p>
{:else}
	<ul class="mt-4 grid gap-2">
		{#each daftar as t (t.id)}
			<li class="rounded-2xl border bg-surface p-3 {t.status === 'dikirim' ? 'border-warn' : 'border-line'}">
				<p class="flex flex-wrap justify-between gap-2">
					<span class="font-semibold">{outlet(t.dari_outlet_id)} → {outlet(t.ke_outlet_id)}</span>
					<span class="text-sm text-muted">{LABEL[t.status]} · {formatWaktuWib(t.dikirim_at)}</span>
				</p>
				<p class="text-sm">{t.item.map((i) => `${angkaStok(i.qty)} ${nama(i.bahan_id)}`).join(', ')}</p>
				{#if t.catatan}<p class="text-sm text-muted">{t.catatan}</p>{/if}
				{#if t.status === 'dibatalkan'}<p class="text-sm text-danger">Dibatalkan: {t.batal_alasan}</p>{/if}
				{#if t.status === 'dikirim'}
					<div class="mt-2 flex flex-wrap items-center gap-2">
						<label class="sr-only" for="alasan-{t.id}">Alasan pembatalan</label>
						<input id="alasan-{t.id}" bind:value={alasan[t.id]} maxlength="200" placeholder="Alasan batal" class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3" />
						<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(t)} />
					</div>
					{#if pesanBaris[t.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[t.id]}</p>{/if}
				{/if}
			</li>
		{/each}
	</ul>
{/if}
```

- [ ] **Step 3: Halaman admin opname**

`src/routes/admin/stok/opname/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatOpname, pratinjauOpname, putuskanOpname } from '#lib/stok/api-lanjut.ts';
	import { muatDataStok, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import { isiPerBahan, selisihBesar } from '#lib/stok/opname.ts';
	import { angkaStok } from '#lib/stok/tampil.ts';
	import type { BarisPratinjau, ItemHitung, Opname } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let data = $state<DataStok | null>(null);
	let ajuan = $state<Opname[]>([]);
	let pratinjau = $state<Record<string, BarisPratinjau[]>>({});
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		status = 'memuat';
		try {
			[outlets, data, ajuan] = await Promise.all([muatOutlets(), muatDataStok(), muatOpname()]);
			const menunggu = ajuan.filter((a) => a.status === 'diajukan');
			const p = await Promise.all(menunggu.map((a) => pratinjauOpname(a.id)));
			pratinjau = Object.fromEntries(menunggu.map((a, i) => [a.id, p[i]]));
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const isiPack = $derived(data ? isiPerBahan(data.satuan, data.isi) : new Map<string, number>());
	const nama = (id: string) => data?.bahan.find((b) => b.id === id)?.nama ?? '';
	const satuanBahan = (id: string) => data?.bahan.find((b) => b.id === id)?.satuan ?? '';
	const outlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '';
	const menunggu = $derived(ajuan.filter((a) => a.status === 'diajukan'));
	const selesai = $derived(ajuan.filter((a) => a.status !== 'diajukan'));

	async function setujui(a: Opname, item: ItemHitung[]) {
		await putuskanOpname(a.id, true, item, null);
		await muat();
	}
	async function tolak(a: Opname) {
		pesanBaris[a.id] = '';
		try {
			await putuskanOpname(a.id, false, null, alasan[a.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[a.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Opname · Admin · Kasir D'Kriuk</title></svelte:head>

<a href={href('/admin/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-3xl">Opname</h1>
<p class="mt-1 max-w-prose text-muted">Hitungan kasir dibandingkan angka sistem pada jam dihitung. Selisih besar ditandai. Betulkan bila perlu, lalu setujui.</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#if menunggu.length === 0}<p class="mt-6 rounded-xl bg-surface-2 p-4 text-sm text-muted">Tidak ada opname yang menunggu.</p>{/if}
	{#each menunggu as a (a.id)}
		<section class="mt-6 grid gap-3 rounded-2xl border-2 border-brand p-4" aria-label="Opname {outlet(a.outlet_id)}">
			<h2 class="font-display text-xl">{outlet(a.outlet_id)} — dihitung {formatWaktuWib(a.dihitung_at)}</h2>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead><tr class="text-left text-muted"><th class="py-1">Bahan</th><th class="text-right">Hitungan</th><th class="text-right">Sistem</th><th class="text-right">Selisih</th></tr></thead>
					<tbody>
						{#each pratinjau[a.id] ?? [] as p (p.bahan_id)}
							{@const besar = selisihBesar(p.qty_hitung, p.qty_sistem, isiPack.get(p.bahan_id))}
							<tr class="border-t border-line {besar ? 'font-semibold text-danger' : ''}">
								<td class="py-1">{nama(p.bahan_id)}</td>
								<td class="tabular text-right">{angkaStok(p.qty_hitung)} {satuanBahan(p.bahan_id)}</td>
								<td class="tabular text-right">{angkaStok(p.qty_sistem)}</td>
								<td class="tabular text-right">{p.qty_hitung - p.qty_sistem > 0 ? '+' : ''}{angkaStok(p.qty_hitung - p.qty_sistem)}{besar ? ' ⚠' : ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<details>
				<summary class="min-h-12 cursor-pointer py-3 font-semibold">Betulkan angka lalu setujui</summary>
				{#key a.id}
					<FormStokAwal {isian} awal={new Map((pratinjau[a.id] ?? []).map((p) => [p.bahan_id, p.qty_hitung]))} labelKirim="Setujui opname" onkirim={(item) => setujui(a, item)} />
				{/key}
			</details>
			<div class="flex flex-wrap items-center gap-2 border-t border-line pt-3">
				<label class="sr-only" for="tolak-{a.id}">Alasan penolakan</label>
				<input id="tolak-{a.id}" bind:value={alasan[a.id]} maxlength="200" placeholder="Alasan tolak, mis. hitung ulang ayam" class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3" />
				<Konfirmasi label="Tolak" konfirmasiLabel="Ya, tolak" variant="ghost" onkonfirmasi={() => tolak(a)} />
			</div>
			{#if pesanBaris[a.id]}<p class="text-sm text-danger" role="alert">{pesanBaris[a.id]}</p>{/if}
		</section>
	{/each}
	{#if selesai.length}
		<h2 class="mt-8 font-display text-xl">Riwayat</h2>
		<ul class="mt-2 grid gap-2">
			{#each selesai as a (a.id)}
				<li class="rounded-xl bg-surface-2 px-3 py-2 text-sm">
					<span class="font-semibold">{outlet(a.outlet_id)}</span> — {a.status === 'disetujui' ? 'Disetujui' : 'Ditolak'}, dihitung {formatWaktuWib(a.dihitung_at)}{a.catatan ? ` — ${a.catatan}` : ''}
				</li>
			{/each}
		</ul>
	{/if}
{/if}
```

- [ ] **Step 4: Tautan di halaman Stok admin & ringkasan beranda**

Di `src/routes/admin/stok/+page.svelte`, tepat setelah tautan `Stok awal</a\n\t\t>` tambahkan:
```svelte
		<a href={href('/admin/stok/opname')} class="inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Opname</a>
		<a href={href('/admin/stok/rusak')} class="inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Rusak</a>
		<a href={href('/admin/stok/transfer')} class="inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Transfer</a>
```

Di `src/lib/components/stok/RingkasanStok.svelte`:
1. Tambahkan impor `import { muatOpname, muatTransfer } from '#lib/stok/api-lanjut.ts';`
2. Ganti `const [outlets, data, stok, awal] = await Promise.all([muatOutlets(), muatDataStok(), muatStok(), muatStokAwal()]);` dengan:
```ts
			const [outlets, data, stok, awal, opname, transfer] = await Promise.all([
				muatOutlets(),
				muatDataStok(),
				muatStok(),
				muatStokAwal(),
				muatOpname(),
				muatTransfer()
			]);
```
3. Ganti baris `const teks = r.minus + r.menipis === 0 ? 'Semua aman' : \`${r.menipis} menipis, ${r.minus} minus\`;` dengan:
```ts
					const tambahan = [
						opname.some((x) => x.outlet_id === o.id && x.status === 'diajukan') ? 'opname menunggu persetujuan' : '',
						transfer.some((x) => x.ke_outlet_id === o.id && x.status === 'dikirim') ? 'kiriman belum diterima' : ''
					].filter(Boolean);
					const teks = [r.minus + r.menipis === 0 ? 'Semua aman' : `${r.menipis} menipis, ${r.minus} minus`, ...tambahan].join(' · ');
```

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx vitest run src && npm run check && npm run build`
Expected: PASS; 0 errors; build sukses.

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin/stok src/lib/components/stok/RingkasanStok.svelte
git commit -m "feat(stok): admin meninjau rusak, transfer, opname (selisih ditandai) & ringkasan beranda"
```

---

### Task 9: Pasang ke server, E2E 3b, dokumentasi, daftar uji owner

**Files:**
- Create: `scripts/uji-stok-3b.ts`, `docs/uji/tahap-3b-stok-owner.md`
- Modify: `scripts/uji-stok.ts`, `scripts/uji-kasir.ts` (pembersihan tabel 3b), `README.md`, `docs/superpowers/plans/2026-10-04-00-roadmap.md`

- [ ] **Step 1: Pembersihan E2E lama ikut tabel 3b**

Di `scripts/uji-stok.ts` dan `scripts/uji-kasir.ts`, di blok `finally` dalam `if (outletId) {`, setelah baris `await svc.from('gerakan_stok').delete().eq('outlet_id', outletId);` tambahkan:
```ts
		const rs = ((await svc.from('rusak').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (rs.length) await svc.from('rusak_item').delete().in('rusak_id', rs);
		await svc.from('rusak').delete().eq('outlet_id', outletId);
		const op = ((await svc.from('opname').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (op.length) await svc.from('opname_item').delete().in('opname_id', op);
		await svc.from('opname').delete().eq('outlet_id', outletId);
```

- [ ] **Step 2: Pasang migrasi**

Run: `npm run sb -- db push --dry-run` → Expected: tepat lima file `20261007000012`…`20261007000016`.
Run: `npm run sb -- db push --yes` → Expected: kelimanya "Applying migration …".

- [ ] **Step 3: E2E 3b**

`scripts/uji-stok-3b.ts`:
```ts
// E2E stok 3b terhadap Supabase sungguhan: dua outlet "UJA"/"UJB", admin & 2 kasir sementara; semua dihapus di akhir.
//   node --env-file=.env.local scripts/uji-stok-3b.ts
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
const outletIds: string[] = [];
const userIds: string[] = [];

async function akun(role: 'admin' | 'kasir', outletKode: string | null): Promise<SupabaseClient> {
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.${role}.${outletKode ?? 'x'}.${tag}`.toLowerCase();
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: `Uji ${role}`, role, outlet_kode: outletKode }
	});
	if (a.error) throw new Error(a.error.message);
	userIds.push(a.data.user.id);
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await c.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);
	return c;
}

try {
	for (const kode of ['UJA', 'UJB']) {
		const o = await svc.from('outlets').insert({ kode, nama: `Uji ${kode} ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
		if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
		outletIds.push(o.data.id);
	}
	const [a, b] = outletIds;
	const dada = (await svc.from('bahan').select('id').eq('kode', 'ori_dada').single()).data!.id;
	const admin = await akun('admin', null);
	const ka = await akun('kasir', 'UJA');
	const kb = await akun('kasir', 'UJB');
	const stok = async (c: SupabaseClient, outlet: string) =>
		Number((await c.from('stok_outlet').select('qty').eq('outlet_id', outlet).eq('bahan_id', dada).single()).data?.qty);

	for (const [k, o] of [[ka, a], [kb, b]] as const) {
		const aj = await k.rpc('ajukan_stok_awal', { p_outlet: o, p_item: [{ bahan_id: dada, qty: 10 }] });
		await admin.rpc('putuskan_stok_awal', { p_id: aj.data, p_setuju: true, p_item: null, p_catatan: null });
	}
	cek('stok awal kedua outlet 10', (await stok(ka, a)) === 10 && (await stok(kb, b)) === 10);

	const r = await ka.rpc('catat_rusak', { p: { id: randomUUID(), outlet_id: a, alasan: 'gosong', item: [{ bahan_id: dada, qty: 2 }] } });
	cek('rusak 2 → A 8', !r.error && (await stok(ka, a)) === 8, r.error?.message);

	const tid = randomUUID();
	const k = await ka.rpc('kirim_transfer', { p: { id: tid, dari_outlet_id: a, ke_outlet_id: b, item: [{ bahan_id: dada, qty: 3 }] } });
	cek('kirim 3 dari A ke B', !k.error, k.error?.message);
	const intip = await kb.from('transfer_item').select('qty').eq('transfer_id', tid);
	cek('B tidak bisa mengintip isi kiriman', (intip.data ?? []).length === 0, intip.error?.message);
	const salah = await kb.rpc('terima_transfer', { p_id: tid, p_item: [{ bahan_id: dada, qty: 2 }] });
	cek('B mengetik 2 → ditolak "Ada perbedaan jumlah"', /Ada perbedaan jumlah/.test(salah.error?.message ?? ''), salah.error?.message);
	cek('stok belum berpindah', (await stok(ka, a)) === 8 && (await stok(kb, b)) === 10);
	const benar = await kb.rpc('terima_transfer', { p_id: tid, p_item: [{ bahan_id: dada, qty: 3 }] });
	cek('B mengetik 3 → A 5, B 13', !benar.error && (await stok(ka, a)) === 5 && (await stok(kb, b)) === 13, benar.error?.message);

	const op = await ka.rpc('ajukan_opname', { p_outlet: a, p_item: [{ bahan_id: dada, qty: 4 }] });
	cek('kasir mengajukan opname', !op.error, op.error?.message);
	const lihat = await ka.from('opname_item').select('qty_sistem');
	cek('kasir tidak bisa membaca angka sistem opname', (lihat.data ?? []).length === 0);
	const pv = await admin.rpc('pratinjau_opname', { p_id: op.data });
	cek('admin melihat pratinjau sistem 5', Number(pv.data?.[0]?.qty_sistem) === 5, JSON.stringify(pv.data ?? pv.error));
	const sp = await admin.rpc('putuskan_opname', { p_id: op.data, p_setuju: true, p_item: null, p_catatan: null });
	cek('opname disetujui → A 4', !sp.error && (await stok(ka, a)) === 4, sp.error?.message);
} catch (e) {
	gagal++;
	console.error(`GAGAL langkah: ${(e as Error).message}`);
} finally {
	for (const o of outletIds) await svc.from('gerakan_stok').delete().eq('outlet_id', o);
	const tr = ((await svc.from('transfer').select('id').in('dari_outlet_id', outletIds)).data ?? []).map((x) => x.id);
	if (tr.length) await svc.from('transfer_item').delete().in('transfer_id', tr);
	if (outletIds.length) await svc.from('transfer').delete().in('dari_outlet_id', outletIds);
	for (const o of outletIds) {
		const rs = ((await svc.from('rusak').select('id').eq('outlet_id', o)).data ?? []).map((x) => x.id);
		if (rs.length) await svc.from('rusak_item').delete().in('rusak_id', rs);
		await svc.from('rusak').delete().eq('outlet_id', o);
		const op = ((await svc.from('opname').select('id').eq('outlet_id', o)).data ?? []).map((x) => x.id);
		if (op.length) await svc.from('opname_item').delete().in('opname_id', op);
		await svc.from('opname').delete().eq('outlet_id', o);
		const sa = ((await svc.from('stok_awal').select('id').eq('outlet_id', o)).data ?? []).map((x) => x.id);
		if (sa.length) await svc.from('stok_awal_item').delete().in('stok_awal_id', sa);
		await svc.from('stok_awal').delete().eq('outlet_id', o);
	}
	for (const id of userIds) {
		const { error } = await svc.auth.admin.deleteUser(id);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji ${id}: ${error.message}`);
		}
	}
	for (const o of outletIds) {
		const { error } = await svc.from('outlets').delete().eq('id', o);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus outlet uji ${o}: ${error.message}`);
		}
	}
	console.log('\nData uji dibersihkan.');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
```

Run: `node --env-file=.env.local scripts/uji-stok-3b.ts`, lalu `scripts/uji-stok.ts` dan `scripts/uji-kasir.ts`.
Expected: ketiganya "Semua pemeriksaan lulus" & "Data uji dibersihkan."; outlet server tetap `BL,TK,KP`.

- [ ] **Step 4: Dokumentasi & daftar uji owner**

`README.md`: tambahkan baris tabel setelah baris `uji-stok.ts`:
```
| `node --env-file=.env.local scripts/uji-stok-3b.ts` | uji rusak, transfer, opname di server (outlet & akun sementara, dibersihkan otomatis) |
```
Roadmap: baris 3b → kolom rencana `` `2026-10-07-tahap-3b-stok.md` ``, status `selesai (menunggu uji owner)`.

`docs/uji/tahap-3b-stok-owner.md`:
```markdown
# PR owner — uji Tahap 3b (rusak, transfer, opname)

Status: **belum dicoba**. Jalankan `npm run dev`, buka di Chrome. Butuh stok awal yang sudah disetujui (Tahap 3a). Centang `[x]` yang sudah.

## Rusak/terbuang
- [ ] Kasir → Stok → **Catat rusak** → alasan "Gosong" → isi 2 sayap Ori → Catat → stok sayap Ori turun 2
- [ ] Alasan "Lainnya" tanpa catatan → ditolak dengan pesan
- [ ] Admin → Stok → **Rusak** → batalkan catatan tadi (isi alasan) → stok kembali

## Sisa di Tutup toko
- [ ] Tutup toko → muncul "Ada sisa yang tidak terjual?" → **Ada sisa** → isi 3 dada Ori + 2 porsi nasi → Catat sisa → Lanjut tutup toko
- [ ] Stok: dada Ori turun 3, beras turun 0,2 kg
- [ ] Buka shift baru, Tutup toko lagi → pertanyaan muncul lagi; pilih **Tidak ada sisa** → langsung ke hitung uang

## Transfer (butuh 2 akun kasir, mis. BL & TK, atau admin di dua tab)
- [ ] Kasir BL → **Kirim ke outlet lain** → tujuan Talang Kerangga → 1 pack Ayam Ori (isi per potongan) → Kirim
- [ ] Kasir TK → tab Stok menunjukkan **Terima kiriman (1)** → buka → isi angka berbeda → muncul "Ada perbedaan jumlah. Silakan hubungi outlet pengirim (Bukit Lama)"
- [ ] Isi angka yang sama → diterima; stok BL turun, TK naik
- [ ] Kirim lagi, lalu BL **Ubah** jumlahnya / **Batalkan** → TK tidak bisa menerima yang dibatalkan
- [ ] Admin → Stok → **Transfer** menampilkan semuanya

## Opname
- [ ] Hari Minggu (atau setelahnya bila belum opname minggu ini): tab Stok kasir menampilkan "Waktunya opname mingguan"
- [ ] Opname saat masih ada kiriman menunggu → ditolak "Selesaikan kiriman/penerimaan dulu"
- [ ] Isi semua bahan → Kirim → Admin → Stok → **Opname** → tabel hitungan / sistem / selisih, selisih besar merah ⚠
- [ ] Setujui → stok = hitungan
- [ ] Beranda admin: "opname menunggu persetujuan" / "kiriman belum diterima" muncul saat ada

Catatan hasil uji:
```

- [ ] **Step 5: Verifikasi penuh & commit**

Run: `npm test && npm run check && npm run build`
Expected: semua lulus, 0 errors, build sukses.

```bash
git add scripts/uji-stok-3b.ts scripts/uji-stok.ts scripts/uji-kasir.ts README.md docs/superpowers/plans/2026-10-04-00-roadmap.md docs/uji/tahap-3b-stok-owner.md
git commit -m "test(e2e): rusak, transfer, opname di server; docs Tahap 3b & daftar uji owner"
```
