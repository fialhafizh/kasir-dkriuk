# Tahap 4a — Offline Jualan & Pemasangan Online Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kasir bisa buka toko, jualan + cetak struk (nomor sementara + kode struk), catat sisa, dan tutup toko tanpa internet; semua terkirim berurutan persis sekali saat online; aplikasi terpasang di GitHub Pages dan bisa dipasang ke layar utama (PWA).

**Architecture:** Server: tabel `perangkat` & `shift_perangkat`, kolom jejak offline di `shift`/`penjualan`/`rusak` (0018), fungsi `*_offline` idempoten per id perangkat yang memakai jam kejadian (0019). Klien: IndexedDB (Dexie) berisi *salinan* data server dan *antrean kejadian*; mesin antrean mengirim berurutan, membedakan galat jaringan (berhenti, coba lagi) dari penolakan server (ke "Perlu perhatian"). Layar kasir membaca salinan + antrean. Service worker SvelteKit menyimpan file aplikasi; GitHub Actions membangun & memasang ke Pages. Sisa Tahap 4 (batal, transfer, opname offline; halaman admin Perangkat) ada di rencana 4b.

**Tech Stack:** SvelteKit 3 (service worker `$app/service-worker`, `$app/manifest`), Svelte 5, Dexie 4 + fake-indexeddb (tes), Supabase, Vitest + PGlite, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-10-08-tahap-4-offline-design.md` (§1–5). Wajib baca "Catatan wajib" roadmap (Tahap 4). Laporan owner: `docs/laporan-pembuatan.md` (perbarui di Task 9).

## Global Constraints

- SvelteKit 3: impor `#lib/...` dengan ekstensi; hash router; tanpa `+layout.ts`; base path `/kasir-dkriuk` saat build Pages (`BASE_PATH`).
- Migrasi 0001–0017 sudah di server: **jangan diubah**; baru: `20261008000018_offline_skema.sql`, `20261008000019_fungsi_offline.sql`.
- Fungsi lama (Tahap 2–3b) tetap ada & tetap lulus tesnya; fungsi baru `*_offline` dipakai antrean.
- Semua fungsi baru: `security definer`, `search_path = ''`, cek akses `coalesce`, pesan Indonesia 22023/42501, idempoten per id dari perangkat, jam perangkat dibatasi (tidak > now+5 menit, tidak < now−7 hari; di luar itu memakai now()).
- Antrean: berurutan menurut urutan dibuat; galat jaringan/sesi (fetch gagal, status 0/5xx, 401, PGRST301/303) → berhenti & coba lagi nanti; galat lain → status `ditolak` + alasan; kejadian satu shift yang buka-nya ditolak ikut tertahan.
- Kunci service role & token **tidak pernah** ke GitHub; yang ditanam saat build hanya `PUBLIC_SUPABASE_URL` & `PUBLIC_SUPABASE_ANON_KEY` (repository variables).
- UI Indonesia, sentuh ≥ 48 px, ≤1000 baris/file. Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Angka contoh di tes jangan menyerupai harga beli asli.

## Review Focus

1. Kejadian yang sama terkirim dua kali (jawaban hilang, dua tab) → tercatat sekali (buka/jual/tutup/rusak). Diuji Task 2–3 & 4.
2. Dua perangkat membuka toko di hari yang sama saat offline → satu shift; penjualan keduanya masuk shift itu; buka lagi setelah tutup → shift baru dengan `dibuka_lagi_setelah`. Diuji Task 2.
3. Penjualan offline yang jamnya sebelum tutup tetapi tiba sesudahnya → masuk shift-nya, `jual_setelah_tutup` naik, ringkasan memuatnya. Diuji Task 3.
4. Penjualan/rusak yang jamnya sebelum stok awal/opname tetapi tiba sesudahnya → tercatat tanpa memotong stok (dan void-nya tidak mengembalikan apa-apa). Diuji Task 3.
5. Aplikasi dibuka ulang offline dengan token kedaluwarsa (INITIAL_SESSION null) → kasir tetap masuk dengan profil tersimpan; online kembali → sesi diperbarui; setelah Keluar tidak bisa masuk offline. Diuji Task 5.

---

## File Structure

```
supabase/migrations/20261008000018_offline_skema.sql   # perangkat, shift_perangkat, kolom offline, trigger jual (tanpa_stok)
supabase/migrations/20261008000019_fungsi_offline.sql  # daftar/tandai perangkat, buka/jual/tutup/rusak *_offline, ringkasan_shift (+catatan)
tests/db/offline.test.ts                               # semua aturan server 4a
src/lib/offline/db.ts             # Dexie: kejadian & salinan
src/lib/offline/antrean.ts (+test)# tambah, kirim berurutan, tolak vs jaringan, coba lagi, hitung, bersihkan
src/lib/offline/salinan.ts (+test)# denganSalinan: ambil server → simpan; jaringan putus → pakai salinan
src/lib/offline/perangkat.ts (+test) # id & kode perangkat
src/lib/offline/nomor.ts (+test)  # kode struk, nomor sementara
src/lib/offline/proyeksi.ts (+test) # shift aktif lokal, penjualan lokal, ringkasan lokal
src/lib/offline/pengirim.ts       # kejadian → RPC *_offline, pemetaan galat
src/lib/offline/pesan.ts (+test)  # pesanSinkron (kasir + stok + 0019)
src/lib/offline/sinkron.svelte.ts # status & pemicu sinkron
src/lib/auth/auth-state.svelte.ts (ubah, +test)  # cold start offline
src/lib/auth/sesi-tersimpan.ts (+test)
src/lib/kasir/struk.ts (ubah, +test)  # baris kode struk
src/lib/kasir/pos.svelte.ts (ubah)     # shift dari server + antrean
src/lib/components/kasir/{ModalShift,Selesai}.svelte (ubah), PenandaSinkron.svelte (baru)
src/lib/components/stok/LangkahSisa.svelte (ubah)  # rusak lewat antrean
src/lib/components/layout/AppShell.svelte (ubah)   # Keluar ditolak bila antrean belum kosong; pita versi baru
src/routes/kasir/{+layout,+page,riwayat/+page,tutup/+page}.svelte (ubah), kasir/perlu-perhatian/+page.svelte (baru)
src/service-worker.ts, static/manifest.webmanifest, static/ikon-192.png, static/ikon-512.png, src/app.html (ubah)
.github/workflows/pages.yml
scripts/uji-offline.ts, docs/uji/tahap-4a-offline-owner.md, docs/laporan-pembuatan.md (ubah)
```

---

### Task 1: Skema offline (perangkat, shift_perangkat, kolom jejak, trigger tanpa_stok)

**Files:**
- Create: `supabase/migrations/20261008000018_offline_skema.sql`, `tests/db/offline.test.ts`

**Interfaces:**
- Produces: tabel `perangkat(id uuid pk, kode int identity unique, outlet_id, label, terakhir_oleh, terakhir_sinkron, dibuat_at)`, `shift_perangkat(id uuid pk, shift_id, perangkat_id, modal, dibuka_at, dicatat_at)`; kolom `shift.digabung bool`, `shift.jual_setelah_tutup int`, `shift.dibuka_lagi_setelah timestamptz`, `shift.tutup_id uuid unique`; `penjualan.kode_struk text unique`, `penjualan.nomor_sementara text`, `penjualan.perangkat_id uuid`, `penjualan.tanpa_stok bool`; `rusak.perangkat_id`, `rusak.tanpa_stok`. Trigger `_gerakan_jual` diganti: melewati penjualan `tanpa_stok`.

- [ ] **Step 1: Tes (gagal dulu)**

`tests/db/offline.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';
import { rpc } from './harness-3b';
import { idMenu, idOutlet } from './harness-kasir';
import { stokBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;
const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
});

describe('skema offline', () => {
	it('anon tidak bisa membaca tabel baru; kasir tidak bisa menulis langsung', async () => {
		for (const t of ['perangkat', 'shift_perangkat']) {
			await expect(sebagaiAnon(db, () => db.query(`select * from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for table ${t}`));
			await expect(sebagai(db, kasirBL, () => db.query(`delete from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for table ${t}`));
		}
	});
	it('penjualan bertanda tanpa_stok tidak memotong stok', async () => {
		const bl = await idOutlet(db, 'BL');
		const s = (await db.query<{ id: string }>(`insert into public.shift (outlet_id, dibuka_oleh, modal) values ($1, $2, 0) returning id`, [bl, kasirBL])).rows[0].id;
		const p = crypto.randomUUID();
		await db.query(
			`insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, metode, total, tanpa_stok) values ($1, $2, $3, $4, 'BL-X', now(), 'qris', 1, true)`,
			[p, bl, s, kasirBL]
		);
		await db.query(`insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty) values ($1, $2, 'Dada', 1, 2)`, [p, await idMenu(db, 'ori_dada')]);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(0);
	});
	it('kode struk unik dan berformat 6 karakter', async () => {
		const bl = await idOutlet(db, 'BL');
		const s = (await db.query<{ id: string }>(`insert into public.shift (outlet_id, dibuka_oleh, modal) values ($1, $2, 0) returning id`, [bl, kasirBL])).rows[0].id;
		await expect(
			db.query(`insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, metode, total, kode_struk) values (gen_random_uuid(), $1, $2, $3, 'BL-Y', now(), 'qris', 1, 'abc')`, [bl, s, kasirBL])
		).rejects.toThrow(/penjualan_kode_struk_check/);
	});
});

export { P1, P2, adminId, kasirTK, rpc };
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/offline.test.ts`
Expected: FAIL — `relation "public.perangkat" does not exist` / kolom `tanpa_stok` belum ada.

- [ ] **Step 3: Migrasi**

`supabase/migrations/20261008000018_offline_skema.sql`:
```sql
-- Tahap 4a: perangkat kasir, shift dari perangkat (digabung saat sinkron), jejak penjualan offline.

create table public.perangkat (
  id uuid primary key,
  kode integer generated always as identity unique,
  outlet_id uuid references public.outlets (id) on delete restrict,
  label text check (label is null or length(label) <= 60),
  terakhir_oleh uuid references public.profiles (id) on delete restrict,
  terakhir_sinkron timestamptz,
  dibuat_at timestamptz not null default now()
);

-- id = id shift yang dibuat perangkat; shift_id = shift sebenarnya (sama, atau shift lain bila digabung).
create table public.shift_perangkat (
  id uuid primary key,
  shift_id uuid not null references public.shift (id) on delete restrict,
  perangkat_id uuid references public.perangkat (id) on delete restrict,
  modal integer not null check (modal >= 0),
  dibuka_at timestamptz not null,
  dicatat_at timestamptz not null default now()
);
create index shift_perangkat_shift on public.shift_perangkat (shift_id);

alter table public.shift
  add column digabung boolean not null default false,
  add column jual_setelah_tutup integer not null default 0,
  add column dibuka_lagi_setelah timestamptz,
  add column tutup_id uuid unique;

alter table public.penjualan
  add column kode_struk text unique check (kode_struk ~ '^[0-9A-Z]{6}$'),
  add column nomor_sementara text check (nomor_sementara ~ '^S[0-9]+-[0-9]{3,}$'),
  add column perangkat_id uuid references public.perangkat (id) on delete restrict,
  add column tanpa_stok boolean not null default false;

alter table public.rusak
  add column perangkat_id uuid references public.perangkat (id) on delete restrict,
  add column tanpa_stok boolean not null default false;

-- Penjualan yang jamnya sebelum hitungan fisik (stok awal/opname) tetapi tiba sesudahnya tidak memotong stok.
create or replace function public._gerakan_jual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, penjualan_id)
  select p.outlet_id, r.bahan_id, -sum(n.qty * r.qty), 'jual', p.waktu, p.kasir_id, p.id
  from baru n
  join public.penjualan p on p.id = n.penjualan_id and not p.tanpa_stok
  join public.resep r on r.menu_id = n.menu_id
  join public.bahan b on b.id = r.bahan_id and b.mode = 'otomatis'
  group by p.outlet_id, r.bahan_id, p.waktu, p.kasir_id, p.id;
  return null;
end
$$;

alter table public.perangkat enable row level security;
alter table public.shift_perangkat enable row level security;
revoke all on public.perangkat, public.shift_perangkat from anon, authenticated;
revoke all on sequence public.perangkat_kode_seq from anon, authenticated;
grant select on public.perangkat, public.shift_perangkat to authenticated;
grant all on public.perangkat, public.shift_perangkat to service_role;
grant usage, select on sequence public.perangkat_kode_seq to service_role;
create policy perangkat_baca on public.perangkat for select to authenticated using ((select public.is_admin()));
create policy shift_perangkat_baca on public.shift_perangkat for select to authenticated
  using (exists (select 1 from public.shift s where s.id = shift_id));
```

- [ ] **Step 4: Jalankan, pastikan lulus (semua tes DB)**

Run: `npx vitest run tests/db`
Expected: PASS semua.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261008000018_offline_skema.sql tests/db/offline.test.ts
git commit -m "feat(offline): skema perangkat, shift dari perangkat, jejak penjualan offline"
```

---

### Task 2: Perangkat, buka & tutup toko offline (gabung shift, buka lagi)

**Files:**
- Create: `supabase/migrations/20261008000019_fungsi_offline.sql` (bagian 1; Task 3 menambah bagian 2 ke file yang sama sebelum dipasang)
- Test: `tests/db/offline.test.ts`

**Interfaces:**
- Produces (RPC): `daftar_perangkat(p_id uuid, p_outlet uuid) returns integer` (kode), `tandai_sinkron(p_id uuid) returns void`, `buka_shift_offline(p jsonb) returns uuid` (`p = {id, outlet_id, modal, waktu, perangkat_id}`, hasil = id shift sebenarnya), `tutup_shift_offline(p jsonb) returns jsonb` (`p = {id, shift_id, uang_fisik, catatan, waktu}`, `shift_id` = id shift perangkat), `ringkasan_shift(uuid)` diganti (+`digabung`, `jual_setelah_tutup`, `dibuka_lagi_setelah`); internal `_waktu_perangkat(timestamptz)`, `_shift_dari_perangkat(uuid)`.

- [ ] **Step 1: Tes (gagal dulu)**

Tambahkan ke akhir `tests/db/offline.test.ts`:
```ts
const daftar = async (oleh: string, id: string, outlet = 'BL') => rpc<number>(db, oleh, 'public.daftar_perangkat($1, $2)', [id, await idOutlet(db, outlet)]);
async function buka(oleh: string, id: string, perangkat: string, modal = 100000, waktu = 'now()') {
	const w = (await db.query<{ w: string }>(`select (${waktu})::text as w`)).rows[0].w;
	return rpc<string>(db, oleh, 'public.buka_shift_offline($1::jsonb)', [JSON.stringify({ id, outlet_id: await idOutlet(db, 'BL'), modal, waktu: w, perangkat_id: perangkat })]);
}
async function tutup(oleh: string, id: string, shiftId: string, uang = 0, waktu = 'now()') {
	const w = (await db.query<{ w: string }>(`select (${waktu})::text as w`)).rows[0].w;
	return rpc<Record<string, unknown>>(db, oleh, 'public.tutup_shift_offline($1::jsonb)', [JSON.stringify({ id, shift_id: shiftId, uang_fisik: uang, catatan: null, waktu: w })]);
}

describe('perangkat', () => {
	it('daftar memberi kode berurutan & idempoten; kasir outlet lain ditolak', async () => {
		const k1 = await daftar(kasirBL, P1);
		expect(await daftar(kasirBL, P1)).toBe(k1);
		const k2 = await daftar(kasirBL, P2);
		expect(k2).toBe(k1 + 1);
		await expect(daftar(kasirTK, crypto.randomUUID(), 'BL')).rejects.toThrow(/tidak berhak/);
	});
	it('tandai sinkron mengisi jam sinkron terakhir', async () => {
		await daftar(kasirBL, P1);
		await rpc(db, kasirBL, 'public.tandai_sinkron($1)', [P1]);
		const r = (await db.query<{ t: string | null }>('select terakhir_sinkron::text as t from public.perangkat where id = $1', [P1])).rows[0];
		expect(r.t).not.toBeNull();
	});
});

describe('buka & tutup toko offline', () => {
	beforeEach(async () => {
		await daftar(kasirBL, P1);
		await daftar(kasirBL, P2);
	});
	it('buka dari perangkat: shift dibuat dengan id perangkat & jam kejadian; kirim ulang → shift sama', async () => {
		const id = crypto.randomUUID();
		const s = await buka(kasirBL, id, P1, 150000, "now() - interval '2 hours'");
		expect(s).toBe(id);
		expect(await buka(kasirBL, id, P1)).toBe(id);
		const r = (await db.query<{ modal: number; lama: boolean }>(`select modal, dibuka_at < now() - interval '1 hour' as lama from public.shift where id = $1`, [id])).rows[0];
		expect(r).toEqual({ modal: 150000, lama: true });
	});
	it('dua perangkat membuka di hari yang sama → digabung ke satu shift', async () => {
		const a = await buka(kasirBL, crypto.randomUUID(), P1, 100000, "now() - interval '3 hours'");
		const idB = crypto.randomUUID();
		const b = await buka(kasirBL, idB, P2, 50000, "now() - interval '2 hours'");
		expect(b).toBe(a);
		const r = (await db.query<{ digabung: boolean; n: number }>(`select digabung, (select count(*)::int from public.shift where outlet_id = s.outlet_id) as n from public.shift s where id = $1`, [a])).rows[0];
		expect(r).toEqual({ digabung: true, n: 1 });
	});
	it('perangkat yang membuka saat shift lain masih berjalan tetapi tiba setelah shift itu ditutup → tetap digabung', async () => {
		const a = await buka(kasirBL, crypto.randomUUID(), P1, 0, "now() - interval '5 hours'");
		await tutup(kasirBL, crypto.randomUUID(), a, 0, "now() - interval '1 hour'");
		expect(await buka(kasirBL, crypto.randomUUID(), P2, 0, "now() - interval '3 hours'")).toBe(a);
	});
	it('buka lagi setelah ditutup → shift baru dengan catatan jam tutup sebelumnya', async () => {
		const a = await buka(kasirBL, crypto.randomUUID(), P1, 0, "now() - interval '5 hours'");
		await tutup(kasirBL, crypto.randomUUID(), a, 0, "now() - interval '3 hours'");
		const b = await buka(kasirBL, crypto.randomUUID(), P2, 0, "now() - interval '2 hours'");
		expect(b).not.toBe(a);
		const r = (await db.query<{ ok: boolean }>(`select dibuka_lagi_setelah = (select ditutup_at from public.shift where id = $2) as ok from public.shift where id = $1`, [b, a])).rows[0];
		expect(r.ok).toBe(true);
	});
	it('shift hari sebelumnya belum ditutup → buka ditolak', async () => {
		await buka(kasirBL, crypto.randomUUID(), P1, 0, "now() - interval '30 hours'");
		await expect(buka(kasirBL, crypto.randomUUID(), P2)).rejects.toThrow(/Toko kemarin belum ditutup/);
	});
	it('tutup: idempoten per id kejadian; tutup kedua dari perangkat lain ditolak; jam tutup = jam kejadian', async () => {
		const a = await buka(kasirBL, crypto.randomUUID(), P1, 100000, "now() - interval '5 hours'");
		const t = crypto.randomUUID();
		const r1 = await tutup(kasirBL, t, a, 100000, "now() - interval '1 hour'");
		const r2 = await tutup(kasirBL, t, a, 100000);
		expect(r2).toEqual(r1);
		await expect(tutup(kasirBL, crypto.randomUUID(), a, 5)).rejects.toThrow(/Shift sudah ditutup/);
		const lama = (await db.query<{ ok: boolean }>(`select ditutup_at < now() - interval '30 minutes' as ok from public.shift where id = $1`, [a])).rows[0].ok;
		expect(lama).toBe(true);
	});
	it('jam perangkat di masa depan dipakai jam server', async () => {
		const a = await buka(kasirBL, crypto.randomUUID(), P1, 0, "now() + interval '3 hours'");
		const ok = (await db.query<{ ok: boolean }>(`select dibuka_at <= now() + interval '1 minute' as ok from public.shift where id = $1`, [a])).rows[0].ok;
		expect(ok).toBe(true);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/offline.test.ts`
Expected: FAIL — `function public.daftar_perangkat(...) does not exist`.

- [ ] **Step 3: Migrasi (bagian 1)**

`supabase/migrations/20261008000019_fungsi_offline.sql`:
```sql
-- Tahap 4a: fungsi untuk antrean offline. Semua idempoten per id dari perangkat dan memakai jam kejadian.

-- Jam dari perangkat dipercaya dalam batas wajar; di luar itu memakai jam server.
create function public._waktu_perangkat(p_waktu timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when p_waktu is null or p_waktu > now() + interval '5 minutes' or p_waktu < now() - interval '7 days' then now()
    else p_waktu
  end
$$;

-- Shift sebenarnya dari id shift perangkat (atau id shift server langsung, untuk shift Tahap 2).
create function public._shift_dari_perangkat(p_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce((select shift_id from public.shift_perangkat where id = p_id), (select id from public.shift where id = p_id))
$$;

create function public.daftar_perangkat(p_id uuid, p_outlet uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_kode integer;
begin
  perform public._cek_akses_outlet(p_outlet);
  if p_id is null then
    raise exception 'Data perangkat tidak lengkap' using errcode = '22023';
  end if;
  insert into public.perangkat (id, outlet_id, terakhir_oleh) values (p_id, p_outlet, auth.uid())
  on conflict (id) do update set outlet_id = excluded.outlet_id, terakhir_oleh = excluded.terakhir_oleh
  returning kode into v_kode;
  return v_kode;
end
$$;

create function public.tandai_sinkron(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.perangkat set terakhir_sinkron = now(), terakhir_oleh = auth.uid()
  where id = p_id and (public.is_admin() or coalesce(public.my_outlet_id() = outlet_id, false));
end
$$;

create function public.buka_shift_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid;
  v_modal integer;
  v_perangkat uuid;
  v_waktu timestamptz;
  v_shift uuid;
begin
  perform public._cek_akses_outlet(v_outlet);
  v_id := (p ->> 'id')::uuid;
  v_modal := (p ->> 'modal')::integer;
  v_perangkat := (p ->> 'perangkat_id')::uuid;
  v_waktu := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  if v_id is null then
    raise exception 'Data shift tidak lengkap' using errcode = '22023';
  end if;
  if v_modal is null or v_modal < 0 or v_modal > 100000000 then
    raise exception 'Modal kembalian tidak sah' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shift:' || v_outlet::text, 0));
  select shift_id into v_shift from public.shift_perangkat where id = v_id;
  if found then
    return v_shift;
  end if;
  -- Shift yang sedang berjalan saat perangkat ini membuka (hari WIB sama, belum ditutup saat itu) → gabung.
  select id into v_shift from public.shift
  where outlet_id = v_outlet and public.tanggal_wib(dibuka_at) = public.tanggal_wib(v_waktu)
    and (ditutup_at is null or ditutup_at >= v_waktu)
  order by dibuka_at limit 1;
  if v_shift is not null then
    update public.shift set digabung = true where id = v_shift;
  else
    if exists (select 1 from public.shift where outlet_id = v_outlet and ditutup_at is null) then
      raise exception 'Toko kemarin belum ditutup' using errcode = '22023';
    end if;
    insert into public.shift (id, outlet_id, dibuka_oleh, modal, dibuka_at, dibuka_lagi_setelah)
    values (v_id, v_outlet, auth.uid(), v_modal, v_waktu,
      (select max(ditutup_at) from public.shift
       where outlet_id = v_outlet and public.tanggal_wib(dibuka_at) = public.tanggal_wib(v_waktu) and ditutup_at < v_waktu));
    v_shift := v_id;
  end if;
  insert into public.shift_perangkat (id, shift_id, perangkat_id, modal, dibuka_at) values (v_id, v_shift, v_perangkat, v_modal, v_waktu);
  return v_shift;
end
$$;

create or replace function public.ringkasan_shift(p_shift uuid) returns jsonb
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
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = s.outlet_id, false)) then
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
    'selisih', case when s.uang_fisik is null then null else s.uang_fisik - (s.modal + v_cash) end,
    'digabung', s.digabung, 'jual_setelah_tutup', s.jual_setelah_tutup, 'dibuka_lagi_setelah', s.dibuka_lagi_setelah
  );
end
$$;

create function public.tutup_shift_offline(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_shift uuid := public._shift_dari_perangkat((p ->> 'shift_id')::uuid);
  v_uang integer := (p ->> 'uang_fisik')::integer;
  v_waktu timestamptz := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  s public.shift;
begin
  select * into s from public.shift where id = v_shift for update;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = s.outlet_id, false)) then
    raise exception 'Shift tidak ditemukan' using errcode = '22023';
  end if;
  if v_id is not null and s.tutup_id = v_id then
    return public.ringkasan_shift(s.id);
  end if;
  if s.ditutup_at is not null then
    raise exception 'Shift sudah ditutup' using errcode = '22023';
  end if;
  if v_id is null or v_uang is null or v_uang < 0 or v_uang > 1000000000 then
    raise exception 'Jumlah uang di laci tidak sah' using errcode = '22023';
  end if;
  update public.shift
  set ditutup_at = greatest(v_waktu, s.dibuka_at), ditutup_oleh = auth.uid(), uang_fisik = v_uang, tutup_id = v_id,
      catatan = nullif(trim(coalesce(p ->> 'catatan', '')), '')
  where id = s.id;
  return public.ringkasan_shift(s.id);
end
$$;

revoke execute on function public._shift_dari_perangkat(uuid) from public, anon, authenticated;
revoke execute on function public.daftar_perangkat(uuid, uuid) from public, anon;
revoke execute on function public.tandai_sinkron(uuid) from public, anon;
revoke execute on function public.buka_shift_offline(jsonb) from public, anon;
revoke execute on function public.tutup_shift_offline(jsonb) from public, anon;
grant execute on function public.daftar_perangkat(uuid, uuid) to authenticated;
grant execute on function public.tandai_sinkron(uuid) to authenticated;
grant execute on function public.buka_shift_offline(jsonb) to authenticated;
grant execute on function public.tutup_shift_offline(jsonb) to authenticated;
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/db`
Expected: PASS semua (termasuk tes kasir lama yang memakai `ringkasan_shift`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261008000019_fungsi_offline.sql tests/db/offline.test.ts
git commit -m "feat(offline): perangkat, buka & tutup toko dari perangkat (gabung shift, buka lagi)"
```

---

### Task 3: Jualan & rusak offline (nomor resmi, kode struk, tanpa_stok, jual setelah tutup)

**Files:**
- Modify: `supabase/migrations/20261008000019_fungsi_offline.sql` (tambah di akhir, sebelum dipasang)
- Test: `tests/db/offline.test.ts`

**Interfaces:**
- Produces (RPC): `catat_penjualan_offline(p jsonb) returns jsonb` — `p = {id, outlet_id, shift_id (id shift perangkat), metode, diterima?, waktu, perangkat_id, kode_struk, nomor_sementara?, item:[{menu_id, qty}]}`, hasil `{id, nomor, total, kembalian, waktu, ulang, batal, kode_struk}`; `catat_rusak_offline(p jsonb) returns uuid` — `p = {id, outlet_id, alasan, catatan?, waktu, perangkat_id, item}`.

- [ ] **Step 1: Tes (gagal dulu)**

Tambahkan ke akhir `tests/db/offline.test.ts`:
```ts
import { isian, setujuiStokAwal } from './harness-3b';

async function jual(oleh: string, shiftId: string, opsi: { id?: string; waktu?: string; kode?: string; item?: [string, number][]; metode?: string; diterima?: number } = {}) {
	const w = (await db.query<{ w: string }>(`select (${opsi.waktu ?? 'now()'})::text as w`)).rows[0].w;
	const p = {
		id: opsi.id ?? crypto.randomUUID(),
		outlet_id: await idOutlet(db, 'BL'),
		shift_id: shiftId,
		metode: opsi.metode ?? 'qris',
		...(opsi.diterima !== undefined ? { diterima: opsi.diterima } : {}),
		waktu: w,
		perangkat_id: P1,
		kode_struk: opsi.kode ?? Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X'),
		nomor_sementara: 'S1-001',
		item: await Promise.all((opsi.item ?? [['ori_dada', 1]]).map(async ([kode, qty]) => ({ menu_id: await idMenu(db, kode), qty })))
	};
	return { p, hasil: await rpc<{ id: string; nomor: string; total: number; ulang: boolean; kode_struk: string }>(db, oleh, 'public.catat_penjualan_offline($1::jsonb)', [JSON.stringify(p)]) };
}

describe('jualan offline', () => {
	let shift: string;
	beforeEach(async () => {
		await daftar(kasirBL, P1);
		shift = await buka(kasirBL, crypto.randomUUID(), P1, 100000, "now() - interval '6 hours'");
	});
	it('tercatat dengan jam kejadian, kode struk & nomor sementara; nomor resmi urut kedatangan; kirim ulang → sama', async () => {
		const a = await jual(kasirBL, shift, { waktu: "now() - interval '1 hour'", kode: 'K7Q2MX' });
		const b = await jual(kasirBL, shift, { waktu: "now() - interval '3 hours'" });
		expect(a.hasil.nomor).toMatch(/^BL-\d{6}-001$/);
		expect(b.hasil.nomor).toMatch(/-002$/);
		const ulang = await rpc<{ nomor: string; ulang: boolean }>(db, kasirBL, 'public.catat_penjualan_offline($1::jsonb)', [JSON.stringify(a.p)]);
		expect(ulang).toMatchObject({ nomor: a.hasil.nomor, ulang: true });
		const r = (await db.query<{ kode_struk: string; nomor_sementara: string; lama: boolean }>(
			`select kode_struk, nomor_sementara, waktu < now() - interval '50 minutes' as lama from public.penjualan where id = $1`, [a.p.id]
		)).rows[0];
		expect(r).toEqual({ kode_struk: 'K7Q2MX', nomor_sementara: 'S1-001', lama: true });
	});
	it('penjualan yang tiba setelah toko ditutup tetap masuk shift-nya dan ditandai', async () => {
		await tutup(kasirBL, crypto.randomUUID(), shift, 100000, "now() - interval '30 minutes'");
		await jual(kasirBL, shift, { waktu: "now() - interval '2 hours'", metode: 'cash', diterima: 20000 });
		const r = await rpc<{ jual_setelah_tutup: number; jumlah_transaksi: number }>(db, kasirBL, 'public.ringkasan_shift($1)', [shift]);
		expect(r).toMatchObject({ jual_setelah_tutup: 1, jumlah_transaksi: 1 });
	});
	it('penjualan berjam sebelum stok awal disetujui tidak memotong stok; sesudahnya memotong', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 2);
		await jual(kasirBL, shift, { waktu: "now() - interval '4 hours'" });
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(10);
		await jual(kasirBL, shift, { waktu: "now() - interval '1 hour'" });
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(9);
	});
	it('shift perangkat yang tidak dikenal → ditolak; kode struk salah → ditolak; harga dari server', async () => {
		await expect(jual(kasirBL, crypto.randomUUID())).rejects.toThrow(/Shift belum dibuka/);
		await expect(jual(kasirBL, shift, { kode: 'ab' })).rejects.toThrow(/Kode struk tidak sah/);
		const { hasil } = await jual(kasirBL, shift, { item: [['nasi', 2]] });
		expect(hasil.total).toBe(10000);
	});
	it('kasir outlet lain ditolak', async () => {
		await expect(jual(kasirTK, shift)).rejects.toThrow(/tidak berhak/);
	});
});

describe('rusak offline', () => {
	it('jam kejadian dipakai; sebelum stok awal → tanpa efek stok; kirim ulang sekali', async () => {
		await daftar(kasirBL, P1);
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 2);
		const kirim = async (id: string, waktu: string) => {
			const w = (await db.query<{ w: string }>(`select (${waktu})::text as w`)).rows[0].w;
			const p = { id, outlet_id: await idOutlet(db, 'BL'), alasan: 'sisa_tidak_laku', waktu: w, perangkat_id: P1, item: await isian(db, [['ori_dada', 2]]) };
			return rpc<string>(db, kasirBL, 'public.catat_rusak_offline($1::jsonb)', [JSON.stringify(p)]);
		};
		await kirim(crypto.randomUUID(), "now() - interval '3 hours'");
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(10);
		const id = crypto.randomUUID();
		await kirim(id, "now() - interval '1 hour'");
		await kirim(id, "now() - interval '1 hour'");
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(8);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/offline.test.ts`
Expected: FAIL — `function public.catat_penjualan_offline(jsonb) does not exist`.

- [ ] **Step 3: Implementasi (tambahkan ke akhir 0019)**

Tambahkan ke akhir `supabase/migrations/20261008000019_fungsi_offline.sql`:
```sql
create function public.catat_penjualan_offline(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid;
  v_shift uuid;
  v_metode public.metode_bayar;
  v_diterima integer;
  v_waktu timestamptz;
  v_kode_struk text;
  v_sementara text;
  v_perangkat uuid;
  v_ada public.penjualan;
  s public.shift;
  v_minta integer;
  v_cocok integer;
  v_qty_sah boolean;
  v_total integer;
  v_kembalian integer;
  v_kode text;
  v_urut integer;
  v_nomor text;
begin
  perform public._cek_akses_outlet(v_outlet);
  v_id := (p ->> 'id')::uuid;
  v_metode := (p ->> 'metode')::public.metode_bayar;
  v_diterima := (p ->> 'diterima')::integer;
  v_kode_struk := p ->> 'kode_struk';
  v_sementara := nullif(p ->> 'nomor_sementara', '');
  v_perangkat := (p ->> 'perangkat_id')::uuid;
  v_waktu := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  if v_id is null or v_metode is null then
    raise exception 'Data penjualan tidak lengkap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  select * into v_ada from public.penjualan where id = v_id;
  if found then
    if v_ada.outlet_id <> v_outlet then
      raise exception 'Penjualan tidak ditemukan' using errcode = '22023';
    end if;
    return jsonb_build_object('id', v_ada.id, 'nomor', v_ada.nomor, 'total', v_ada.total, 'kembalian', v_ada.kembalian,
      'waktu', v_ada.waktu, 'ulang', true, 'batal', v_ada.void_at is not null, 'kode_struk', v_ada.kode_struk);
  end if;
  if v_kode_struk is null or v_kode_struk !~ '^[0-9A-Z]{6}$' then
    raise exception 'Kode struk tidak sah' using errcode = '22023';
  end if;
  v_shift := public._shift_dari_perangkat((p ->> 'shift_id')::uuid);
  select * into s from public.shift where id = v_shift for share;
  if not found or s.outlet_id <> v_outlet then
    raise exception 'Shift belum dibuka' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'item') is distinct from 'array' or jsonb_array_length(p -> 'item') = 0 then
    raise exception 'Penjualan minimal satu item' using errcode = '22023';
  end if;
  with i as (
    select menu_id, sum(qty)::integer as qty, bool_and(coalesce(qty between 1 and 999, false)) as sah
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

  -- Nomor resmi: urut kedatangan per outlet per hari WIB (hari dari jam kejadian).
  select kode into v_kode from public.outlets where id = v_outlet;
  insert into public.nomor_harian (outlet_id, tanggal, terakhir)
  values (v_outlet, public.tanggal_wib(v_waktu), 1)
  on conflict (outlet_id, tanggal) do update set terakhir = public.nomor_harian.terakhir + 1
  returning terakhir into v_urut;
  v_nomor := v_kode || '-' || to_char(v_waktu at time zone interval '+07:00', 'YYMMDD') || '-' || lpad(v_urut::text, greatest(3, length(v_urut::text)), '0');

  insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, metode, total, diterima, kembalian,
    kode_struk, nomor_sementara, perangkat_id, tanpa_stok)
  values (v_id, v_outlet, s.id, auth.uid(), v_nomor, v_waktu, v_metode, v_total, v_diterima, v_kembalian,
    v_kode_struk, v_sementara, v_perangkat, coalesce(public._dihitung_terakhir(v_outlet) >= v_waktu, false));

  insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty)
  select v_id, m.id, m.nama, h.harga, sum(x.qty)::integer
  from jsonb_to_recordset(p -> 'item') as x (menu_id uuid, qty integer)
  join public.menu m on m.id = x.menu_id
  join public.harga_jual h on h.menu_id = m.id and h.outlet_id = v_outlet
  group by m.id, m.nama, h.harga;

  if s.ditutup_at is not null then
    update public.shift set jual_setelah_tutup = jual_setelah_tutup + 1 where id = s.id;
  end if;

  return jsonb_build_object('id', v_id, 'nomor', v_nomor, 'total', v_total, 'kembalian', v_kembalian,
    'waktu', v_waktu, 'ulang', false, 'batal', false, 'kode_struk', v_kode_struk);
end
$$;

create function public.catat_rusak_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid;
  v_alasan public.alasan_rusak;
  v_catatan text;
  v_waktu timestamptz;
  v_tanpa boolean;
begin
  perform public._cek_akses_outlet(v_outlet);
  v_id := (p ->> 'id')::uuid;
  v_alasan := (p ->> 'alasan')::public.alasan_rusak;
  v_catatan := nullif(trim(coalesce(p ->> 'catatan', '')), '');
  v_waktu := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  if v_id is null or v_alasan is null then
    raise exception 'Data rusak tidak lengkap' using errcode = '22023';
  end if;
  perform public._kunci_stok(v_outlet);
  if exists (select 1 from public.rusak where id = v_id) then
    if not exists (select 1 from public.rusak where id = v_id and outlet_id = v_outlet) then
      raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
    end if;
    return v_id;
  end if;
  if v_alasan = 'lainnya' and (v_catatan is null or length(v_catatan) < 3) then
    raise exception 'Catatan wajib diisi untuk alasan lainnya (3–200 karakter)' using errcode = '22023';
  end if;
  if v_catatan is not null and length(v_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._cek_isian_positif(p -> 'item');
  v_tanpa := coalesce(public._dihitung_terakhir(v_outlet) >= v_waktu, false);
  insert into public.rusak (id, outlet_id, waktu, alasan, catatan, dicatat_oleh, perangkat_id, tanpa_stok)
  values (v_id, v_outlet, v_waktu, v_alasan, v_catatan, auth.uid(), (p ->> 'perangkat_id')::uuid, v_tanpa);
  insert into public.rusak_item (rusak_id, bahan_id, qty)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric);
  if not v_tanpa then
    insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, rusak_id)
    select v_outlet, i.bahan_id, -i.qty, 'rusak', v_waktu, auth.uid(), v_id from public.rusak_item i where i.rusak_id = v_id;
  end if;
  return v_id;
end
$$;

revoke execute on function public.catat_penjualan_offline(jsonb) from public, anon;
revoke execute on function public.catat_rusak_offline(jsonb) from public, anon;
grant execute on function public.catat_penjualan_offline(jsonb) to authenticated;
grant execute on function public.catat_rusak_offline(jsonb) to authenticated;
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/db`
Expected: PASS semua.

- [ ] **Step 5: Mutasi cepat**

Ganti sementara `coalesce(public._dihitung_terakhir(v_outlet) >= v_waktu, false)` (penjualan) dengan `false` → tes "sebelum stok awal" harus FAIL; hapus sementara blok `if s.ditutup_at is not null then update ...` → tes "setelah toko ditutup" harus FAIL; kembalikan.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261008000019_fungsi_offline.sql tests/db/offline.test.ts
git commit -m "feat(offline): jualan & rusak dari perangkat — jam kejadian, kode struk, nomor resmi saat sinkron, tanpa potong stok sebelum hitungan"
```

---

### Task 4: Penyimpanan perangkat & mesin antrean

**Files:**
- Create: `src/lib/offline/db.ts`, `src/lib/offline/antrean.ts`, `src/lib/offline/salinan.ts`, `src/lib/offline/perangkat.ts`, `src/lib/offline/nomor.ts`, `src/lib/offline/pesan.ts`
- Test: `src/lib/offline/antrean.test.ts`, `src/lib/offline/salinan.test.ts`, `src/lib/offline/perangkat.test.ts`, `src/lib/offline/nomor.test.ts`, `src/lib/offline/pesan.test.ts`
- Modify: `package.json` (dexie, fake-indexeddb)

**Interfaces:**
- Produces:
  - `db.ts`: `type JenisKejadian = 'buka_shift' | 'jual' | 'tutup_shift' | 'rusak'`; `interface Kejadian { urut?: number; id: string; jenis; outlet_id: string; shift_id: string | null; waktu: string; data: Record<string, unknown>; status: 'menunggu' | 'ditolak' | 'terkirim'; alasan: string | null; percobaan: number; hasil: unknown; terkirim_at: string | null }`; `interface Salinan { kunci: string; nilai: unknown; disimpan_at: string }`; `class DbKasir extends Dexie { kejadian; salinan }`; `bukaDb(nama = 'dk-kasir'): DbKasir`.
  - `antrean.ts`: `class GalatKirim extends Error { jaringan: boolean }`; `interface Pengirim { kirim(k: Kejadian): Promise<unknown> }`; `tambahKejadian(db, k: Pick<Kejadian,'id'|'jenis'|'outlet_id'|'shift_id'|'waktu'|'data'>)`; `kirimAntrean(db, pengirim): Promise<{ terkirim: number; ditolak: number; berhenti: 'selesai' | 'jaringan' }>`; `cobaLagi(db, id)`; `hitungAntrean(db): Promise<{ menunggu: number; ditolak: number }>`; `bersihkanTerkirim(db, sebelum: Date)`; `ubahDataMenunggu(db, id, patch): Promise<boolean>`.
  - `salinan.ts`: `simpanSalinan(db, kunci, nilai)`, `bacaSalinan<T>(db, kunci): Promise<T | null>`, `denganSalinan<T>(db, kunci, ambil: () => Promise<T>, jaringan: (e: unknown) => boolean): Promise<{ nilai: T; dariSalinan: boolean }>`.
  - `perangkat.ts`: `interface Perangkat { id: string; kode: number | null }`, `bacaPerangkat(s: Penyimpan): Perangkat`, `simpanKode(s, kode)`.
  - `nomor.ts`: `kodeStruk(id: string): string` (6 karakter dari `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`), `nomorSementara(kode: number, urut: number): string`, `ambilUrutSementara(s: Penyimpan, tanggal: string): number`.
  - `pesan.ts`: `pesanSinkron(err): string` — pesan resmi kasir/stok/0019 apa adanya, selainnya pesan umum.

- [ ] **Step 1: Pasang dependensi**

Run: `npm install dexie@^4 && npm install -D fake-indexeddb@^6`
Expected: `package.json` memuat `dexie` (dependencies) dan `fake-indexeddb` (devDependencies).

- [ ] **Step 2: Tes (gagal dulu)**

`src/lib/offline/antrean.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cobaLagi, GalatKirim, hitungAntrean, kirimAntrean, tambahKejadian, ubahDataMenunggu, type Pengirim } from './antrean';
import { bukaDb, type DbKasir, type Kejadian } from './db';

let db: DbKasir;
beforeEach(async () => {
	db = bukaDb(`uji-${crypto.randomUUID()}`);
});

const k = (id: string, jenis: Kejadian['jenis'], shift: string | null = 's1') => ({ id, jenis, outlet_id: 'o', shift_id: shift, waktu: '2026-10-08T01:00:00Z', data: {} });

function pengirim(aturan: Record<string, 'ok' | 'tolak' | 'putus'>): Pengirim & { dikirim: string[] } {
	const dikirim: string[] = [];
	return {
		dikirim,
		async kirim(x) {
			dikirim.push(x.id);
			const a = aturan[x.id] ?? 'ok';
			if (a === 'tolak') throw new GalatKirim('Shift sudah ditutup.', false);
			if (a === 'putus') throw new GalatKirim('Tidak bisa terhubung.', true);
			return { ok: x.id };
		}
	};
}

describe('antrean kejadian', () => {
	it('dikirim berurutan sesuai urutan dibuat; hasil disimpan; tidak dikirim dua kali', async () => {
		await tambahKejadian(db, k('a', 'buka_shift'));
		await tambahKejadian(db, k('b', 'jual'));
		await tambahKejadian(db, k('c', 'tutup_shift'));
		const p = pengirim({});
		expect(await kirimAntrean(db, p)).toEqual({ terkirim: 3, ditolak: 0, berhenti: 'selesai' });
		expect(p.dikirim).toEqual(['a', 'b', 'c']);
		await kirimAntrean(db, p);
		expect(p.dikirim).toEqual(['a', 'b', 'c']);
		expect((await db.kejadian.where('id').equals('b').first())?.hasil).toEqual({ ok: 'b' });
	});
	it('galat jaringan: berhenti, sisanya tetap menunggu, urutan terjaga', async () => {
		await tambahKejadian(db, k('a', 'jual'));
		await tambahKejadian(db, k('b', 'jual'));
		const p = pengirim({ a: 'putus' });
		expect((await kirimAntrean(db, p)).berhenti).toBe('jaringan');
		expect(p.dikirim).toEqual(['a']);
		expect(await hitungAntrean(db)).toEqual({ menunggu: 2, ditolak: 0 });
	});
	it('ditolak server: ke Perlu perhatian dengan alasan; antrean lanjut', async () => {
		await tambahKejadian(db, k('a', 'jual', 's1'));
		await tambahKejadian(db, k('b', 'jual', 's2'));
		const p = pengirim({ a: 'tolak' });
		expect(await kirimAntrean(db, p)).toEqual({ terkirim: 1, ditolak: 1, berhenti: 'selesai' });
		const a = await db.kejadian.where('id').equals('a').first();
		expect(a).toMatchObject({ status: 'ditolak', alasan: 'Shift sudah ditutup.' });
	});
	it('buka toko ditolak → kejadian shift itu ikut tertahan; coba lagi melepas semuanya', async () => {
		await tambahKejadian(db, k('buka', 'buka_shift', 's1'));
		await tambahKejadian(db, k('j1', 'jual', 's1'));
		await tambahKejadian(db, k('lain', 'jual', 's9'));
		await kirimAntrean(db, pengirim({ buka: 'tolak' }));
		expect((await db.kejadian.where('id').equals('j1').first())).toMatchObject({ status: 'ditolak', alasan: expect.stringMatching(/^Menunggu: buka toko/) });
		expect((await db.kejadian.where('id').equals('lain').first())?.status).toBe('terkirim');
		await cobaLagi(db, 'buka');
		expect(await hitungAntrean(db)).toEqual({ menunggu: 2, ditolak: 0 });
		const p = pengirim({});
		await kirimAntrean(db, p);
		expect(p.dikirim).toEqual(['buka', 'j1']);
	});
	it('kejadian baru di shift yang buka-nya sedang ditolak langsung ikut tertahan saat dikirim', async () => {
		await tambahKejadian(db, k('buka', 'buka_shift', 's1'));
		await kirimAntrean(db, pengirim({ buka: 'tolak' }));
		await tambahKejadian(db, k('j2', 'jual', 's1'));
		const p = pengirim({});
		await kirimAntrean(db, p);
		expect(p.dikirim).toEqual([]);
		expect((await db.kejadian.where('id').equals('j2').first())?.status).toBe('ditolak');
	});
	it('data kejadian yang masih menunggu bisa diubah; yang sudah terkirim tidak', async () => {
		await tambahKejadian(db, k('a', 'jual'));
		expect(await ubahDataMenunggu(db, 'a', { nomor_sementara: 'S1-001' })).toBe(true);
		expect((await db.kejadian.where('id').equals('a').first())?.data).toEqual({ nomor_sementara: 'S1-001' });
		await kirimAntrean(db, pengirim({}));
		expect(await ubahDataMenunggu(db, 'a', { x: 1 })).toBe(false);
	});
});
```

`src/lib/offline/salinan.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { bukaDb } from './db';
import { bacaSalinan, denganSalinan } from './salinan';

const jaringan = (e: unknown) => (e as Error).message === 'putus';

describe('denganSalinan', () => {
	it('online: ambil dari server lalu simpan', async () => {
		const db = bukaDb(`uji-${crypto.randomUUID()}`);
		expect(await denganSalinan(db, 'menu:o', async () => [1, 2], jaringan)).toEqual({ nilai: [1, 2], dariSalinan: false });
		expect(await bacaSalinan(db, 'menu:o')).toEqual([1, 2]);
	});
	it('jaringan putus: pakai salinan terakhir', async () => {
		const db = bukaDb(`uji-${crypto.randomUUID()}`);
		await denganSalinan(db, 'menu:o', async () => [1], jaringan);
		expect(await denganSalinan(db, 'menu:o', async () => { throw new Error('putus'); }, jaringan)).toEqual({ nilai: [1], dariSalinan: true });
	});
	it('jaringan putus tanpa salinan, atau galat bukan jaringan → galat diteruskan', async () => {
		const db = bukaDb(`uji-${crypto.randomUUID()}`);
		await expect(denganSalinan(db, 'x', async () => { throw new Error('putus'); }, jaringan)).rejects.toThrow('putus');
		await denganSalinan(db, 'y', async () => 1, jaringan);
		await expect(denganSalinan(db, 'y', async () => { throw new Error('izin'); }, jaringan)).rejects.toThrow('izin');
	});
});
```

`src/lib/offline/perangkat.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { bacaPerangkat, simpanKode } from './perangkat';

function memori() {
	const isi = new Map<string, string>();
	return { getItem: (k: string) => isi.get(k) ?? null, setItem: (k: string, v: string) => void isi.set(k, v), removeItem: (k: string) => void isi.delete(k) };
}

describe('perangkat', () => {
	it('id dibuat sekali lalu tetap; kode tersimpan', () => {
		const s = memori();
		const a = bacaPerangkat(s);
		expect(a.kode).toBeNull();
		expect(bacaPerangkat(s).id).toBe(a.id);
		simpanKode(s, 7);
		expect(bacaPerangkat(s)).toEqual({ id: a.id, kode: 7 });
	});
});
```

`src/lib/offline/nomor.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ambilUrutSementara, kodeStruk, nomorSementara } from './nomor';

function memori() {
	const isi = new Map<string, string>();
	return { getItem: (k: string) => isi.get(k) ?? null, setItem: (k: string, v: string) => void isi.set(k, v), removeItem: (k: string) => void isi.delete(k) };
}

describe('kode struk & nomor sementara', () => {
	it('kode struk: 6 karakter tanpa 0/1/I/O, tetap untuk id yang sama, berbeda untuk id lain', () => {
		const a = kodeStruk('8f14e45f-ceea-467a-9e2b-1b2a3c4d5e6f');
		expect(a).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
		expect(kodeStruk('8f14e45f-ceea-467a-9e2b-1b2a3c4d5e6f')).toBe(a);
		expect(kodeStruk('00000000-0000-4000-8000-000000000001')).not.toBe(a);
	});
	it('nomor sementara S<kode>-NNN; urut per hari per perangkat', () => {
		expect(nomorSementara(3, 7)).toBe('S3-007');
		const s = memori();
		expect(ambilUrutSementara(s, '2026-10-08')).toBe(1);
		expect(ambilUrutSementara(s, '2026-10-08')).toBe(2);
		expect(ambilUrutSementara(s, '2026-10-09')).toBe(1);
	});
});
```

`src/lib/offline/pesan.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pesanSinkron } from './pesan';

const sql = readFileSync(join(import.meta.dirname, '../../../supabase/migrations/20261008000019_fungsi_offline.sql'), 'utf8');
const resmi = [...sql.matchAll(/raise exception '([^'%]+)' using errcode = '(\d+)'/g)].map((m) => ({ message: m[1], code: m[2] }));

describe('pesanSinkron', () => {
	it('pesan resmi fungsi offline diteruskan apa adanya', () => {
		expect(resmi.length).toBeGreaterThanOrEqual(15);
		for (const e of resmi) expect(pesanSinkron(e)).toBe(`${e.message}.`);
	});
	it('pesan stok & kasir lama juga diteruskan; pesan mentah tidak', () => {
		expect(pesanSinkron({ code: '22023', message: 'Transfer sudah dibatalkan oleh pengirim' })).toBe('Transfer sudah dibatalkan oleh pengirim.');
		expect(pesanSinkron({ code: '22023', message: 'cannot extract elements from a scalar' })).toBe('Isian tidak sah.');
	});
});
```

- [ ] **Step 3: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/offline`
Expected: FAIL — modul belum ada.

- [ ] **Step 4: Implementasi**

`src/lib/offline/db.ts`:
```ts
// Penyimpanan di perangkat (IndexedDB): salinan data server & antrean kejadian kasir.
import Dexie, { type Table } from 'dexie';

export type JenisKejadian = 'buka_shift' | 'jual' | 'tutup_shift' | 'rusak';

export interface Kejadian {
	urut?: number;
	id: string;
	jenis: JenisKejadian;
	outlet_id: string;
	/** id shift perangkat; kejadian satu shift tertahan bila buka-nya ditolak. */
	shift_id: string | null;
	/** Jam kejadian di perangkat (ISO). */
	waktu: string;
	data: Record<string, unknown>;
	status: 'menunggu' | 'ditolak' | 'terkirim';
	alasan: string | null;
	percobaan: number;
	hasil: unknown;
	terkirim_at: string | null;
}

export interface Salinan {
	kunci: string;
	nilai: unknown;
	disimpan_at: string;
}

export class DbKasir extends Dexie {
	kejadian!: Table<Kejadian, number>;
	salinan!: Table<Salinan, string>;
	constructor(nama: string) {
		super(nama);
		this.version(1).stores({ kejadian: '++urut, &id, status, jenis, shift_id, outlet_id', salinan: '&kunci' });
	}
}

export function bukaDb(nama = 'dk-kasir'): DbKasir {
	return new DbKasir(nama);
}
```

`src/lib/offline/antrean.ts`:
```ts
// Antrean kejadian kasir: dikirim berurutan, persis sekali (server idempoten per id).
import type { DbKasir, Kejadian } from './db.ts';

export class GalatKirim extends Error {
	constructor(
		pesan: string,
		/** true: jaringan/sesi bermasalah → berhenti & coba lagi nanti. false: ditolak server. */
		readonly jaringan: boolean
	) {
		super(pesan);
	}
}

export interface Pengirim {
	kirim(k: Kejadian): Promise<unknown>;
}

const TERTAHAN = 'Menunggu: buka toko untuk shift ini ditolak. Selesaikan itu dulu.';

export async function tambahKejadian(db: DbKasir, k: Pick<Kejadian, 'id' | 'jenis' | 'outlet_id' | 'shift_id' | 'waktu' | 'data'>): Promise<void> {
	await db.kejadian.add({ ...k, status: 'menunggu', alasan: null, percobaan: 0, hasil: null, terkirim_at: null });
}

async function bukaDitolak(db: DbKasir, shiftId: string | null): Promise<boolean> {
	if (!shiftId) return false;
	return (await db.kejadian.where('shift_id').equals(shiftId).filter((x) => x.jenis === 'buka_shift' && x.status === 'ditolak').count()) > 0;
}

export async function kirimAntrean(db: DbKasir, pengirim: Pengirim): Promise<{ terkirim: number; ditolak: number; berhenti: 'selesai' | 'jaringan' }> {
	let terkirim = 0;
	let ditolak = 0;
	for (;;) {
		const k = (await db.kejadian.where('status').equals('menunggu').sortBy('urut'))[0];
		if (!k) return { terkirim, ditolak, berhenti: 'selesai' };
		if (k.jenis !== 'buka_shift' && (await bukaDitolak(db, k.shift_id))) {
			await db.kejadian.update(k.urut!, { status: 'ditolak', alasan: TERTAHAN });
			ditolak++;
			continue;
		}
		try {
			const hasil = await pengirim.kirim(k);
			await db.kejadian.update(k.urut!, { status: 'terkirim', hasil, terkirim_at: new Date().toISOString(), alasan: null });
			terkirim++;
		} catch (e) {
			const g = e instanceof GalatKirim ? e : new GalatKirim((e as Error)?.message ?? 'Galat', true);
			if (g.jaringan) {
				await db.kejadian.update(k.urut!, { percobaan: k.percobaan + 1 });
				return { terkirim, ditolak, berhenti: 'jaringan' };
			}
			await db.kejadian.update(k.urut!, { status: 'ditolak', alasan: g.message, percobaan: k.percobaan + 1 });
			ditolak++;
			if (k.jenis === 'buka_shift' && k.shift_id) {
				await db.kejadian
					.where('shift_id')
					.equals(k.shift_id)
					.filter((x) => x.status === 'menunggu')
					.modify({ status: 'ditolak', alasan: TERTAHAN });
			}
		}
	}
}

/** Kejadian ditolak dikirim ulang; bila buka toko, kejadian yang tertahan karenanya ikut dilepas. */
export async function cobaLagi(db: DbKasir, id: string): Promise<void> {
	const k = await db.kejadian.where('id').equals(id).first();
	if (!k || k.status !== 'ditolak') return;
	await db.kejadian.update(k.urut!, { status: 'menunggu', alasan: null });
	if (k.jenis === 'buka_shift' && k.shift_id) {
		await db.kejadian
			.where('shift_id')
			.equals(k.shift_id)
			.filter((x) => x.status === 'ditolak' && x.alasan === TERTAHAN)
			.modify({ status: 'menunggu', alasan: null });
	}
}

export async function hitungAntrean(db: DbKasir): Promise<{ menunggu: number; ditolak: number }> {
	return {
		menunggu: await db.kejadian.where('status').equals('menunggu').count(),
		ditolak: await db.kejadian.where('status').equals('ditolak').count()
	};
}

/** Ubah data kejadian yang belum terkirim (mis. menambah nomor sementara). */
export async function ubahDataMenunggu(db: DbKasir, id: string, patch: Record<string, unknown>): Promise<boolean> {
	const k = await db.kejadian.where('id').equals(id).first();
	if (!k || k.status !== 'menunggu') return false;
	await db.kejadian.update(k.urut!, { data: { ...k.data, ...patch } });
	return true;
}

export async function bersihkanTerkirim(db: DbKasir, sebelum: Date): Promise<void> {
	await db.kejadian
		.where('status')
		.equals('terkirim')
		.filter((x) => !!x.terkirim_at && new Date(x.terkirim_at) < sebelum)
		.delete();
}
```

`src/lib/offline/salinan.ts`:
```ts
import type { DbKasir } from './db.ts';

export async function simpanSalinan(db: DbKasir, kunci: string, nilai: unknown): Promise<void> {
	await db.salinan.put({ kunci, nilai, disimpan_at: new Date().toISOString() });
}

export async function bacaSalinan<T>(db: DbKasir, kunci: string): Promise<T | null> {
	return ((await db.salinan.get(kunci))?.nilai as T | undefined) ?? null;
}

/** Ambil dari server dan simpan; bila jaringan putus pakai salinan terakhir. */
export async function denganSalinan<T>(
	db: DbKasir,
	kunci: string,
	ambil: () => Promise<T>,
	jaringan: (e: unknown) => boolean
): Promise<{ nilai: T; dariSalinan: boolean }> {
	try {
		const nilai = await ambil();
		await simpanSalinan(db, kunci, nilai);
		return { nilai, dariSalinan: false };
	} catch (e) {
		if (!jaringan(e)) throw e;
		const s = await db.salinan.get(kunci);
		if (!s) throw e;
		return { nilai: s.nilai as T, dariSalinan: true };
	}
}
```

`src/lib/offline/perangkat.ts`:
```ts
import type { Penyimpan } from '#lib/auth/cache-profil.ts';

export interface Perangkat {
	id: string;
	kode: number | null;
}

const KUNCI = 'dk-perangkat';

/** Identitas perangkat ini: dibuat sekali, tetap selama penyimpanan browser tidak dihapus. */
export function bacaPerangkat(s: Penyimpan): Perangkat {
	try {
		const ada = JSON.parse(s.getItem(KUNCI) ?? 'null') as Perangkat | null;
		if (ada?.id) return ada;
	} catch {
		// rusak → buat baru
	}
	const baru: Perangkat = { id: crypto.randomUUID(), kode: null };
	try {
		s.setItem(KUNCI, JSON.stringify(baru));
	} catch {
		// penyimpanan diblokir: id hanya berlaku di sesi ini
	}
	return baru;
}

export function simpanKode(s: Penyimpan, kode: number): void {
	const p = bacaPerangkat(s);
	try {
		s.setItem(KUNCI, JSON.stringify({ ...p, kode }));
	} catch {
		// abaikan
	}
}
```

`src/lib/offline/nomor.ts`:
```ts
import type { Penyimpan } from '#lib/auth/cache-profil.ts';

// Tanpa 0/1/I/O supaya tidak tertukar saat dibacakan pelanggan.
const ALFABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Kode struk 6 karakter dari id transaksi (tetap untuk id yang sama). */
export function kodeStruk(id: string): string {
	const hex = id.replace(/-/g, '');
	let n = BigInt(`0x${hex.slice(0, 15)}`);
	let s = '';
	for (let i = 0; i < 6; i++) {
		s += ALFABET[Number(n % 32n)];
		n /= 32n;
	}
	return s;
}

export function nomorSementara(kode: number, urut: number): string {
	return `S${kode}-${String(urut).padStart(3, '0')}`;
}

/** Urutan nomor sementara per perangkat per hari (WIB). */
export function ambilUrutSementara(s: Penyimpan, tanggal: string): number {
	const kunci = `dk-urut-${tanggal}`;
	let n = 0;
	try {
		n = Number(s.getItem(kunci) ?? '0') || 0;
	} catch {
		// abaikan
	}
	n++;
	try {
		s.setItem(kunci, String(n));
	} catch {
		// abaikan
	}
	return n;
}
```

`src/lib/offline/pesan.ts`:
```ts
import { pesanKasir } from '#lib/kasir/pesan.ts';
import { pesanStok } from '#lib/stok/pesan.ts';

// Pesan resmi fungsi offline (migrasi 0019) yang belum ada di allowlist kasir/stok.
const PESAN_OFFLINE = /^(Data perangkat tidak lengkap|Data shift tidak lengkap|Toko kemarin belum ditutup|Kode struk tidak sah)/;

type Galat = { code?: string; message?: string; status?: number; name?: string } | null;

/** Alasan penolakan untuk daftar "Perlu perhatian". */
export function pesanSinkron(err: Galat): string {
	const msg = err?.message ?? '';
	if ((err?.code === '22023' || err?.code === '42501') && PESAN_OFFLINE.test(msg)) return msg.endsWith('.') ? msg : `${msg}.`;
	const k = pesanKasir(err);
	if (k && k !== 'Isian tidak sah.') return k;
	return pesanStok(err) ?? 'Terjadi kesalahan.';
}
```

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx vitest run src/lib/offline && npm run check`
Expected: PASS; 0 errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/offline
git commit -m "feat(offline): penyimpanan perangkat (Dexie), antrean kejadian berurutan, kode struk & nomor sementara"
```

---

### Task 5: Sesi offline saat aplikasi dibuka ulang & pendaftaran perangkat

**Files:**
- Create: `src/lib/auth/sesi-tersimpan.ts`
- Modify: `src/lib/auth/auth-state.svelte.ts`
- Test: `src/lib/auth/sesi-tersimpan.test.ts`, `src/lib/auth/auth-state.test.ts`

**Interfaces:**
- Consumes: `bacaCache`, `hapusCache`, `galatJaringan`, `Penyimpan`.
- Produces: `userTersimpan(s: Penyimpan): string | null` (id pengguna dari sesi auth `dk-auth`); `AuthState` — saat `INITIAL_SESSION` null tetapi sesi & profil tersimpan ada → `status 'ready'`, `offline true`; `cobaLagi()` pada keadaan itu memanggil `auth.getSession()`; sesi didapat → dimuat normal; tidak ada sesi tanpa galat jaringan → keluar.

- [ ] **Step 1: Tes (gagal dulu)**

`src/lib/auth/sesi-tersimpan.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { userTersimpan } from './sesi-tersimpan';

const s = (isi: string | null) => ({ getItem: () => isi, setItem: () => {}, removeItem: () => {} });

describe('userTersimpan', () => {
	it('membaca id pengguna dari sesi auth tersimpan', () => {
		expect(userTersimpan(s(JSON.stringify({ access_token: 'x', refresh_token: 'y', user: { id: 'u1' } })))).toBe('u1');
	});
	it('tidak ada / rusak / tanpa refresh token → null', () => {
		expect(userTersimpan(s(null))).toBeNull();
		expect(userTersimpan(s('{rusak'))).toBeNull();
		expect(userTersimpan(s(JSON.stringify({ user: { id: 'u1' } })))).toBeNull();
	});
});
```

Tambahkan ke `src/lib/auth/auth-state.test.ts`, di dalam `describe('Tahap 2: tetap bekerja saat internet putus', ...)` sebelum penutupnya (memakai `memori`, `kasir`, `outlet`, `sesi`, `clientPalsu` yang sudah ada), dan ubah `clientPalsu` agar `auth` juga punya `getSession` yang bisa diatur:

Ganti di `clientPalsu`:
```ts
			signOut,
			signInWithPassword: vi.fn(async () => ({ data: {}, error: null }))
```
menjadi:
```ts
			signOut,
			signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
			getSession: vi.fn(async () => ({ data: { session: null as Session | null }, error: null as unknown }))
```
dan tambahkan `getSession: client.auth.getSession,` ke objek yang dikembalikan `clientPalsu`.

Tes baru:
```ts
	it('dibuka ulang offline dengan token kedaluwarsa (sesi null) tapi sesi & profil tersimpan → tetap masuk, offline', async () => {
		const f = clientPalsu();
		const s = memori();
		s.setItem('dk-auth', JSON.stringify({ refresh_token: 'r', user: { id: 'u1' } }));
		s.setItem('dk-profil', JSON.stringify({ userId: 'u1', profile: kasir, outlet }));
		const a = new AuthState(f.client, s);
		a.start();
		f.emit(null);
		await vi.waitFor(() => expect(a.status).toBe('ready'));
		expect(a.offline).toBe(true);
		expect(a.outlet?.kode).toBe('BL');
	});
	it('online lagi: cobaLagi mengambil sesi baru lalu memuat profil dari server', async () => {
		const f = clientPalsu();
		const s = memori();
		s.setItem('dk-auth', JSON.stringify({ refresh_token: 'r', user: { id: 'u1' } }));
		s.setItem('dk-profil', JSON.stringify({ userId: 'u1', profile: kasir, outlet }));
		const a = new AuthState(f.client, s);
		a.start();
		f.emit(null);
		await vi.waitFor(() => expect(a.offline).toBe(true));
		f.getSession.mockResolvedValueOnce({ data: { session: sesi('u1') }, error: null });
		a.cobaLagi();
		await f.jawab('profiles', { data: kasir, error: null });
		await f.jawab('outlets', { data: outlet, error: null });
		await vi.waitFor(() => expect(a.offline).toBe(false));
	});
	it('online lagi tapi sesi dicabut di server → keluar', async () => {
		const f = clientPalsu();
		const s = memori();
		s.setItem('dk-auth', JSON.stringify({ refresh_token: 'r', user: { id: 'u1' } }));
		s.setItem('dk-profil', JSON.stringify({ userId: 'u1', profile: kasir, outlet }));
		const a = new AuthState(f.client, s);
		a.start();
		f.emit(null);
		await vi.waitFor(() => expect(a.offline).toBe(true));
		f.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
		a.cobaLagi();
		await vi.waitFor(() => expect(a.status).toBe('guest'));
	});
	it('setelah Keluar (cache & sesi dihapus) tidak bisa masuk offline', async () => {
		const f = clientPalsu();
		const a = new AuthState(f.client, memori());
		a.start();
		f.emit(null);
		await vi.waitFor(() => expect(a.status).toBe('guest'));
	});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/auth`
Expected: FAIL — `./sesi-tersimpan` belum ada; tes cold start: status `guest`.

- [ ] **Step 3: Implementasi**

`src/lib/auth/sesi-tersimpan.ts`:
```ts
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
```

Di `src/lib/auth/auth-state.svelte.ts`:
1. Tambah impor `import { userTersimpan } from './sesi-tersimpan.ts';`
2. Ganti blok awal `#apply`:
```ts
		if (!session) {
			if (this.#penyimpan) hapusCache(this.#penyimpan);
			this.offline = false;
			this.profile = null;
			this.outlet = null;
			this.status = 'guest';
			return;
		}
```
menjadi:
```ts
		if (!session) {
			// Dibuka ulang offline dengan token kedaluwarsa: auth-js memberi null walau sesi masih tersimpan.
			const uid = this.#penyimpan ? userTersimpan(this.#penyimpan) : null;
			const cache = uid && this.#penyimpan ? bacaCache(this.#penyimpan, uid) : null;
			if (cache) {
				this.profile = cache.profile;
				this.outlet = cache.outlet;
				this.offline = true;
				this.#dingin = true;
				this.status = 'ready';
				return;
			}
			if (this.#penyimpan) hapusCache(this.#penyimpan);
			this.offline = false;
			this.profile = null;
			this.outlet = null;
			this.status = 'guest';
			return;
		}
		this.#dingin = false;
```
3. Tambah field `#dingin = false;` (di bawah `#sesiTerakhir`).
4. Ganti `cobaLagi()` menjadi:
```ts
	cobaLagi() {
		// Hanya memulihkan saat sedang offline; tidak pernah menghidupkan lagi sesi yang sudah Keluar.
		if (!this.offline) return;
		const gen = ++this.#gen;
		if (this.#sesiTerakhir) {
			const sesi = this.#sesiTerakhir;
			setTimeout(() => void this.#apply(sesi, gen), 0);
			return;
		}
		if (!this.#dingin) return;
		setTimeout(async () => {
			const { data, error } = await this.#client.auth.getSession();
			if (gen !== this.#gen) return;
			if (data.session) return void this.#apply(data.session, gen);
			if (error && galatJaringan(error as { message?: string; status?: number; name?: string })) return;
			this.#keluarLokal('Sesi berakhir. Silakan masuk lagi.');
		}, 0);
	}
```
5. Di `#keluarLokal`, tambahkan `this.#dingin = false;`.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src/lib/auth && npm run check`
Expected: PASS; 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth
git commit -m "feat(offline): aplikasi tetap terbuka offline walau token kedaluwarsa; sesi diperbarui saat online"
```

---

### Task 6: Proyeksi lokal, pengirim RPC, sinkron, struk berkode

**Files:**
- Create: `src/lib/offline/proyeksi.ts`, `src/lib/offline/pengirim.ts`, `src/lib/offline/sinkron.svelte.ts`
- Modify: `src/lib/kasir/struk.ts`, `src/lib/kasir/types.ts`, `src/lib/kasir/api.ts`
- Test: `src/lib/offline/proyeksi.test.ts`, `src/lib/kasir/struk.test.ts`

**Interfaces:**
- Consumes: Task 4 (`DbKasir`, `Kejadian`, `kirimAntrean`, `hitungAntrean`, `GalatKirim`, `pesanSinkron`, `bacaPerangkat`), `galatJaringan`, `Shift`, `Ringkasan`, `PenjualanRiwayat`, `MenuJual`.
- Produces:
  - `proyeksi.ts`: `shiftLokal(server: Shift | null, kejadian: Kejadian[], outletId: string): Shift | null`; `interface PenjualanLokal extends PenjualanRiwayat { kode_struk: string | null; nomor_sementara: string | null; status_kirim: 'menunggu' | 'ditolak' | 'terkirim' | 'server'; alasan: string | null }`; `gabungRiwayat(server: PenjualanRiwayat[], kejadian: Kejadian[], shiftId: string): PenjualanLokal[]`; `ringkasanLokal(dasar: Ringkasan | null, shift: Shift, lokal: PenjualanLokal[]): Ringkasan`; `cocokCari(p: PenjualanLokal, q: string): boolean`.
  - `pengirim.ts`: `pengirimSupabase(perangkatId: string): Pengirim` (`buka_shift` → `buka_shift_offline`, `jual` → `catat_penjualan_offline`, `tutup_shift` → `tutup_shift_offline`, `rusak` → `catat_rusak_offline`); galat jaringan/sesi → `GalatKirim(…, true)`.
  - `sinkron.svelte.ts`: `export const dbKasir`, `export const sinkron` dengan `menunggu`, `ditolak`, `sedang`, `terakhir: string | null`, `online`, `jalankan(): Promise<void>`, `segarkan(): Promise<void>`, `mulai(perangkatId)`.
  - `struk.ts`: `DataStruk` + `kodeStruk?: string | null`, `nomorSementara?: string | null`; baris `Kode: XXXXXX` dan (bila ada) `No. sementara: S1-012`.
  - `types.ts`: `PenjualanRiwayat` + `kode_struk?`, `nomor_sementara?`, `dicatat_at?`, `perangkat_id?`.
  - `api.ts`: `daftarPenjualanShift` memilih `kode_struk, nomor_sementara, dicatat_at, perangkat_id`.

- [ ] **Step 1: Tes (gagal dulu)**

`src/lib/offline/proyeksi.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Kejadian } from './db';
import { cocokCari, gabungRiwayat, ringkasanLokal, shiftLokal } from './proyeksi';

const kej = (x: Partial<Kejadian> & Pick<Kejadian, 'id' | 'jenis'>): Kejadian => ({
	outlet_id: 'o',
	shift_id: 's1',
	waktu: '2026-10-08T03:00:00Z',
	data: {},
	status: 'menunggu',
	alasan: null,
	percobaan: 0,
	hasil: null,
	terkirim_at: null,
	...x
});
const serverShift = { id: 'srv', outlet_id: 'o', dibuka_at: '2026-10-08T00:00:00Z', modal: 100000, ditutup_at: null };

describe('shiftLokal', () => {
	it('tanpa kejadian → shift server', () => {
		expect(shiftLokal(serverShift, [], 'o')).toEqual(serverShift);
	});
	it('buka di perangkat (belum terkirim) → shift lokal dengan id perangkat', () => {
		const k = [kej({ id: 'b', jenis: 'buka_shift', shift_id: 'dev1', data: { modal: 50000 } })];
		expect(shiftLokal(null, k, 'o')).toMatchObject({ id: 'dev1', modal: 50000, ditutup_at: null });
	});
	it('tutup di perangkat → tidak ada shift terbuka walau server masih terbuka', () => {
		const k = [kej({ id: 't', jenis: 'tutup_shift', shift_id: 'srv' })];
		expect(shiftLokal(serverShift, k, 'o')).toBeNull();
	});
	it('buka lalu tutup lalu buka lagi → shift terakhir', () => {
		const k = [
			kej({ id: 'b1', jenis: 'buka_shift', shift_id: 'd1', data: { modal: 1 } }),
			kej({ id: 't1', jenis: 'tutup_shift', shift_id: 'd1' }),
			kej({ id: 'b2', jenis: 'buka_shift', shift_id: 'd2', data: { modal: 2 }, waktu: '2026-10-08T05:00:00Z' })
		];
		expect(shiftLokal(null, k, 'o')?.id).toBe('d2');
	});
	it('kejadian outlet lain diabaikan', () => {
		expect(shiftLokal(null, [kej({ id: 'b', jenis: 'buka_shift', outlet_id: 'x', shift_id: 'd' })], 'o')).toBeNull();
	});
});

describe('riwayat & ringkasan lokal', () => {
	const jualK = (id: string, status: Kejadian['status'], total: number, metode = 'cash') =>
		kej({ id, jenis: 'jual', status, data: { metode, total, diterima: total, kembalian: 0, kode_struk: `K${id}AAAA`.slice(0, 6), nomor_sementara: 'S1-001', item: [{ nama: 'Dada', harga: total, qty: 1 }] } });
	const server = [{ id: 'srv1', nomor: 'BL-1', waktu: '2026-10-08T02:00:00Z', metode: 'cash' as const, total: 10000, diterima: 10000, kembalian: 0, void_at: null, void_alasan: null, item: [], kode_struk: 'SRV111' }];
	it('gabung: penjualan server + yang belum terkirim; yang sudah terkirim tapi sudah ada di server tidak dobel', () => {
		const r = gabungRiwayat(server, [jualK('a', 'menunggu', 5000), jualK('srv1', 'terkirim', 10000)], 's1');
		expect(r.map((x) => [x.id, x.status_kirim])).toEqual([
			['a', 'menunggu'],
			['srv1', 'server']
		]);
	});
	it('ringkasan lokal = ringkasan server + penjualan belum terkirim (cash menambah cash seharusnya)', () => {
		const lokal = gabungRiwayat([], [jualK('a', 'menunggu', 5000), jualK('b', 'ditolak', 7000, 'qris')], 's1');
		const r = ringkasanLokal(null, { ...serverShift, id: 's1' }, lokal);
		expect(r).toMatchObject({ jumlah_transaksi: 2, total: 12000, cash_seharusnya: 105000 });
		expect(r.per_metode.qris).toEqual({ jumlah: 1, total: 7000 });
	});
	it('cari: nomor resmi, nomor sementara, kode struk (tanpa beda huruf besar/kecil)', () => {
		const [p] = gabungRiwayat([], [jualK('a', 'menunggu', 5000)], 's1');
		expect(cocokCari(p, 'kaaa')).toBe(true);
		expect(cocokCari(p, 's1-001')).toBe(true);
		expect(cocokCari(p, 'zzz')).toBe(false);
	});
});
```

Tambahkan ke akhir `src/lib/kasir/struk.test.ts`:
```ts
describe('kode struk (Tahap 4)', () => {
	const dasar = {
		outlet: { merek: "D'Kriuk", nama: 'Bukit Lama', alamat: 'Jl. X', telepon: '0811' },
		nomor: 'BL-261008-014',
		waktu: '2026-10-08T05:00:00Z',
		kasir: 'Kasir BL',
		item: [{ nama: 'Dada Ori', harga: 11000, qty: 1 }],
		total: 11000,
		metode: 'qris' as const,
		diterima: null,
		kembalian: null
	};
	it('online: kode struk tercetak', () => {
		expect(barisStruk({ ...dasar, kodeStruk: 'K7Q2MX' }).join('\n')).toContain('Kode: K7Q2MX');
	});
	it('offline: nomor sementara & kode tercetak', () => {
		const t = barisStruk({ ...dasar, nomor: 'S1-012', nomorSementara: 'S1-012', kodeStruk: 'K7Q2MX' }).join('\n');
		expect(t).toContain('No. sementara');
		expect(t).toContain('K7Q2MX');
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/offline/proyeksi.test.ts src/lib/kasir/struk.test.ts`
Expected: FAIL — `./proyeksi` belum ada; struk belum mencetak kode.

- [ ] **Step 3: Implementasi**

`src/lib/offline/proyeksi.ts`:
```ts
// Tampilan kasir dari data server + antrean di perangkat (logika murni, teruji).
import type { Metode, PenjualanRiwayat, Ringkasan, Shift } from '#lib/kasir/types.ts';
import type { Kejadian } from './db.ts';

/** Shift terbuka menurut perangkat ini: kejadian buka/tutup terakhir menang atas data server. */
export function shiftLokal(server: Shift | null, kejadian: Kejadian[], outletId: string): Shift | null {
	const k = kejadian
		.filter((x) => x.outlet_id === outletId && (x.jenis === 'buka_shift' || x.jenis === 'tutup_shift') && x.status !== 'terkirim')
		.sort((a, b) => (a.urut ?? 0) - (b.urut ?? 0) || a.waktu.localeCompare(b.waktu));
	let s = server;
	for (const x of k) {
		if (x.jenis === 'buka_shift') {
			s = { id: x.shift_id!, outlet_id: outletId, dibuka_at: x.waktu, modal: Number(x.data.modal ?? 0), ditutup_at: null };
		} else if (s && (x.shift_id === s.id || x.shift_id === server?.id)) {
			s = null;
		}
	}
	return s;
}

export interface PenjualanLokal extends PenjualanRiwayat {
	kode_struk: string | null;
	nomor_sementara: string | null;
	status_kirim: 'menunggu' | 'ditolak' | 'terkirim' | 'server';
	alasan: string | null;
}

function dariKejadian(k: Kejadian): PenjualanLokal {
	const d = k.data as {
		metode: Metode;
		total: number;
		diterima?: number | null;
		kembalian?: number | null;
		kode_struk?: string;
		nomor_sementara?: string | null;
		item: { nama: string; harga: number; qty: number }[];
	};
	const hasil = k.hasil as { nomor?: string; total?: number } | null;
	return {
		id: k.id,
		nomor: hasil?.nomor ?? d.nomor_sementara ?? '-',
		waktu: k.waktu,
		metode: d.metode,
		total: hasil?.total ?? d.total,
		diterima: d.diterima ?? null,
		kembalian: d.kembalian ?? null,
		void_at: null,
		void_alasan: null,
		item: d.item ?? [],
		kode_struk: d.kode_struk ?? null,
		nomor_sementara: d.nomor_sementara ?? null,
		status_kirim: k.status,
		alasan: k.alasan
	};
}

/** Penjualan shift ini: dari server + yang masih di perangkat (tanpa dobel), terbaru di atas. */
export function gabungRiwayat(server: PenjualanRiwayat[], kejadian: Kejadian[], shiftId: string): PenjualanLokal[] {
	const ada = new Set(server.map((p) => p.id));
	const lokal = kejadian.filter((k) => k.jenis === 'jual' && k.shift_id === shiftId && !ada.has(k.id)).map(dariKejadian);
	const srv: PenjualanLokal[] = server.map((p) => ({
		...p,
		kode_struk: p.kode_struk ?? null,
		nomor_sementara: p.nomor_sementara ?? null,
		status_kirim: 'server',
		alasan: null
	}));
	return [...lokal, ...srv].sort((a, b) => b.waktu.localeCompare(a.waktu));
}

const METODE: Metode[] = ['cash', 'qris', 'gofood', 'grabfood', 'shopeefood'];

/** Ringkasan untuk Tutup toko: ringkasan server (bila ada) + penjualan yang belum ada di server. */
export function ringkasanLokal(dasar: Ringkasan | null, shift: Shift, lokal: PenjualanLokal[]): Ringkasan {
	const per = Object.fromEntries(METODE.map((m) => [m, { ...(dasar?.per_metode[m] ?? { jumlah: 0, total: 0 }) }])) as Ringkasan['per_metode'];
	let jumlah = dasar?.jumlah_transaksi ?? 0;
	let total = dasar?.total ?? 0;
	let cash = (dasar?.cash_seharusnya ?? shift.modal) - shift.modal;
	for (const p of lokal.filter((x) => x.status_kirim !== 'server' && x.status_kirim !== 'terkirim' && !x.void_at)) {
		per[p.metode].jumlah++;
		per[p.metode].total += p.total;
		jumlah++;
		total += p.total;
		if (p.metode === 'cash') cash += p.total;
	}
	return {
		shift_id: shift.id,
		outlet_id: shift.outlet_id,
		modal: shift.modal,
		dibuka_at: shift.dibuka_at,
		ditutup_at: null,
		jumlah_transaksi: jumlah,
		jumlah_void: dasar?.jumlah_void ?? 0,
		total,
		per_metode: per,
		cash_seharusnya: shift.modal + cash,
		uang_fisik: null,
		selisih: null
	};
}

export function cocokCari(p: PenjualanLokal, q: string): boolean {
	const t = q.trim().toUpperCase();
	if (!t) return true;
	return [p.nomor, p.nomor_sementara, p.kode_struk].some((x) => !!x && x.toUpperCase().includes(t));
}
```

Di `src/lib/kasir/types.ts`, tambahkan ke `PenjualanRiwayat` (sebelum `item`):
```ts
	kode_struk?: string | null;
	nomor_sementara?: string | null;
	dicatat_at?: string;
	perangkat_id?: string | null;
```

Di `src/lib/kasir/api.ts`, pada `daftarPenjualanShift` ubah select menjadi:
```ts
			.select('id, nomor, waktu, metode, total, diterima, kembalian, void_at, void_alasan, kode_struk, nomor_sementara, dicatat_at, perangkat_id, item:penjualan_item(nama, harga, qty)')
```

Di `src/lib/kasir/struk.ts`: tambahkan ke `DataStruk`:
```ts
	/** Kode pendek permanen untuk menelusuri transaksi (Tahap 4). */
	kodeStruk?: string | null;
	/** Diisi bila struk dicetak sebelum nomor resmi didapat (offline). */
	nomorSementara?: string | null;
```
dan di `barisStruk`, tepat setelah baris yang mencetak nomor transaksi, tambahkan baris:
```ts
	if (d.nomorSementara) baris.push(...kiriKanan('No. sementara', d.nomorSementara, lebar));
	if (d.kodeStruk) baris.push(...kiriKanan('Kode', d.kodeStruk, lebar).map((b) => b.replace(/^Kode\s+/, 'Kode: ').padEnd(lebar)));
```
(Bila nama variabel penampung baris di `barisStruk` berbeda dari `baris`, sesuaikan; tes Step 1 yang menentukan.)

`src/lib/offline/pengirim.ts`:
```ts
// Kejadian antrean → RPC *_offline. Galat jaringan/sesi = coba lagi nanti; selainnya = ditolak.
import { galatJaringan } from '#lib/auth/cache-profil.ts';
import { supabase } from '#lib/supabase/client.ts';
import { GalatKirim, type Pengirim } from './antrean.ts';
import type { Kejadian } from './db.ts';
import { pesanSinkron } from './pesan.ts';

type Galat = { code?: string; message?: string; status?: number; name?: string };

function sesiBermasalah(e: Galat): boolean {
	return e.status === 401 || e.code === 'PGRST301' || e.code === 'PGRST303' || (e.status ?? 0) >= 500;
}

export function pengirimSupabase(perangkatId: string): Pengirim {
	return {
		async kirim(k: Kejadian) {
			const dasar = { ...k.data, outlet_id: k.outlet_id, waktu: k.waktu, perangkat_id: perangkatId };
			const panggil = () => {
				switch (k.jenis) {
					case 'buka_shift':
						return supabase.rpc('buka_shift_offline', { p: { ...dasar, id: k.shift_id } });
					case 'jual':
						return supabase.rpc('catat_penjualan_offline', { p: { ...dasar, id: k.id, shift_id: k.shift_id } });
					case 'tutup_shift':
						return supabase.rpc('tutup_shift_offline', { p: { ...dasar, id: k.id, shift_id: k.shift_id } });
					case 'rusak':
						return supabase.rpc('catat_rusak_offline', { p: { ...dasar, id: k.id } });
				}
			};
			let res: { data: unknown; error: Galat | null; status?: number };
			try {
				res = (await panggil()) as typeof res;
			} catch (e) {
				throw new GalatKirim((e as Error).message, true);
			}
			if (res.error) {
				const g = { ...res.error, status: res.error.status ?? res.status };
				if (galatJaringan(g) || sesiBermasalah(g)) throw new GalatKirim('Tidak bisa terhubung ke server.', true);
				throw new GalatKirim(pesanSinkron(g), false);
			}
			return res.data;
		}
	};
}
```

`src/lib/offline/sinkron.svelte.ts`:
```ts
// Status sinkron untuk layar kasir & pemicunya (online kembali, berkala, layar terlihat, tombol).
import { supabase } from '#lib/supabase/client.ts';
import { bersihkanTerkirim, hitungAntrean, kirimAntrean } from './antrean.ts';
import { bukaDb } from './db.ts';
import { pengirimSupabase } from './pengirim.ts';

export const dbKasir = bukaDb();

class SinkronState {
	menunggu = $state(0);
	ditolak = $state(0);
	sedang = $state(false);
	terakhir = $state<string | null>(null);
	online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
	#perangkat: string | null = null;
	#berjalan: Promise<void> | null = null;
	#mulai = false;

	async segarkan() {
		const h = await hitungAntrean(dbKasir);
		this.menunggu = h.menunggu;
		this.ditolak = h.ditolak;
	}

	/** Kirim antrean sekarang (tidak berjalan dua kali bersamaan). */
	jalankan(): Promise<void> {
		if (!this.#perangkat) return this.segarkan();
		this.#berjalan ??= (async () => {
			this.sedang = true;
			try {
				const r = await kirimAntrean(dbKasir, pengirimSupabase(this.#perangkat!));
				if (r.berhenti === 'selesai') {
					this.terakhir = new Date().toISOString();
					await supabase.rpc('tandai_sinkron', { p_id: this.#perangkat });
					await bersihkanTerkirim(dbKasir, new Date(Date.now() - 3 * 86_400_000));
				}
			} finally {
				this.sedang = false;
				this.#berjalan = null;
				await this.segarkan();
			}
		})();
		return this.#berjalan;
	}

	mulai(perangkatId: string) {
		this.#perangkat = perangkatId;
		if (this.#mulai || typeof window === 'undefined') return;
		this.#mulai = true;
		window.addEventListener('online', () => {
			this.online = true;
			void this.jalankan();
		});
		window.addEventListener('offline', () => (this.online = false));
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') void this.jalankan();
		});
		setInterval(() => void this.jalankan(), 30_000);
		void this.jalankan();
	}
}

export const sinkron = new SinkronState();
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src && npm run check`
Expected: PASS; 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline src/lib/kasir
git commit -m "feat(offline): proyeksi lokal (shift, riwayat, ringkasan), pengirim RPC, status sinkron, struk berkode"
```

---

### Task 7: Layar kasir lewat antrean (buka toko, jualan, sisa, tutup toko, riwayat, perlu perhatian)

**Files:**
- Create: `src/lib/kasir/offline-kasir.ts`, `src/lib/components/kasir/PenandaSinkron.svelte`, `src/routes/kasir/perlu-perhatian/+page.svelte`
- Modify: `src/lib/kasir/pos.svelte.ts`, `src/lib/components/kasir/ModalShift.svelte`, `src/lib/components/kasir/Selesai.svelte`, `src/lib/components/stok/LangkahSisa.svelte`, `src/routes/kasir/+layout.svelte`, `src/routes/kasir/+page.svelte`, `src/routes/kasir/riwayat/+page.svelte`, `src/routes/kasir/tutup/+page.svelte`, `src/lib/components/layout/AppShell.svelte`
- Test: `src/lib/kasir/offline-kasir.test.ts`

**Interfaces:**
- Consumes: Task 4–6.
- Produces (`offline-kasir.ts`, logika yang dipakai layar):
  - `buatKejadianJual(a: { id; outletId; shiftId; metode; diterima: number | null; keranjang: BarisKeranjang[]; waktu: Date }): { kejadian: Pick<Kejadian,'id'|'jenis'|'outlet_id'|'shift_id'|'waktu'|'data'>; total: number; kembalian: number | null; kodeStruk: string }` — total & kembalian lokal dari harga di keranjang; `kode_struk = kodeStruk(id)`.
  - `buatKejadianBuka(outletId, modal, waktu)`, `buatKejadianTutup(outletId, shiftId, uang, catatan, waktu)`, `buatKejadianRusak(outletId, alasan, item, waktu, catatan?)`.

- [ ] **Step 1: Tes (gagal dulu)**

`src/lib/kasir/offline-kasir.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buatKejadianBuka, buatKejadianJual, buatKejadianTutup } from './offline-kasir';

const waktu = new Date('2026-10-08T05:00:00Z');
const keranjang = [
	{ menu_id: 'm1', nama: 'Dada Ori', harga: 11000, qty: 2 },
	{ menu_id: 'm2', nama: 'Nasi', harga: 5000, qty: 1 }
];

describe('kejadian kasir', () => {
	it('jual cash: total & kembalian lokal, item lengkap untuk riwayat/struk, kode struk dari id', () => {
		const r = buatKejadianJual({ id: '8f14e45f-ceea-467a-9e2b-1b2a3c4d5e6f', outletId: 'o', shiftId: 's', metode: 'cash', diterima: 30000, keranjang, waktu });
		expect(r.total).toBe(27000);
		expect(r.kembalian).toBe(3000);
		expect(r.kodeStruk).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
		expect(r.kejadian).toMatchObject({ jenis: 'jual', outlet_id: 'o', shift_id: 's', waktu: '2026-10-08T05:00:00.000Z' });
		expect(r.kejadian.data).toMatchObject({ metode: 'cash', diterima: 30000, total: 27000, kode_struk: r.kodeStruk });
		expect(r.kejadian.data.item).toEqual([
			{ menu_id: 'm1', nama: 'Dada Ori', harga: 11000, qty: 2 },
			{ menu_id: 'm2', nama: 'Nasi', harga: 5000, qty: 1 }
		]);
	});
	it('jual non-tunai: tanpa diterima & kembalian', () => {
		const r = buatKejadianJual({ id: crypto.randomUUID(), outletId: 'o', shiftId: 's', metode: 'qris', diterima: 30000, keranjang, waktu });
		expect(r.kembalian).toBeNull();
		expect(r.kejadian.data).not.toHaveProperty('diterima');
	});
	it('buka toko: id shift baru dipakai untuk kejadian & shift_id; tutup: shift_id = shift perangkat', () => {
		const b = buatKejadianBuka('o', 150000, waktu);
		expect(b.shift_id).toBe(b.data.shift_id);
		expect(b.data.modal).toBe(150000);
		const t = buatKejadianTutup('o', b.shift_id!, 160000, 'aman', waktu);
		expect(t).toMatchObject({ jenis: 'tutup_shift', shift_id: b.shift_id, data: { uang_fisik: 160000, catatan: 'aman' } });
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/kasir/offline-kasir.test.ts`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Implementasi logika**

`src/lib/kasir/offline-kasir.ts`:
```ts
// Membentuk kejadian antrean dari tindakan kasir (logika murni, teruji).
import type { Kejadian } from '#lib/offline/db.ts';
import { kodeStruk } from '#lib/offline/nomor.ts';
import type { AlasanRusak, ItemHitung } from '#lib/stok/types.ts';
import { totalKeranjang } from './keranjang.ts';
import type { BarisKeranjang, Metode } from './types.ts';

type KejadianBaru = Pick<Kejadian, 'id' | 'jenis' | 'outlet_id' | 'shift_id' | 'waktu' | 'data'>;

export function buatKejadianJual(a: {
	id: string;
	outletId: string;
	shiftId: string;
	metode: Metode;
	diterima: number | null;
	keranjang: BarisKeranjang[];
	waktu: Date;
}): { kejadian: KejadianBaru; total: number; kembalian: number | null; kodeStruk: string } {
	const total = totalKeranjang(a.keranjang);
	const cash = a.metode === 'cash';
	const kode = kodeStruk(a.id);
	return {
		total,
		kembalian: cash && a.diterima !== null ? a.diterima - total : null,
		kodeStruk: kode,
		kejadian: {
			id: a.id,
			jenis: 'jual',
			outlet_id: a.outletId,
			shift_id: a.shiftId,
			waktu: a.waktu.toISOString(),
			data: {
				metode: a.metode,
				...(cash && a.diterima !== null ? { diterima: a.diterima, kembalian: a.diterima - total } : {}),
				total,
				kode_struk: kode,
				item: a.keranjang.map((b) => ({ menu_id: b.menu_id, nama: b.nama, harga: b.harga, qty: b.qty }))
			}
		}
	};
}

export function buatKejadianBuka(outletId: string, modal: number, waktu: Date): KejadianBaru {
	const shiftId = crypto.randomUUID();
	return { id: crypto.randomUUID(), jenis: 'buka_shift', outlet_id: outletId, shift_id: shiftId, waktu: waktu.toISOString(), data: { shift_id: shiftId, modal } };
}

export function buatKejadianTutup(outletId: string, shiftId: string, uang: number, catatan: string, waktu: Date): KejadianBaru {
	return { id: crypto.randomUUID(), jenis: 'tutup_shift', outlet_id: outletId, shift_id: shiftId, waktu: waktu.toISOString(), data: { uang_fisik: uang, catatan } };
}

export function buatKejadianRusak(outletId: string, alasan: AlasanRusak, item: ItemHitung[], waktu: Date, catatan?: string): KejadianBaru {
	return {
		id: crypto.randomUUID(),
		jenis: 'rusak',
		outlet_id: outletId,
		shift_id: null,
		waktu: waktu.toISOString(),
		data: { alasan, item, ...(catatan ? { catatan } : {}) }
	};
}
```

Catatan: pengirim (Task 6) mengirim `catat_penjualan_offline` dengan `{...data}` — fungsi server mengabaikan `nama`, `harga`, `total`, `kembalian` di item/data (harga dihitung server).

- [ ] **Step 4: Sambungkan layar**

Lakukan perubahan berikut (semua memakai `dbKasir`, `sinkron` dari `#lib/offline/sinkron.svelte.ts`, `tambahKejadian` & `ubahDataMenunggu` dari `#lib/offline/antrean.ts`, `bacaPerangkat`/`simpanKode` dari `#lib/offline/perangkat.ts`, `nomorSementara`/`ambilUrutSementara` dari `#lib/offline/nomor.ts`, `denganSalinan` dari `#lib/offline/salinan.ts`, `galatJaringan` dari `#lib/auth/cache-profil.ts`):

1. **`src/routes/kasir/+layout.svelte`**: di `<script>` saat `pos.outlet` tersedia dan `auth.status === 'ready'`:
```ts
	import { onMount } from 'svelte';
	import PenandaSinkron from '#lib/components/kasir/PenandaSinkron.svelte';
	import { supabase } from '#lib/supabase/client.ts';
	import { bacaPerangkat, simpanKode } from '#lib/offline/perangkat.ts';
	import { sinkron } from '#lib/offline/sinkron.svelte.ts';

	const perangkat = bacaPerangkat(localStorage);
	onMount(() => sinkron.mulai(perangkat.id));
	// Daftarkan perangkat (sekali online) supaya punya kode untuk nomor sementara.
	$effect(() => {
		const o = pos.outlet;
		if (!o || auth.offline) return;
		void supabase.rpc('daftar_perangkat', { p_id: perangkat.id, p_outlet: o.id }).then(({ data }) => {
			if (typeof data === 'number') simpanKode(localStorage, data);
		});
	});
```
dan tampilkan `<PenandaSinkron />` tepat di atas `{@render children()}` (di dalam layout, setelah banner offline yang ada).

2. **`src/lib/components/kasir/PenandaSinkron.svelte`** (baru):
```svelte
<script lang="ts">
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { href } from '#lib/nav.ts';
	import { sinkron } from '#lib/offline/sinkron.svelte.ts';
</script>

<div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm" role="status" aria-live="polite">
	<span class="font-semibold {sinkron.online ? 'text-ok' : 'text-danger'}">{sinkron.online ? '● Online' : '● Offline'}</span>
	{#if sinkron.menunggu}<span>{sinkron.menunggu} belum terkirim</span>{/if}
	{#if sinkron.ditolak}<a href={href('/kasir/perlu-perhatian')} class="font-semibold text-danger underline">Perlu perhatian ({sinkron.ditolak})</a>{/if}
	{#if sinkron.terakhir}<span class="text-muted">Sinkron {formatWaktuWib(sinkron.terakhir).slice(-8, -3)}</span>{/if}
	<button type="button" class="ml-auto min-h-12 rounded-xl bg-surface px-3 font-semibold" disabled={sinkron.sedang} onclick={() => sinkron.jalankan()}>
		{sinkron.sedang ? 'Mengirim…' : 'Sinkron sekarang'}
	</button>
</div>
```

3. **`src/lib/kasir/pos.svelte.ts`**: `muatShift()` mengambil shift server lewat `denganSalinan(dbKasir, 'shift:' + o.id, () => shiftTerbuka(o.id), galatJaringan)` lalu `this.shift = shiftLokal(nilai, await dbKasir.kejadian.toArray(), o.id)`; galat non-jaringan tetap ke `status 'gagal'`. Impor `shiftLokal` dari `#lib/offline/proyeksi.ts`.

4. **`src/lib/components/kasir/ModalShift.svelte`**: ganti pemanggilan `bukaShift(outlet.id, modal)` dengan:
```ts
			const k = buatKejadianBuka(outlet.id, modal, new Date());
			await tambahKejadian(dbKasir, k);
			void sinkron.jalankan();
			onbuka(k.shift_id!);
```
`modalTerakhir` dibungkus `denganSalinan(dbKasir, 'modal:' + outlet.id, ...)`.

5. **`src/routes/kasir/+page.svelte`** (jualan): menu dimuat lewat `denganSalinan(dbKasir, 'menu:' + o.id, () => muatMenuOutlet(o.id), galatJaringan)` (efek muat menu tetap berjalan saat `auth.offline`); `bayar()` diganti:
```ts
	async function bayar(metode: Metode, diterima: number | null) {
		const o = pos.outlet!;
		const kasir = auth.profile?.nama_tampilan ?? '';
		const kirim = $state.snapshot(keranjang);
		const id = idTransaksi;
		const r = buatKejadianJual({ id, outletId: o.id, shiftId: pos.shift!.id, metode, diterima, keranjang: kirim, waktu: new Date() });
		await tambahKejadian(dbKasir, r.kejadian);
		// Online: coba kirim langsung (≤ 4 detik) supaya struk memakai nomor resmi.
		await Promise.race([sinkron.jalankan(), new Promise((x) => setTimeout(x, 4000))]);
		const k = await dbKasir.kejadian.where('id').equals(id).first();
		const resmi = k?.status === 'terkirim' ? (k.hasil as { nomor: string; total: number; kembalian: number | null }) : null;
		let sementara: string | null = null;
		if (!resmi) {
			const p = bacaPerangkat(localStorage);
			const no = nomorSementara(p.kode ?? 0, ambilUrutSementara(localStorage, tanggalWib(new Date())));
			if (await ubahDataMenunggu(dbKasir, id, { nomor_sementara: no })) sementara = no;
		}
		struk = {
			outlet: { merek: o.merek, nama: o.nama, alamat: o.alamat, telepon: o.telepon },
			nomor: resmi?.nomor ?? sementara ?? 'menyusul',
			nomorSementara: sementara,
			kodeStruk: r.kodeStruk,
			waktu: r.kejadian.waktu,
			kasir,
			item: kirim.map((b) => ({ nama: b.nama, harga: b.harga, qty: b.qty })),
			total: resmi?.total ?? r.total,
			metode,
			diterima: metode === 'cash' ? diterima : null,
			kembalian: metode === 'cash' ? (resmi?.kembalian ?? r.kembalian) : null
		};
		tahap = 'selesai';
		segarStok++;
	}
```
(`idTransaksi` dibuat ulang di `baru()` & saat keranjang dikosongkan seperti sekarang; `Transaksi`/`sidikGagal` Tahap 2 dihapus karena antrean membuat pembayaran tidak bisa "gagal di tengah"; `BayarPanel` tidak lagi dinonaktifkan saat offline: hapus prop `offline={auth.offline}`.)

6. **`src/lib/components/kasir/Selesai.svelte`**: tampilkan `Kode struk: {data.kodeStruk}` dan, bila `data.nomorSementara`, keterangan "Nomor resmi diberikan saat sinkron".

7. **`src/lib/components/stok/LangkahSisa.svelte`**: ganti `catatRusak({ id, outlet_id: outletId, alasan, item: h.item })` dengan `await tambahKejadian(dbKasir, { ...buatKejadianRusak(outletId, alasan, h.item, new Date()), id }); void sinkron.jalankan();`.

8. **`src/routes/kasir/tutup/+page.svelte`**: ringkasan = `ringkasanLokal(dasar, pos.shift, gabungRiwayat(serverList, kejadian, pos.shift.id))` dengan `dasar` dari `denganSalinan(dbKasir, 'ringkasan:' + id, () => ringkasanShift(id), galatJaringan)` (null bila belum ada & offline) dan `serverList` dari `denganSalinan(dbKasir, 'riwayat:' + id, () => daftarPenjualanShift(id), galatJaringan)` (kosong bila belum ada). `tutup()`:
```ts
		const k = buatKejadianTutup(pos.shift.outlet_id, pos.shift.id, uang, catatan, new Date());
		await tambahKejadian(dbKasir, k);
		hasil = { ...r!, uang_fisik: uang, selisih: uang - r!.cash_seharusnya, ditutup_at: k.waktu };
		void sinkron.jalankan();
		await pos.muatShift();
```

9. **`src/routes/kasir/riwayat/+page.svelte`**: daftar = `gabungRiwayat(server, kejadian, pos.shift.id)` (server lewat `denganSalinan`); kotak **Cari** (nomor/nomor sementara/kode struk, `cocokCari`); tiap baris menampilkan nomor, `status_kirim` ("belum terkirim" / "ditolak: alasan"), kode struk, dan rincian jejak (jam jual, jam sampai `dicatat_at` bila ada, "perangkat ini" bila `perangkat_id` = perangkat ini). Tombol **Batalkan** hanya untuk `status_kirim === 'server'` dan saat online; selain itu teks "Batal butuh internet & transaksi yang sudah terkirim".

10. **`src/routes/kasir/perlu-perhatian/+page.svelte`** (baru): daftar kejadian `status === 'ditolak'` (jenis berlabel: Buka toko, Jualan, Tutup toko, Rusak/sisa; jam; alasan) dengan tombol **Coba lagi** (`cobaLagi(dbKasir, id)` lalu `sinkron.jalankan()`); kosong → "Tidak ada yang perlu diperhatikan."

11. **`src/lib/components/layout/AppShell.svelte`**: tombol Keluar memanggil:
```ts
	async function keluar() {
		const { hitungAntrean } = await import('#lib/offline/antrean.ts');
		const { dbKasir } = await import('#lib/offline/sinkron.svelte.ts');
		const h = await hitungAntrean(dbKasir);
		if (h.menunggu + h.ditolak > 0) {
			pesanKeluar = `Sinkronkan dulu: ada ${h.menunggu + h.ditolak} data yang belum terkirim.`;
			return;
		}
		await auth.signOut();
	}
```
dengan `let pesanKeluar = $state('')` ditampilkan di bawah header (`role="alert"`).

- [ ] **Step 5: Jalankan, pastikan lulus**

Run: `npx vitest run src && npm run check && npm run build`
Expected: PASS; 0 errors; build sukses.

- [ ] **Step 6: Uji manual singkat (laptop)**

Run: `npm run dev`, buka Chrome → DevTools → Network → **Offline**. Buka toko, jual 2 transaksi (struk "No. sementara S…-001" + kode), Tutup toko (sisa: Tidak ada). Kembali **Online** → penanda "0 belum terkirim"; Riwayat menunjukkan nomor resmi. Catat hasilnya di ledger.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(offline): buka toko, jualan, sisa, tutup toko lewat antrean; riwayat & pencarian kode struk; perlu perhatian"
```

---

### Task 8: PWA — manifest, ikon, service worker, pita versi baru

**Files:**
- Create: `static/manifest.webmanifest`, `static/ikon-192.png`, `static/ikon-512.png`, `src/service-worker.ts`, `src/lib/components/layout/PitaVersi.svelte`
- Modify: `src/app.html`, `src/lib/components/layout/AppShell.svelte`

**Interfaces:**
- Produces: aplikasi dapat dipasang (manifest + SW); SW menyimpan file build & `index.html`; navigasi offline memakai `index.html` tersimpan; pita "Versi baru tersedia — Muat ulang" (ditahan bila antrean belum kosong).

- [ ] **Step 1: Ikon**

Run:
```bash
python -c "from PIL import Image; im=Image.open('src/lib/assets/brand/logo-icon.jpg').convert('RGB'); [im.resize((n,n), Image.LANCZOS).save(f'static/ikon-{n}.png') for n in (192,512)]"
```
Expected: `static/ikon-192.png`, `static/ikon-512.png` ada.

- [ ] **Step 2: Manifest & app.html**

`static/manifest.webmanifest`:
```json
{
	"name": "Kasir D'Kriuk",
	"short_name": "Kasir",
	"description": "Kasir & stok D'Kriuk",
	"start_url": "./",
	"scope": "./",
	"display": "standalone",
	"background_color": "#FFFFFF",
	"theme_color": "#E3191F",
	"icons": [
		{ "src": "ikon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
		{ "src": "ikon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
	]
}
```
Di `src/app.html`, tambahkan setelah baris `<link rel="icon" …>`:
```html
		<link rel="manifest" href="%sveltekit.assets%/manifest.webmanifest" />
		<link rel="apple-touch-icon" href="%sveltekit.assets%/ikon-192.png" />
```

- [ ] **Step 3: Service worker**

`src/service-worker.ts`:
```ts
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Menyimpan semua file aplikasi supaya bisa dibuka tanpa internet. Data (Supabase) tidak disimpan di sini.
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';
import { version } from '$app/environment';

const CACHE = `kasir-${version}`;
const BASE = new URL(self.registration.scope).pathname;
const FILES = [...immutable.map((f) => BASE + f.path), ...assets.map((f) => BASE + f.path), BASE, BASE + 'index.html'];

self.addEventListener('install', (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
	e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});

self.addEventListener('message', (e) => {
	if (e.data === 'pasang-versi-baru') void self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
	const req = e.request;
	const url = new URL(req.url);
	if (req.method !== 'GET' || url.origin !== self.location.origin) return;
	if (req.mode === 'navigate') {
		// Halaman: coba jaringan, bila gagal pakai index.html tersimpan (hash router).
		e.respondWith(fetch(req).catch(async () => (await caches.match(BASE + 'index.html')) ?? Response.error()));
		return;
	}
	e.respondWith(caches.match(req).then((r) => r ?? fetch(req)));
});
```
Bila `npm run check` menolak impor (`$app/manifest` / `$app/environment` tidak tersedia atau tipe `self` salah), periksa `node_modules/@sveltejs/kit/types/index.d.ts` untuk nama modul SvelteKit 3 yang benar dan catat sebagai Ruling.

- [ ] **Step 4: Pita versi baru**

`src/lib/components/layout/PitaVersi.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { sinkron } from '#lib/offline/sinkron.svelte.ts';

	let siap = $state<ServiceWorker | null>(null);

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		void navigator.serviceWorker.getRegistration().then((reg) => {
			if (!reg) return;
			if (reg.waiting) siap = reg.waiting;
			reg.addEventListener('updatefound', () => {
				const w = reg.installing;
				w?.addEventListener('statechange', () => {
					if (w.state === 'installed' && navigator.serviceWorker.controller) siap = w;
				});
			});
		});
		navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
		// Minta penyimpanan permanen supaya antrean tidak dihapus browser.
		void navigator.storage?.persist?.();
	});

	const tertahan = $derived(sinkron.menunggu + sinkron.ditolak > 0);
</script>

{#if siap}
	<div class="flex flex-wrap items-center gap-2 bg-accent px-4 py-2 text-sm font-semibold text-on-accent" role="status">
		<span class="flex-1">Versi baru tersedia.</span>
		{#if tertahan}
			<span>Sinkronkan dulu sebelum memperbarui.</span>
		{:else}
			<button type="button" class="min-h-12 rounded-xl bg-surface px-3 text-fg" onclick={() => siap?.postMessage('pasang-versi-baru')}>Muat ulang</button>
		{/if}
	</div>
{/if}
```
Di `AppShell.svelte`, impor dan render `<PitaVersi />` tepat di atas `<header>`.

- [ ] **Step 5: Verifikasi build**

Run: `npm run check && BASE_PATH=/kasir-dkriuk npm run build && ls build | grep -E "service-worker.js|manifest.webmanifest|ikon-512.png"`
Expected: 0 errors; ketiga file ada di `build/`.

- [ ] **Step 6: Commit**

```bash
git add static src/app.html src/service-worker.ts src/lib/components/layout
git commit -m "feat(pwa): bisa dipasang ke layar utama, file aplikasi tersimpan untuk offline, pita versi baru"
```

---

### Task 9: GitHub Pages, pasang migrasi, E2E offline, dokumentasi

**Files:**
- Create: `.github/workflows/pages.yml`, `scripts/uji-offline.ts`, `docs/uji/tahap-4a-offline-owner.md`
- Modify: `scripts/uji-kasir.ts`, `scripts/uji-stok.ts`, `scripts/uji-stok-3b.ts` (pembersihan tabel baru), `README.md`, `docs/superpowers/plans/2026-10-04-00-roadmap.md`, `docs/laporan-pembuatan.md`

- [ ] **Step 1: Workflow Pages**

`.github/workflows/pages.yml`:
```yaml
name: Pasang ke GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          BASE_PATH: /kasir-dkriuk
          PUBLIC_SUPABASE_URL: ${{ vars.PUBLIC_SUPABASE_URL }}
          PUBLIC_SUPABASE_ANON_KEY: ${{ vars.PUBLIC_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: build
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Pembersihan E2E lama ikut tabel baru**

Di `scripts/uji-kasir.ts`, `scripts/uji-stok.ts`, `scripts/uji-stok-3b.ts`, di blok `finally` sebelum penghapusan `shift`, tambahkan (untuk setiap outlet uji `o`/`outletId`):
```ts
		await svc.from('shift_perangkat').delete().in('shift_id', ((await svc.from('shift').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id));
```
dan sebelum menghapus akun uji: `await svc.from('perangkat').delete().eq('outlet_id', outletId);` (sesuaikan nama variabel outlet di tiap skrip).

- [ ] **Step 3: Pasang migrasi**

Run: `npm run sb -- db push --dry-run` → Expected: hanya `20261008000018`, `20261008000019`.
Run: `npm run sb -- db push --yes` → Expected: keduanya "Applying".

- [ ] **Step 4: E2E offline**

`scripts/uji-offline.ts`:
```ts
// E2E fungsi offline terhadap Supabase sungguhan: outlet "UJO", kasir sementara, dua perangkat; semua dihapus di akhir.
//   node --env-file=.env.local scripts/uji-offline.ts
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
const P1 = randomUUID();
const P2 = randomUUID();
const jam = (mundurMenit: number) => new Date(Date.now() - mundurMenit * 60_000).toISOString();

try {
	const o = await svc.from('outlets').insert({ kode: 'UJO', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const menu = (await svc.from('menu').select('id, kode')).data ?? [];
	await svc.from('harga_jual').insert(menu.map((m) => ({ outlet_id: outletId, menu_id: m.id, harga: 5000 })));
	const dada = menu.find((m) => m.kode === 'ori_dada')!.id;
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.offline.${tag}`;
	const a = await svc.auth.admin.createUser({ email: usernameToEmail(u), password: pw, email_confirm: true, app_metadata: { username: u, nama_tampilan: 'Uji', role: 'kasir', outlet_kode: 'UJO' } });
	if (a.error) throw new Error(a.error.message);
	userId = a.data.user.id;
	const k: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await k.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);

	const k1 = await k.rpc('daftar_perangkat', { p_id: P1, p_outlet: outletId });
	const k2 = await k.rpc('daftar_perangkat', { p_id: P2, p_outlet: outletId });
	cek('dua perangkat terdaftar dengan kode', typeof k1.data === 'number' && k2.data === k1.data + 1, JSON.stringify([k1.data, k2.data]));

	const s1 = randomUUID();
	const b1 = await k.rpc('buka_shift_offline', { p: { id: s1, outlet_id: outletId, modal: 100000, waktu: jam(180), perangkat_id: P1 } });
	const b2 = await k.rpc('buka_shift_offline', { p: { id: randomUUID(), outlet_id: outletId, modal: 50000, waktu: jam(150), perangkat_id: P2 } });
	cek('dua perangkat membuka → satu shift', !b1.error && b2.data === b1.data, b2.error?.message);

	const jid = randomUUID();
	const j = { id: jid, outlet_id: outletId, shift_id: s1, metode: 'cash', diterima: 20000, waktu: jam(120), perangkat_id: P1, kode_struk: 'UJ2KQ7', nomor_sementara: 'S1-001', item: [{ menu_id: dada, qty: 2 }] };
	const j1 = await k.rpc('catat_penjualan_offline', { p: j });
	const j2 = await k.rpc('catat_penjualan_offline', { p: j });
	cek('jual offline: nomor resmi & kirim ulang sama', /^UJO-\d{6}-001$/.test(j1.data?.nomor ?? '') && j2.data?.nomor === j1.data?.nomor, JSON.stringify(j1.data ?? j1.error));

	const t = await k.rpc('tutup_shift_offline', { p: { id: randomUUID(), shift_id: s1, uang_fisik: 110000, catatan: 'uji', waktu: jam(60) } });
	cek('tutup offline', !t.error, t.error?.message);
	const telat = await k.rpc('catat_penjualan_offline', { p: { ...j, id: randomUUID(), kode_struk: 'UJ3KQ8', nomor_sementara: 'S2-001', perangkat_id: P2, waktu: jam(90) } });
	const r = await k.rpc('ringkasan_shift', { p_shift: b1.data });
	cek('penjualan telat masuk shift-nya & ditandai', !telat.error && r.data?.jual_setelah_tutup === 1 && r.data?.jumlah_transaksi === 2, JSON.stringify(r.data ?? r.error));

	const cari = await k.from('penjualan').select('nomor').eq('kode_struk', 'UJ2KQ7').single();
	cek('kode struk bisa ditelusuri ke nomor resmi', cari.data?.nomor === j1.data?.nomor);
} catch (e) {
	gagal++;
	console.error(`GAGAL langkah: ${(e as Error).message}`);
} finally {
	if (outletId) {
		await svc.from('gerakan_stok').delete().eq('outlet_id', outletId);
		const ids = ((await svc.from('penjualan').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (ids.length) await svc.from('penjualan_item').delete().in('penjualan_id', ids);
		await svc.from('penjualan').delete().eq('outlet_id', outletId);
		const sh = ((await svc.from('shift').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (sh.length) await svc.from('shift_perangkat').delete().in('shift_id', sh);
		await svc.from('shift').delete().eq('outlet_id', outletId);
		await svc.from('nomor_harian').delete().eq('outlet_id', outletId);
		await svc.from('perangkat').delete().eq('outlet_id', outletId);
	}
	if (userId) {
		const { error } = await svc.auth.admin.deleteUser(userId);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji: ${error.message}`);
		}
	}
	if (outletId) {
		const { error } = await svc.from('outlets').delete().eq('id', outletId);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus outlet uji: ${error.message}`);
		}
	}
	console.log('\nData uji dibersihkan.');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
```

Run: `node --env-file=.env.local scripts/uji-offline.ts`, lalu `uji-kasir.ts`, `uji-stok.ts`, `uji-stok-3b.ts`.
Expected: semua "Semua pemeriksaan lulus" & "Data uji dibersihkan."; server tetap `BL,TK,KP`, 0 penjualan.

- [ ] **Step 5: Kirim ke GitHub & aktifkan Pages (dibantu owner)**

1. Run: `git remote add origin https://github.com/daffialhafizh/kasir-dkriuk.git` (sekali).
2. Owner menjalankan di chat: `! git push -u origin main` (login GitHub lewat jendela browser yang muncul bila diminta). Sebelum push, cabang 4a sudah digabung ke main **dengan persetujuan owner**.
3. Owner di GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**; **Settings → Secrets and variables → Actions → Variables**: tambah `PUBLIC_SUPABASE_URL` dan `PUBLIC_SUPABASE_ANON_KEY` (nilai dari `.env.local`, dibaca owner sendiri; jangan pernah dicetak oleh agen).
4. Tab **Actions** → jalankan ulang "Pasang ke GitHub Pages" bila gagal karena variabel belum ada. Expected: hijau; `https://daffialhafizh.github.io/kasir-dkriuk/` terbuka.

- [ ] **Step 6: Dokumentasi**

- `README.md`: baris tabel `node --env-file=.env.local scripts/uji-offline.ts` + bagian "Alamat aplikasi: https://daffialhafizh.github.io/kasir-dkriuk/".
- Roadmap: baris 4 → `4a selesai (menunggu uji owner), 4b rencana berikutnya`; hapus/centang catatan wajib Tahap 4 yang sudah ditangani (cold start, shift penjualan offline, stok vs hitungan untuk jual/rusak).
- `docs/laporan-pembuatan.md`: status Tahap 4a & alamat aplikasi.
- `docs/uji/tahap-4a-offline-owner.md`:
```markdown
# PR owner — uji Tahap 4a (offline jualan & aplikasi online)

Status: **belum dicoba**. Alamat: https://daffialhafizh.github.io/kasir-dkriuk/

## Pasang ke HP/tablet
- [ ] Buka alamat di Chrome Android → menu ⋮ → **Tambahkan ke layar utama / Instal aplikasi** → ikon D'Kriuk muncul
- [ ] Buka dari ikon → tampil layar penuh; login kasir sekali saat online

## Offline
- [ ] Mode pesawat → buka aplikasi dari ikon → tetap masuk (penanda **● Offline**)
- [ ] Buka toko (modal) → jual 2 transaksi → struk/Selesai menampilkan **No. sementara S…-001** dan **Kode struk**
- [ ] Riwayat menampilkan transaksi bertanda "belum terkirim"; cari dengan kode struk → ketemu
- [ ] Tutup toko (jawab sisa) → hitungan laci sesuai
- [ ] Matikan mode pesawat → penanda **0 belum terkirim**; Riwayat menunjukkan nomor resmi
- [ ] Keluar saat masih ada data belum terkirim → ditolak dengan pesan

## Dua perangkat
- [ ] Tablet & HP sama-sama offline, sama-sama buka toko & jualan → online → di admin/riwayat penjualan keduanya ada di **satu shift**

## Printer (dari Tahap 2)
- [ ] Sambungkan printer OKAY 58B dari aplikasi terpasang → struk tercetak; RawBT sebagai cadangan

Catatan hasil uji:
```

- [ ] **Step 7: Verifikasi penuh & commit**

Run: `npm test && npm run check && npm run build`
Expected: semua lulus.

```bash
git add .github scripts README.md docs
git commit -m "chore(pages): pasang otomatis ke GitHub Pages; E2E offline; docs Tahap 4a"
```
