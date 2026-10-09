# Tahap 5a — Kas harian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buku kas laci per outlet yang terus berjalan (jual cash, batal, pengeluaran, setoran; dijangkarkan oleh hitungan tutup toko), pengeluaran & setoran kasir (offline), konfirmasi setoran owner, dan layar admin Kas harian / Setoran / Pengeluaran / Penjualan.

**Architecture:** Server: migrasi 0022 (skema) & 0023 (fungsi). Saldo laci tidak disimpan — dihitung `_saldo_laci(outlet, jam, kecuali_shift)` dari jangkar terakhir (`laci_awal` atau tutup shift) + gerakan sesudahnya, sehingga data offline yang telat memperbarui selisih shift-nya tanpa menggeser saldo sesudahnya. Klien: jenis kejadian `pengeluaran` & `setoran` di antrean Tahap 4; proyeksi saldo laci murni (`src/lib/offline/proyeksi-laci.ts`); menu kasir **Kas** (pengeluaran + setoran); halaman admin baru.

**Tech Stack:** SvelteKit 3 (hash router, `#lib/...` berekstensi), Svelte 5 runes, Tailwind 4, Supabase Postgres (RLS, security definer `search_path=''`), Dexie, Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-10-09-tahap-5a-kas-harian-design.md`

## Global Constraints

- Migrasi 0001–0021 di server: tidak boleh diubah; baru = `20261010000022_*`, `20261010000023_*`. Push hanya setelah review akhir.
- Fungsi tulis `security definer set search_path = ''`; revoke `public, anon`, grant `authenticated`; helper `_*` revoke juga dari `authenticated`. Tabel baru: RLS aktif, hak eksplisit (select untuk authenticated sesuai kebijakan; tulis hanya lewat fungsi), `service_role` all.
- Pesan galat Indonesia, errcode `22023`/`42501`, masuk allowlist klien (pola tes membaca migrasi).
- Uang dalam rupiah bulat (`integer`/`bigint`), batas 1..100.000.000 per baris.
- Kunci: `_kunci_stok` tidak dipakai; pengeluaran/setoran cukup advisory per id.
- ≤1000 baris per file; contoh nominal di tes tidak boleh sama dengan harga beli asli (`tests/rahasia.test.ts`).
- Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Contoh owner: laci 100.000 → jual cash 800.000/600.000/1.200.000 (tiga hari, tiga shift) − pengeluaran 100.000 → saldo 2.600.000; setoran 2.500.000 → 100.000. Tes DB Task 1–2 & proyeksi Task 4.
2. Penjualan offline berjam sebelum tutup yang tiba sesudahnya → selisih shift itu berubah, saldo sekarang tidak. Tes DB Task 1.
3. Koreksi admin (batal pengeluaran/setoran, batal penjualan shift tertutup) tidak menggeser saldo sesudah jangkar. Tes DB Task 2–3.
4. Setoran dicatat saat toko tutup (malam) → saldo besok pagi sudah berkurang; buka toko berikutnya modal = saldo itu. Tes DB Task 1–2 & proyeksi Task 4.
5. Outlet pertama kali: buka toko meminta uang laci awal sekali; perangkat kedua yang membuka bersamaan tidak membuat laci awal ganda. Tes DB Task 1.

---

### Task 1: Skema & saldo laci (0022 + bagian awal 0023)

**Files:** Create `supabase/migrations/20261010000022_kas_skema.sql`, `supabase/migrations/20261010000023_fungsi_kas.sql`; Test `tests/db/kas.test.ts`.

**Interfaces (produces):**
- Tabel `laci_awal (outlet_id pk, jumlah integer 0..100000000, waktu, oleh, dicatat_at)`; `kategori_pengeluaran (id uuid, nama unik, untuk_kasir, wajib_keterangan, aktif, urutan)` + seed; `pengeluaran (id, outlet_id, sumber 'laci'|'luar', kategori_id, jumlah, waktu, keterangan, dicatat_oleh, perangkat_id, dicatat_at, batal_at/oleh/alasan)`; `setoran (id, outlet_id, jumlah, waktu, catatan, dicatat_oleh, perangkat_id, dicatat_at, diterima_at/oleh, jumlah_diterima, catatan_terima, batal_at/oleh/alasan)`; `penjualan.void_koreksi boolean default false`.
- Backfill: `laci_awal` dari shift pertama tiap outlet (`modal`, `dibuka_at`).
- Trigger `_jaga_outlet_aktif` BEFORE INSERT pada `shift` & `penjualan` → `'Outlet ini nonaktif'`.
- `_saldo_laci(p_outlet uuid, p_jam timestamptz, p_kecuali uuid default null) returns bigint`; `saldo_laci(p_outlet uuid) returns jsonb {saldo, jangkar_at, ada_awal}` (kasir outlet sendiri / admin).
- `ringkasan_shift` (replace): `cash_seharusnya = _saldo_laci(outlet, coalesce(ditutup_at, now()), id)`, `selisih = uang_fisik − cash_seharusnya`, tambah `pengeluaran_laci`, `setoran` (jumlah di jendela shift).
- `buka_shift_offline` (replace dari 0019): menerima `laci_awal` (wajib bila outlet belum punya; disimpan sekali, `on conflict do nothing`), `shift.modal` = `_saldo_laci(outlet, waktu)`.

- [ ] Tes gagal: saldo contoh owner (tiga shift: buka → jual cash → tutup dengan uang fisik pas), selisih shift; jual offline berjam sebelum tutup tiba sesudahnya (selisih berubah, saldo tetap); buka pertama tanpa `laci_awal` → `'Uang laci awal wajib diisi'`; dua perangkat → satu laci_awal; modal shift = saldo; outlet nonaktif ditolak; kasir outlet lain tidak bisa membaca saldo.
- [ ] Implementasi, `npx vitest run tests/db` PASS, commit `feat(db): buku kas laci & saldo`.

### Task 2: Pengeluaran & setoran (server)

**Files:** Modify `20261010000023_fungsi_kas.sql`; Test `tests/db/kas.test.ts`.

**Interfaces:** `catat_pengeluaran_offline(p {id, outlet_id, kategori_id, jumlah, keterangan?, waktu}) returns uuid` (kasir: sumber laci, kategori untuk_kasir; idempoten); `catat_pengeluaran_admin(p {id, outlet_id, sumber, kategori_id, jumlah, keterangan?, tanggal?|waktu?})`; `batal_pengeluaran(p_id, p_alasan)` (admin); `catat_setoran_offline(p {id, outlet_id, jumlah, catatan?, waktu}) returns uuid`; `terima_setoran(p_id, p_jumlah, p_catatan)` (admin; jumlah beda → catatan wajib); `batal_setoran(p_id, p_alasan)` (admin, belum diterima); `simpan_kategori(p {id?, nama, untuk_kasir, wajib_keterangan, aktif})` (admin).

- [ ] Tes gagal: pengeluaran laci mengurangi saldo; kategori admin ditolak untuk kasir; keterangan wajib "Lain-lain"; idempoten; batal = koreksi (saldo sesudah jangkar tetap, selisih shift lama terkoreksi); setoran malam setelah tutup → saldo besok berkurang; terima setoran dengan selisih; batal setoran yang sudah diterima ditolak; hak akses.
- [ ] Implementasi + allowlist pesan (`src/lib/offline/pesan.ts`, tes membaca 0023), commit `feat(db): pengeluaran & setoran`.

### Task 3: Kas harian & batal admin (server) + push

**Files:** Modify `20261010000023_fungsi_kas.sql`; Test `tests/db/kas.test.ts`.

**Interfaces:** `kas_harian(p_outlet uuid, p_dari date, p_sampai date) returns jsonb` (admin; maks 62 hari) — array per tanggal `{tanggal, per_metode {metode: {jumlah,total}}, total, jumlah_batal, pengeluaran_laci [{kategori, jumlah}], pengeluaran_luar [{kategori, jumlah}], belanja_bahan, setoran, saldo_awal, saldo_akhir, selisih}`; `void_penjualan` (replace dari 0009): admin pada shift tertutup → `void_koreksi = true`.

- [ ] Tes gagal: kas harian dua hari (penjualan per kanal, pengeluaran, setoran, saldo awal/akhir, selisih); belanja bahan + koreksi batal pada tanggal batal; void admin shift tertutup → saldo sekarang tetap, ringkasan shift lama berubah.
- [ ] Implementasi, `npm test` PASS, commit.

### Task 4: Klien — kejadian & proyeksi saldo laci

**Files:** Modify `src/lib/offline/db.ts`, `label.ts`, `pengirim.ts`, `src/lib/kasir/offline-kasir.ts`; Create `src/lib/offline/proyeksi-laci.ts` (+test).

**Interfaces:** jenis `pengeluaran` → `catat_pengeluaran_offline({p: {...dasar, id}})`, `setoran` → `catat_setoran_offline`; `buatKejadianPengeluaran(outletId, {kategoriId, jumlah, keterangan?}, waktu)`, `buatKejadianSetoran(outletId, jumlah, catatan, waktu)`; `buatKejadianBuka(outletId, modal, waktu, laciAwal?)`; `buatKejadianBatal(..., penjualan?: {metode, total})` (data untuk proyeksi laci). `saldoLaciLokal(server: {saldo, ada_awal} | null, kejadian, outletId, disimpanAt): {saldo: number; adaAwal: boolean}` — terapkan yang belum tercermin berurutan: buka+laci_awal (set), jual cash (+, kecuali dibatalkan di antrean), batal cash (−, bila jualnya tidak di antrean), pengeluaran (−), setoran (−), tutup (saldo = uang_fisik).

- [ ] Tes proyeksi (contoh owner, setoran setelah tutup, batal jual antrean, outlet lain diabaikan) → implementasi → commit.

### Task 5: Layar kasir

**Files:** Modify `src/lib/components/kasir/ModalShift.svelte`, `src/routes/kasir/tutup/+page.svelte`, `src/lib/components/kasir/RingkasanShift.svelte`, `src/lib/components/kasir/KasirNav.svelte`, `src/lib/offline/proyeksi.ts` (ringkasanLokal memakai saldo laci); Create `src/routes/kasir/kas/+page.svelte`, `src/lib/kas/api.ts`, `src/lib/kas/laci.svelte.ts` (muat saldo + kategori lewat salinan).

- [ ] Buka toko: "Uang di laci sekarang RpX" (atau isian uang laci awal bila belum ada) → Buka. Tutup toko: uang seharusnya = saldo laci lokal; ringkasan menampilkan pengeluaran & setoran; pesan selesai "Uang di laci RpX. Catat setoran di menu Kas." Menu **Kas**: formulir pengeluaran (kategori kasir, nominal, keterangan) & setoran (saldo laci, jumlah, catatan), daftar hari ini dari server + antrean. Nav kasir: Jualan · Riwayat · Stok · Kas · Tutup toko.
- [ ] `npm run check && npm test && npm run build` → commit.

### Task 6: Layar admin

**Files:** Create `src/routes/admin/kas/+page.svelte` (Kas harian), `src/routes/admin/setoran/+page.svelte`, `src/routes/admin/pengeluaran/+page.svelte`, `src/routes/admin/penjualan/+page.svelte`, `src/lib/kas/admin.ts` (+test fungsi murni ringkasan), modify `AdminNav.svelte`, `src/routes/admin/+page.svelte`.

- [ ] Kas harian (outlet/semua, rentang ≤ 62 hari, default 7 hari terakhir), Setoran (belum diterima: Terima dengan jumlah & catatan, Batal; riwayat), Pengeluaran (gabungan pengeluaran + barang masuk, tambah pengeluaran admin, kategori, batal), Penjualan (outlet + tanggal, cari nomor/kode struk, batal dengan alasan).
- [ ] check/test/build → commit.

### Task 7: E2E, push, docs

**Files:** Create `scripts/uji-kas.ts`, `docs/uji/tahap-5a-kas-owner.md`; Modify `docs/laporan-pembuatan.md`, roadmap.

- [ ] Setelah review akhir: push 0022–0023, E2E (contoh owner di server dengan outlet & akun sementara, bersih), semua E2E lama, daftar uji owner, laporan & roadmap, commit.
