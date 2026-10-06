# Tahap 4b — Batal, transfer, opname & stok awal offline; admin Perangkat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semua pekerjaan kasir yang tersisa (batal transaksi, catat rusak dari menu Stok, kirim/ubah/batal/terima transfer, opname, stok awal) berjalan tanpa internet lewat antrean 4a; admin bisa melihat perangkat & kejadian yang diabaikan; sisa catatan 4b dari review akhir 4a ditutup.

**Architecture:** Server: dua migrasi baru (0020 skema, 0021 fungsi) — fungsi `*_offline(p jsonb)` idempoten per id dari perangkat, memakai jam kejadian (dibatasi `_waktu_perangkat`). Klien: jenis kejadian baru di antrean Dexie yang sama (tanpa ganti versi skema karena indeks tidak berubah), pemetaan RPC di `pengirim.ts`, proyeksi murni (riwayat+batal, stok, transfer, hitungan) di `src/lib/offline/proyeksi-stok.ts` & `proyeksi.ts`, dan pemuat halaman stok kasir lewat salinan (`src/lib/stok/kasir-lokal.ts`).

**Tech Stack:** SvelteKit 3 (hash router, `#lib/...` dengan ekstensi), Svelte 5 runes, Tailwind 4, Supabase Postgres (RLS, security definer `search_path=''`), Dexie, Vitest + PGlite + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-10-08-tahap-4-offline-design.md` (+ "Catatan wajib" roadmap, butir Tahap 4b).

## Global Constraints

- Migrasi 0001–0019 sudah di server: **tidak boleh diubah**; perubahan = file baru `20261009000020_*`, `20261009000021_*`.
- Fungsi tulis: `security definer set search_path = ''`, revoke dari `public, anon`, grant ke `authenticated`; helper `_*` revoke juga dari `authenticated`.
- Pesan galat berbahasa Indonesia, errcode `22023` (isian/aturan) atau `42501` (hak akses); setiap pesan baru masuk allowlist klien (`pesanSinkron`/`pesanStok`/`pesanKasir`).
- Maks 1000 baris per file, satu tanggung jawab per file.
- Jangan commit rahasia/data bisnis; contoh harga di tes jangan sama dengan harga beli sungguhan (`tests/rahasia.test.ts`).
- Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Kunci: `_kunci_stok(outlet)` (advisory `stok:<outlet>`) diambil **sebelum** mengunci baris; jangan mengunci baris shift dari fungsi yang juga memegang kunci stok (hindari deadlock dengan `catat_penjualan_offline` yang memegang shift `for share` lalu kunci stok).

## Keputusan desain (dicatat di laporan)

1. **Batal offline** memakai jam batal di perangkat. Batal yang jamnya ≤ hitungan fisik (stok awal/opname) yang **disetujui** tidak mengembalikan stok (hitungan sudah mencerminkannya) — sejalan dengan aturan penjualan offline 4a. Batal yang tiba setelah tutup toko tetap diterima bila jam batalnya sebelum jam tutup; ringkasan diberi tanda "ada pembatalan masuk setelah tutup toko". Batal yang jamnya sesudah tutup tetap hanya admin.
2. **Batal yang sudah dibatalkan perangkat lain** dianggap berhasil (keinginan kasir tercapai), tidak masuk Perlu perhatian.
3. **Terima transfer offline**: stok pindah pada jam kasir menerima (tidak lebih awal dari jam kirim). Jumlah beda → ditolak saat sinkron → Perlu perhatian dengan pesan "Ada perbedaan jumlah…"; kasir bisa hitung ulang lewat halaman Terima (kiriman masih menunggu) lalu mengabaikan yang lama.
4. **Opname & stok awal offline** berlaku pada jam kasir menghitung (jam perangkat). Opname yang jamnya tidak lebih baru dari hitungan terakhir ditolak ("hitung ulang").
5. **Angka stok di perangkat** = stok server terakhir + kejadian yang belum tercermin (jual via resep, rusak, terima). Batal atas transaksi yang sudah di server tidak diproyeksikan (stok kembali setelah sinkron) — ditandai "perkiraan" saat ada antrean.
6. **Ringkasan Tutup toko** tetap menghitung transaksi yang ditolak server (uangnya ada di laci) tetapi menampilkannya terpisah dengan peringatan.

## Review Focus

1. Kiriman ulang setelah jawaban server hilang (batal, batal transfer, terima, opname, stok awal) → harus sukses, bukan "sudah …" yang masuk Perlu perhatian. Tes DB "kirim dua kali" per fungsi (Task 1–3).
2. Batal transaksi offline yang jamnya sebelum opname disetujui tetapi tiba sesudahnya → stok tidak bertambah dua kali. Tes DB Task 1.
3. Batal untuk transaksi yang masih di antrean (belum terkirim) → terkirim setelah jualnya; ringkasan Tutup toko tidak menghitungnya. Tes proyeksi Task 5 + urutan antrean Task 4.
4. Ganti akun di perangkat yang masih menyimpan antrean akun lain → kasir diberi tahu, data tidak terkirim atas nama akun salah. Tes Task 9.
5. Perangkat offline lama (salinan stok kemarin) + antrean berisi kejadian yang sudah terkirim → angka stok/shift tidak dihitung dua kali dan tidak hilang. Tes proyeksi Task 5–6 (`disimpanAt`).

---

### Task 1: Server — batal transaksi offline

**Files:**
- Create: `supabase/migrations/20261009000020_offline_4b_skema.sql`
- Create: `supabase/migrations/20261009000021_fungsi_offline_4b.sql` (bagian batal; Task 2–3 menambah ke file yang sama sebelum di-push)
- Test: `tests/db/offline-4b.test.ts`

**Interfaces:**
- Produces: RPC `void_penjualan_offline(p jsonb) returns jsonb` dengan `p = { penjualan_id, alasan, waktu, outlet_id?, perangkat_id? }` → `{ id, nomor, sudah_dibatalkan }`. `ringkasan_shift` menambah `batal_setelah_tutup` (integer).

- [ ] **Step 1: Skema (0020)**

```sql
-- Tahap 4b: batal, transfer, opname & stok awal dari antrean offline.
alter table public.penjualan
  -- Batal yang jamnya sebelum hitungan fisik yang disetujui tidak mengembalikan stok.
  add column void_tanpa_stok boolean not null default false,
  -- Jam batal sampai di server (void_at = jam batal di perangkat).
  add column void_dicatat_at timestamptz;

create or replace function public._gerakan_batal_jual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.void_tanpa_stok then
    return null;
  end if;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, penjualan_id)
  select g.outlet_id, g.bahan_id, -sum(g.qty), 'jual_batal', new.void_at, new.void_oleh, new.id
  from public.gerakan_stok g
  where g.penjualan_id = new.id and g.jenis = 'jual'
  group by g.outlet_id, g.bahan_id;
  return null;
end
$$;
```

- [ ] **Step 2: Tes gagal** — `tests/db/offline-4b.test.ts` (pola harness sama dengan `tests/db/offline.test.ts`): siapkan shift lewat `buka_shift_offline`, penjualan lewat `catat_penjualan_offline` (ori_dada, resep memotong stok). Kasus:
  - batal kasir: `void_at` = jam perangkat, stok kembali, `sudah_dibatalkan=false`; kirim dua kali → kedua `sudah_dibatalkan=true`, satu baris `jual_batal`.
  - alasan < 3 huruf → `/Alasan pembatalan wajib/`.
  - kasir outlet lain → `/Penjualan tidak ditemukan/`.
  - jam batal sebelum opname/stok awal disetujui (stok awal disetujui `mundurJam`, batal `waktu = now() - interval '2 hours'` untuk jual 3 jam lalu) → tidak ada baris `jual_batal`, `void_tanpa_stok = true`.
  - shift ditutup (tutup_shift_offline) lalu batal dengan jam **sebelum** tutup → diterima, `ringkasan_shift(...).batal_setelah_tutup = 1`; batal dengan jam **sesudah** tutup oleh kasir → `/hanya bisa dibatalkan admin/`; admin boleh.
  - jam batal lebih awal dari jam jual → `void_at = waktu jual`.

- [ ] **Step 3: Fungsi (0021, bagian batal)**

```sql
-- Tahap 4b: fungsi antrean offline untuk batal, transfer, opname & stok awal. Idempoten per id perangkat.

create function public.void_penjualan_offline(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'penjualan_id')::uuid;
  v_alasan text := trim(coalesce(p ->> 'alasan', ''));
  v_waktu timestamptz := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  v public.penjualan;
  s public.shift;
begin
  select * into v from public.penjualan where id = v_id;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = v.outlet_id, false)) then
    raise exception 'Penjualan tidak ditemukan' using errcode = '22023';
  end if;
  -- Kunci stok dulu (urutan sama dengan persetujuan hitungan), baru baris penjualan. Baris shift tidak dikunci.
  perform public._kunci_stok(v.outlet_id);
  select * into v from public.penjualan where id = v_id for update;
  if v.void_at is not null then
    return jsonb_build_object('id', v.id, 'nomor', v.nomor, 'sudah_dibatalkan', true);
  end if;
  if length(v_alasan) < 3 or length(v_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  v_waktu := greatest(v_waktu, v.waktu);
  select * into s from public.shift where id = v.shift_id;
  if s.ditutup_at is not null and not s.tutup_tertunda and v_waktu > s.ditutup_at and not public.is_admin() then
    raise exception 'Penjualan dari shift yang sudah ditutup hanya bisa dibatalkan admin' using errcode = '42501';
  end if;
  update public.penjualan
  set void_at = v_waktu, void_oleh = auth.uid(), void_alasan = v_alasan, void_dicatat_at = now(),
      void_tanpa_stok = coalesce(public._dihitung_disetujui(v.outlet_id) >= v_waktu, false)
  where id = v_id;
  return jsonb_build_object('id', v.id, 'nomor', v.nomor, 'sudah_dibatalkan', false);
end
$$;
```

`ringkasan_shift` diganti (`create or replace`, salin dari 0019) dengan tambahan kunci `'batal_setelah_tutup'`:

```sql
(select count(*)::integer from public.penjualan
 where shift_id = p_shift and s.ditutup_at is not null and not s.tutup_tertunda and void_dicatat_at > s.ditutup_at)
```

Grant/revoke: `revoke execute on function public.void_penjualan_offline(jsonb) from public, anon; grant ... to authenticated;`

- [ ] **Step 4: Jalankan** `npx vitest run tests/db/offline-4b.test.ts` → PASS; `npx vitest run tests/db` → PASS (void lama tetap jalan).
- [ ] **Step 5: Commit** `feat(db): batal transaksi dari antrean offline`

### Task 2: Server — transfer offline

**Files:** Modify `supabase/migrations/20261009000021_fungsi_offline_4b.sql`; Test `tests/db/offline-4b.test.ts`.

**Interfaces:**
- Produces: `kirim_transfer_offline(p jsonb) returns uuid` (`p = { id, outlet_id, dari_outlet_id, ke_outlet_id, item, catatan?, waktu }`), `batal_transfer_offline(p jsonb) returns void` (`{ transfer_id, alasan }`), `terima_transfer_offline(p jsonb) returns void` (`{ transfer_id, item, waktu }`). `ubah_transfer(p_id, p_item, p_catatan)` lama dipakai apa adanya (menerapkan ulang isi yang sama aman).

- [ ] **Step 1: Tes gagal** — kasus:
  - kirim offline: `dikirim_at` = jam perangkat; kirim dua kali → satu transfer.
  - batal offline dua kali → sukses keduanya; kasir outlet tujuan → `/Transfer tidak ditemukan/`.
  - terima offline: gerakan `transfer_keluar/masuk` ber-`waktu` jam terima perangkat (bukan `now()`), tidak lebih awal dari `dikirim_at`; dua kali → sukses, gerakan tidak ganda; jumlah beda → `/Ada perbedaan jumlah/`.
  - `terima_transfer` lama (online) tetap memakai `now()`.

- [ ] **Step 2: Implementasi**

```sql
-- Isi terima transfer dipindah ke sini supaya versi online (now) & offline (jam perangkat) sama persis.
create function public._terima_transfer(p_id uuid, p_item jsonb, p_waktu timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer;
  v_nama text;
  v_waktu timestamptz;
begin
  select * into t from public.transfer where id = p_id;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = t.ke_outlet_id, false)) then
    raise exception 'Transfer tidak ditemukan' using errcode = '22023';
  end if;
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
    where a.bahan_id is null or b.bahan_id is null or a.qty <> round(b.qty, 4)
  ) then
    select nama into v_nama from public.outlets where id = t.dari_outlet_id;
    raise exception 'Ada perbedaan jumlah. Silakan hubungi outlet pengirim (%)', v_nama using errcode = '22023';
  end if;
  v_waktu := greatest(p_waktu, t.dikirim_at);
  update public.transfer set status = 'diterima', diterima_at = v_waktu, diterima_oleh = auth.uid() where id = p_id;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, transfer_id)
  select t.dari_outlet_id, i.bahan_id, -i.qty, 'transfer_keluar'::public.jenis_gerakan, v_waktu, auth.uid(), p_id from public.transfer_item i where i.transfer_id = p_id
  union all
  select t.ke_outlet_id, i.bahan_id, i.qty, 'transfer_masuk'::public.jenis_gerakan, v_waktu, auth.uid(), p_id from public.transfer_item i where i.transfer_id = p_id;
end
$$;

create or replace function public.terima_transfer(p_id uuid, p_item jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._terima_transfer(p_id, p_item, now());
end
$$;

create function public.terima_transfer_offline(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'transfer_id')::uuid;
begin
  -- Kiriman ulang setelah jawaban hilang: sudah diterima = selesai.
  if exists (select 1 from public.transfer where id = v_id and status = 'diterima'
             and (public.is_admin() or coalesce(public.my_outlet_id() = ke_outlet_id, false))) then
    return;
  end if;
  perform public._terima_transfer(v_id, p -> 'item', public._waktu_perangkat((p ->> 'waktu')::timestamptz));
end
$$;

create function public.kirim_transfer_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_baru boolean := not exists (select 1 from public.transfer where id = (p ->> 'id')::uuid);
  v_id uuid;
begin
  v_id := public.kirim_transfer(p);
  if v_baru then
    update public.transfer set dikirim_at = public._waktu_perangkat((p ->> 'waktu')::timestamptz) where id = v_id;
  end if;
  return v_id;
end
$$;

create function public.batal_transfer_offline(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'transfer_id')::uuid;
begin
  if exists (select 1 from public.transfer where id = v_id and status = 'dibatalkan'
             and (public.is_admin() or coalesce(public.my_outlet_id() = dari_outlet_id, false))) then
    return;
  end if;
  perform public.batal_transfer(v_id, p ->> 'alasan');
end
$$;
```

Revoke `_terima_transfer(uuid, jsonb, timestamptz)` dari `public, anon, authenticated`; revoke/grant tiga fungsi baru.

- [ ] **Step 3:** `npx vitest run tests/db` → PASS (termasuk `stok-transfer.test.ts` lama).
- [ ] **Step 4: Commit** `feat(db): kirim, batal & terima transfer dari antrean offline`

### Task 3: Server — opname & stok awal offline + push migrasi

**Files:** Modify `supabase/migrations/20261009000021_fungsi_offline_4b.sql`; Test `tests/db/offline-4b.test.ts`; Modify `src/lib/offline/pesan.ts`, `src/lib/offline/pesan.test.ts`.

**Interfaces:**
- Produces: `ajukan_opname_offline(p jsonb) returns uuid` dan `ajukan_stok_awal_offline(p jsonb) returns uuid`, `p = { id, outlet_id, item, waktu }`; `dihitung_at` = jam perangkat.

- [ ] **Step 1: Tes gagal** — kasus: opname offline memakai id & `dihitung_at` perangkat; dua kali → id sama, satu ajuan; kasir outlet lain dengan id sama → `/tidak berhak/`; jam ≤ hitungan terakhir → `/lebih lama dari hitungan stok terakhir/`; transfer menunggu → `/Selesaikan kiriman/`; persetujuan memakai saldo s.d. jam perangkat (penjualan yang jamnya sesudah jam hitung tidak ikut terkoreksi). Stok awal: sama (dua kali, `dihitung_at`, sudah disetujui → `/sudah disetujui/`).

- [ ] **Step 2: Implementasi**

```sql
create function public.ajukan_opname_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid := (p ->> 'id')::uuid;
  v_waktu timestamptz := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
begin
  perform public._cek_akses_outlet(v_outlet);
  if v_id is null then
    raise exception 'Data opname tidak lengkap' using errcode = '22023';
  end if;
  perform public._kunci_stok(v_outlet);
  if exists (select 1 from public.opname where id = v_id) then
    if not exists (select 1 from public.opname where id = v_id and outlet_id = v_outlet) then
      raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
    end if;
    return v_id;
  end if;
  if not exists (select 1 from public.stok_awal where outlet_id = v_outlet and status = 'disetujui') then
    raise exception 'Opname butuh stok awal yang sudah disetujui' using errcode = '22023';
  end if;
  if exists (select 1 from public.opname where outlet_id = v_outlet and status = 'diajukan') then
    raise exception 'Opname outlet ini masih menunggu persetujuan admin' using errcode = '22023';
  end if;
  if exists (select 1 from public.transfer where status = 'dikirim' and (dari_outlet_id = v_outlet or ke_outlet_id = v_outlet)) then
    raise exception 'Selesaikan kiriman/penerimaan dulu sebelum opname' using errcode = '22023';
  end if;
  if public._dihitung_terakhir(v_outlet) >= v_waktu then
    raise exception 'Opname ini lebih lama dari hitungan stok terakhir; hitung ulang' using errcode = '22023';
  end if;
  perform public._cek_isian_stok(p -> 'item');
  insert into public.opname (id, outlet_id, diajukan_oleh, dihitung_at) values (v_id, v_outlet, auth.uid(), v_waktu);
  insert into public.opname_item (opname_id, bahan_id, qty_hitung)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric);
  return v_id;
end
$$;

create function public.ajukan_stok_awal_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid := (p ->> 'id')::uuid;
  v_waktu timestamptz := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
begin
  perform public._cek_akses_outlet(v_outlet);
  if v_id is null then
    raise exception 'Data stok awal tidak lengkap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stok_awal:' || v_outlet::text, 0));
  if exists (select 1 from public.stok_awal where id = v_id) then
    if not exists (select 1 from public.stok_awal where id = v_id and outlet_id = v_outlet) then
      raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
    end if;
    return v_id;
  end if;
  if exists (select 1 from public.stok_awal where outlet_id = v_outlet and status = 'disetujui') then
    raise exception 'Stok awal outlet ini sudah disetujui; koreksi berikutnya lewat opname' using errcode = '22023';
  end if;
  if exists (select 1 from public.stok_awal where outlet_id = v_outlet and status = 'diajukan') then
    raise exception 'Stok awal outlet ini masih menunggu persetujuan admin' using errcode = '22023';
  end if;
  perform public._cek_isian_stok(p -> 'item');
  insert into public.stok_awal (id, outlet_id, diajukan_oleh, dihitung_at) values (v_id, v_outlet, auth.uid(), v_waktu);
  insert into public.stok_awal_item (stok_awal_id, bahan_id, qty_hitung)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric);
  return v_id;
end
$$;
```

- [ ] **Step 3: Allowlist** — `PESAN_OFFLINE` di `src/lib/offline/pesan.ts` ditambah `Data opname tidak lengkap|Data stok awal tidak lengkap|Opname ini lebih lama dari hitungan stok terakhir`; tes `pesan.test.ts` untuk satu pesan baru. Tes allowlist yang membaca migrasi harus lulus.
- [ ] **Step 4:** `npm test` → PASS. Push migrasi ke server (`npm run sb -- db push` sesuai pola 4a; tampilkan hanya daftar migrasi). Jalankan `scripts/uji-offline.ts` lama → lulus.
- [ ] **Step 5: Commit** `feat(db): opname & stok awal dari antrean offline`

### Task 4: Klien — jenis kejadian baru, pengirim, pembentuk kejadian

**Files:** Modify `src/lib/offline/db.ts`, `src/lib/offline/pengirim.ts`, `src/lib/kasir/offline-kasir.ts`, `src/routes/kasir/perlu-perhatian/+page.svelte`; Test `src/lib/kasir/offline-kasir.test.ts`, `src/lib/offline/antrean.test.ts`.

**Interfaces:**
- Produces: `JenisKejadian = 'buka_shift' | 'jual' | 'tutup_shift' | 'rusak' | 'batal_jual' | 'kirim_transfer' | 'ubah_transfer' | 'batal_transfer' | 'terima_transfer' | 'opname' | 'stok_awal'`; `LABEL_KEJADIAN: Record<JenisKejadian, string>` (di `src/lib/offline/label.ts`, dipakai Perlu perhatian & admin); pembentuk di `offline-kasir.ts`:
  - `buatKejadianBatal(outletId, shiftId, penjualanId, alasan, waktu)` → `{ jenis: 'batal_jual', shift_id: shiftId, data: { penjualan_id, alasan } }`
  - `buatKejadianKirim(outletId, a: { keOutletId, item, catatan? }, waktu)` → `{ jenis: 'kirim_transfer', id = id transfer, data: { ke_outlet_id, item, catatan? } }`
  - `buatKejadianUbah(outletId, transferId, item, catatan, waktu)`, `buatKejadianBatalTransfer(outletId, transferId, alasan, waktu)`, `buatKejadianTerima(outletId, transferId, item, waktu)` (data `{ transfer_id, item, … }`)
  - `buatKejadianHitung(jenis: 'opname' | 'stok_awal', outletId, item, waktu)` (`id` kejadian = id opname/stok awal)
  - Semua `id` acak via `crypto.randomUUID()` kecuali yang disebut; `shift_id: null` kecuali batal.
- Pengirim: `batal_jual → void_penjualan_offline({p: {...dasar}})`; `kirim_transfer → kirim_transfer_offline({p: {...dasar, id: k.id, dari_outlet_id: k.outlet_id}})`; `ubah_transfer → ubah_transfer({p_id, p_item, p_catatan})`; `batal_transfer → batal_transfer_offline`; `terima_transfer → terima_transfer_offline`; `opname → ajukan_opname_offline({p: {...dasar, id: k.id}})`; `stok_awal → ajukan_stok_awal_offline`.

- [ ] **Step 1: Tes gagal** — `offline-kasir.test.ts`: tiap pembentuk menghasilkan jenis, id, shift_id, data, waktu ISO yang benar; `antrean.test.ts`: batal dengan `shift_id` milik buka yang ditolak ikut tertahan; urutan jual → batal dikirim berurutan.
- [ ] **Step 2: Implementasi** sesuai Interfaces; `switch` di pengirim memakai `const _cek: never = k.jenis` di cabang default agar jenis baru tidak terlewat. Perlu perhatian memakai `LABEL_KEJADIAN` dan `ringkas` untuk batal (`alasan`) & transfer/hitungan (`N bahan`).
- [ ] **Step 3:** `npm test && npm run check` → PASS.
- [ ] **Step 4: Commit** `feat(offline): jenis kejadian batal, transfer & hitungan`

### Task 5: Proyeksi riwayat, ringkasan & shift

**Files:** Modify `src/lib/offline/proyeksi.ts`, `src/lib/offline/salinan.ts`, `src/lib/kasir/pos.svelte.ts`, `src/lib/kasir/types.ts`; Test `src/lib/offline/proyeksi.test.ts`, `src/lib/offline/salinan.test.ts`.

**Interfaces:**
- `denganSalinan` kini mengembalikan `{ nilai, dariSalinan, disimpanAt: string }` (saat dari server = jam sekarang).
- `shiftLokal(server, kejadian, outletId, disimpanAt?: string | null)` — selain `menunggu`, kejadian buka/tutup `terkirim` dengan `terkirim_at > disimpanAt` ikut diterapkan; buka terkirim memakai `hasil` (id shift server) sebagai id.
- `PenjualanLokal` tambah `batal_kirim: 'menunggu' | 'ditolak' | null` dan `batal_lokal: boolean` (dibatalkan oleh antrean, server belum tahu).
- `gabungRiwayat`: kejadian `batal_jual` berstatus `menunggu` / `terkirim` untuk penjualan di daftar → `void_at = k.waktu`, `void_alasan`, `batal_lokal = (baris server belum void)`; `ditolak` → `batal_kirim = 'ditolak'` tanpa mengubah void.
- `ringkasanLokal`: baris server dengan `batal_lokal` dikurangkan dari jumlah/total/per metode/cash dan `jumlah_void++`; baris lokal ber-`void_at` tidak dihitung tetapi `jumlah_void++`; hasil tambah `jumlah_ditolak`, `total_ditolak` (opsional di tipe `Ringkasan`) dari baris `status_kirim === 'ditolak'`.
- `Ringkasan` tambah opsional `digabung?`, `jual_setelah_tutup?`, `batal_setelah_tutup?`, `dibuka_lagi_setelah?`, `jumlah_ditolak?`, `total_ditolak?`.

- [ ] **Step 1: Tes gagal** — kasus: batal menunggu atas baris server → ringkasan cash berkurang & void +1; batal atas jual lokal menunggu → tidak dihitung; batal ditolak → tetap dihitung, `batal_kirim='ditolak'`; jual ditolak → masuk `jumlah_ditolak/total_ditolak` dan tetap di total; `shiftLokal` dengan salinan lama + tutup terkirim sesudah `disimpanAt` → null; tutup terkirim sebelum `disimpanAt` → diabaikan (server sudah tahu).
- [ ] **Step 2: Implementasi**; `pos.muatShift` meneruskan `disimpanAt`.
- [ ] **Step 3:** `npm test && npm run check` → PASS.
- [ ] **Step 4: Commit** `feat(offline): proyeksi batal & shift dari antrean`

### Task 6: Proyeksi stok, transfer & hitungan + pemuat halaman stok

**Files:** Create `src/lib/offline/proyeksi-stok.ts`, `src/lib/offline/proyeksi-stok.test.ts`, `src/lib/stok/kasir-lokal.ts`; Modify `src/lib/master/api.ts` (bila perlu tipe Resep).

**Interfaces:**
- `stokLokal(server: Map<string, number>, kejadian: Kejadian[], resep: { menu_id: string; bahan_id: string; qty: number }[], outletId: string, disimpanAt: string | null): Map<string, number>` — terapkan kejadian outlet ini yang `menunggu`, atau `terkirim` dengan `terkirim_at > disimpanAt`: `jual` (kecuali yang punya batal menunggu/terkirim) → −qty×resep; `rusak` → −qty; `terima_transfer` → +qty. Yang lain tidak mengubah stok.
- `transferLokal(server: Transfer[], kejadian, outletId, disimpanAt): (Transfer & { lokal: boolean })[]` — `kirim_transfer` → tambah baris `dikirim` (item dari data, `dikirim_at = waktu`), `ubah_transfer` → ganti item, `batal_transfer` → `dibatalkan`, `terima_transfer` → `diterima`; baris server dengan id sama tidak digandakan.
- `hitunganLokal<T extends { id: string; status: string; dihitung_at: string }>(server: T[], kejadian, jenis: 'opname' | 'stok_awal', outletId, disimpanAt): T[]` — kejadian menunggu/terkirim-baru → baris `diajukan` dengan `dihitung_at = waktu` (item dari data untuk stok awal).
- `antreanAda(kejadian, outletId): boolean` — ada kejadian `menunggu` outlet ini (untuk label "perkiraan").
- `kasir-lokal.ts`: `muatStokKasir(outletId): Promise<{ data: DataStok; stok: Map<string, number>; awal: StokAwal[]; opname: Opname[]; transfer: Transfer[]; outlets: Outlet[]; dariSalinan: boolean; perkiraan: boolean }>` memakai `denganSalinan(dbKasir, kunci, …)` dengan kunci `data-stok`, `outlets`, `resep`, `stok:<id>`, `stok-awal:<id>`, `opname:<id>`, `transfer:<id>`, lalu menerapkan proyeksi dengan `dbKasir.kejadian.toArray()`. `disimpanAt` per kunci = yang tertua dari salinan yang dipakai.

- [ ] **Step 1: Tes gagal** (`proyeksi-stok.test.ts`) — jual 2× menu dengan resep 1 bahan → −2; jual dengan batal menunggu → 0; rusak & terima; kejadian outlet lain diabaikan; terkirim sebelum `disimpanAt` diabaikan; transfer kirim→ubah→batal; terima mengubah status; opname menunggu muncul `diajukan` sehingga `perluOpname` false.
- [ ] **Step 2: Implementasi.**
- [ ] **Step 3:** `npm test && npm run check` → PASS.
- [ ] **Step 4: Commit** `feat(offline): proyeksi stok, transfer & hitungan untuk layar stok`

### Task 7: Layar kasir — Riwayat (batal offline) & Tutup toko

**Files:** Modify `src/routes/kasir/riwayat/+page.svelte`, `src/routes/kasir/tutup/+page.svelte`, `src/lib/components/kasir/RingkasanShift.svelte`.

- [ ] **Step 1:** Riwayat: batal untuk baris `server`, `menunggu`, `terkirim` yang belum void (bukan `ditolak`) → `tambahKejadian(buatKejadianBatal(...))` + `sinkron.jalankan()`; tanpa syarat online. Tampilkan "Dibatalkan (belum terkirim)" untuk `batal_lokal`/batal menunggu, "Batal ditolak server: …" untuk `batal_kirim='ditolak'`. Cegah dobel: tombol hilang setelah ada kejadian batal menunggu.
- [ ] **Step 2:** RingkasanShift: baris catatan bila ada — "Digabung dari beberapa perangkat", "N penjualan masuk setelah tutup toko", "N pembatalan masuk setelah tutup toko", "Dibuka lagi setelah ditutup jam …", dan peringatan "Termasuk N transaksi ditolak server (RpX). Cek Perlu perhatian."
- [ ] **Step 3:** `npm run check && npm test` → PASS; cek manual `npm run dev` (offline di DevTools): jual → batal → Tutup toko angka benar.
- [ ] **Step 4: Commit** `feat(kasir): batal transaksi offline & catatan ringkasan shift`

### Task 8: Layar kasir — Stok, Rusak, Kirim, Terima, Opname, Stok awal offline

**Files:** Modify `src/routes/kasir/stok/+page.svelte`, `.../rusak/+page.svelte`, `.../kirim/+page.svelte`, `.../terima/+page.svelte`, `.../opname/+page.svelte`, `.../awal/+page.svelte`, `src/routes/kasir/+layout.svelte`.

- [ ] **Step 1:** Semua halaman memuat lewat `muatStokKasir` (bukan `muat*` langsung) dan memuat ulang saat `sinkron.terakhir`/`sinkron.menunggu` berubah. Tampilkan "Data dari perangkat (terakhir online …)" bila `dariSalinan`, dan "Angka perkiraan, N data belum terkirim" bila `perkiraan`.
- [ ] **Step 2:** Rusak → `buatKejadianRusak`; Kirim/Ubah/Batal → pembentuk transfer; Terima → `buatKejadianTerima` (pesan: "Tercatat. Dicocokkan dengan pengirim saat sinkron."); Opname/Stok awal → `buatKejadianHitung`. Semua: `tambahKejadian(dbKasir, { ...k, user_id })` lalu `void sinkron.jalankan()`; id formulir tetap per formulir (simpan dua kali tidak ganda).
- [ ] **Step 3:** Layout: setelah sinkron selesai dan online, panggil `muatStokKasir(outlet.id)` di latar (mengisi salinan supaya halaman stok siap dibuka offline). Halaman yang belum pernah punya salinan saat offline menampilkan "Buka halaman ini sekali saat online".
- [ ] **Step 4:** `npm run check && npm test && npm run build` → PASS; cek manual offline.
- [ ] **Step 5: Commit** `feat(kasir): halaman stok bekerja tanpa internet`

### Task 9: Pengerasan sinkron (catatan 4b)

**Files:** Modify `src/lib/offline/sinkron.svelte.ts`, `src/lib/offline/antrean.ts`, `src/service-worker.ts`, `src/routes/kasir/+layout.svelte`, `src/routes/login/+page.svelte`; Test `src/lib/offline/antrean.test.ts`.

**Interfaces:**
- `bersihkanTerkirim(db, sebelum)` tidak menghapus kejadian dari shift yang belum punya kejadian `tutup_shift` di perangkat (shift lintas hari tetap terproyeksi).
- `hitungMilikLain(db, userId): Promise<number>` — kejadian `menunggu`/`ditolak` dengan `user_id` lain.
- `sinkron.jalankan` dibungkus `navigator.locks.request('dk-sinkron', { ifAvailable: true }, …)` bila tersedia (dua tab tidak mengirim bersamaan).
- Service worker: navigasi menunggu jaringan paling lama 4 detik, lalu `index.html` tersimpan.

- [ ] **Step 1: Tes gagal** — `bersihkanTerkirim` menyimpan jual terkirim lama dari shift tanpa tutup, menghapus yang shift-nya sudah ditutup & kejadian tanpa shift; `hitungMilikLain`.
- [ ] **Step 2: Implementasi**; layout kasir menampilkan pita "Ada N data belum terkirim milik akun lain di perangkat ini. Minta akun itu masuk untuk mengirimnya."; halaman login menampilkan "Perangkat ini masih menyimpan N data belum terkirim" bila antrean tidak kosong.
- [ ] **Step 3:** `npm test && npm run check && npm run build` → PASS.
- [ ] **Step 4: Commit** `fix(offline): kunci antar-tab, pembersihan aman, peringatan antrean akun lain`

### Task 10: Admin — Perangkat & kejadian diabaikan

**Files:** Create `src/lib/admin/perangkat.ts`, `src/lib/admin/perangkat.test.ts`, `src/routes/admin/perangkat/+page.svelte`; Modify `src/lib/components/layout/AdminNav.svelte`.

**Interfaces:**
- `muatPerangkat(): Promise<Perangkat[]>` (`perangkat` + `outlets(nama)` + `profiles!terakhir_oleh(nama_tampilan)`), `muatDiabaikan(): Promise<Diabaikan[]>` (100 terbaru).
- `statusSinkron(terakhir: string | null, sekarang: Date): 'baru' | 'lama' | 'belum'` — lama bila > 24 jam.
- `ringkasData(jenis: string, data: Record<string, unknown>): string` — mis. jual: "S1-012 · kode K7Q2MX · Rp25.000".

- [ ] **Step 1: Tes gagal** untuk `statusSinkron` & `ringkasData`.
- [ ] **Step 2: Implementasi** halaman: tabel perangkat (kode, outlet, pengguna terakhir, sinkron terakhir + tanda "lama tidak sinkron"), daftar kejadian diabaikan (jam, outlet, jenis memakai `LABEL_KEJADIAN`, ringkas, alasan ditolak, alasan diabaikan, oleh). Menu admin "Perangkat".
- [ ] **Step 3:** `npm test && npm run check` → PASS.
- [ ] **Step 4: Commit** `feat(admin): halaman perangkat & kejadian diabaikan`

### Task 11: E2E server, daftar uji, laporan

**Files:** Create `scripts/uji-offline-4b.ts`; Create `docs/uji/tahap-4b-offline-owner.md`; Modify `docs/laporan-pembuatan.md`, `docs/superpowers/plans/2026-10-04-00-roadmap.md`, `package.json` (skrip `uji:offline-4b` bila pola ada).

- [ ] **Step 1:** E2E (pola `scripts/uji-offline.ts`: outlet & akun sementara, dibersihkan): batal offline dua kali, kirim→terima offline (jumlah beda ditolak, sama diterima, dua kali aman), opname offline dua kali, stok awal offline. Jalankan `node --env-file=.env.local scripts/uji-offline-4b.ts` → semua OK.
- [ ] **Step 2:** Daftar uji owner 4b (mode pesawat: batal, rusak, kirim/terima antar dua outlet, opname; admin Perangkat).
- [ ] **Step 3:** Laporan: status 4b, keputusan desain 1–6; roadmap: 4b selesai, catatan sisa untuk Tahap 5/7.
- [ ] **Step 4: Commit** `docs: Tahap 4b — uji, laporan, roadmap`
