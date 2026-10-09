# Tahap 5b — Gaji, sewa, laba-rugi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karyawan, kehadiran (admin), kasbon (laci/owner, kasir offline), gaji bulanan, biaya tetap (sewa), laporan laba-rugi sederhana & arus kas.

**Architecture:** Migrasi 0024 (skema) & 0025 (fungsi). Kasbon & pembayaran gaji = baris `pengeluaran` berkategori sistem (`kode`), sehingga buku kas laci 5a tidak berubah. `laporan_keuangan` menghitung laba-rugi & arus kas di server. Klien: jenis kejadian `kasbon`; halaman admin Gaji, Biaya tetap, Laba-rugi.

**Tech Stack:** sama dengan Tahap 5a.

**Spec:** `docs/superpowers/specs/2026-10-09-tahap-5b-gaji-labarugi-design.md`

## Global Constraints

- Migrasi 0001–0023 di server, tidak boleh diubah; baru `20261011000024_*`, `20261011000025_*`; push setelah review akhir. `create or replace` atas fungsi lama hanya bila perlu (catat di review).
- Pola keamanan, pesan, ukuran file, rahasia, commit sama dengan Tahap 5a.
- Upah karyawan tidak boleh terbaca kasir.

## Review Focus

1. Gaji sudah dibayar → kehadiran bulan itu terkunci; batal gaji membuka lagi & mengoreksi laci. Tes DB Task 1.
2. Sisa kasbon tidak bisa negatif (potongan ≤ sisa; batal kasbon yang sudah dipotong ditolak). Tes DB Task 1.
3. Laba-rugi tidak menghitung dua kali: pembayaran gaji/sewa/kasbon tidak masuk "pengeluaran lain"; belanja bahan dari Barang masuk + kategori belanja bahan. Tes DB Task 2.
4. Kasbon dari laci (offline) mengurangi saldo laci di server & perangkat. Tes DB Task 1 & unit Task 3.
5. Sewa berubah di tengah periode → bagian per hari mengikuti baris yang berlaku. Tes DB Task 2.

### Task 1: Skema + karyawan, kehadiran, kasbon, gaji (server)
Files: `supabase/migrations/20261011000024_gaji_skema.sql`, `20261011000025_fungsi_gaji.sql`, `tests/db/gaji.test.ts`. Fungsi: `simpan_karyawan(p)`, `karyawan_outlet(p_outlet)` (id, nama aktif; kasir), `atur_kehadiran(p_karyawan, p_tanggal, p_hadir)`, `catat_kasbon_offline(p)`, `catat_kasbon_admin(p)`, `sisa_kasbon(p_karyawan)` internal, `hitung_gaji(p_outlet, p_bulan)`, `bayar_gaji(p)`, `batal_gaji(p_id, p_alasan)`; `batal_pengeluaran` (replace 0023): tolak kategori gaji, kasbon hanya bila sisa cukup.

### Task 2: Biaya tetap & laporan keuangan (server) + push
Files: migrasi 0025, `tests/db/laporan.test.ts`. Fungsi: `simpan_biaya_tetap(p)`, `laporan_keuangan(p_outlet, p_dari, p_sampai)`.

### Task 3: Klien — kejadian kasbon & Kas
Files: `src/lib/offline/{db,label,pengirim,proyeksi-laci}.ts`, `src/lib/kasir/offline-kasir.ts`, `src/lib/kas/api.ts`, `src/routes/kasir/kas/+page.svelte` (+ tes).

### Task 4: Admin Gaji
Files: `src/lib/kas/gaji.ts` (+ tes fungsi murni), `src/routes/admin/gaji/+page.svelte` (+ komponen bila perlu).

### Task 5: Admin Biaya tetap & Laba-rugi
Files: `src/lib/kas/laporan.ts` (+ tes), `src/routes/admin/biaya-tetap/+page.svelte`, `src/routes/admin/laba-rugi/+page.svelte`, AdminNav, beranda admin.

### Task 6: E2E, push, docs
`scripts/uji-gaji.ts`, `docs/uji/tahap-5b-owner.md`, laporan, roadmap; push 0024–0025 setelah review akhir; semua E2E.
