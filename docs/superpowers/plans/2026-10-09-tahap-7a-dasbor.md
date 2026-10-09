# Tahap 7a — Dasbor yang bisa dirakit: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Admin → Dasbor: banyak dasbor, panel dirakit dari katalog (sumber × ukuran × kelompok × saringan × tampilan), disusun di kisi (seret & ubah ukuran di laptop), panel khusus status stok, siklus stok, riwayat kejadian, uang laci.

**Architecture:** Migrasi 0029 (tabel dasbor + kelola + bawaan), 0030 (katalog & `agregasi_dasbor`), 0031 (`siklus_stok`, `riwayat_kejadian`). Klien: `src/lib/dasbor/*` (katalog, periode, spek, api), `src/lib/components/dasbor/*` (grafik SVG buatan sendiri, panel, kisi, penyunting), rute `admin/dasbor`. gridstack dimuat dinamis hanya saat menyunting.

**Spec:** `docs/superpowers/specs/2026-10-09-tahap-7a-dasbor-design.md`

## Global Constraints

- Migrasi 0001–0028 di server, tidak boleh diubah; baru `20261013000029_dasbor_skema`, `…30_dasbor_agregasi`, `…31_dasbor_khusus`. Push setelah review akhir.
- Agregasi hanya dari potongan SQL tetap; semua nilai pengguna lewat parameter. Admin saja.
- Semua teks layar bahasa Indonesia. ≤ 1000 baris/file, satu tanggung jawab per file. Tidak ada rahasia/data bisnis di repo.

## Review Focus

1. Tidak ada jalan masuk SQL dari spek (kolom/ukuran/sumber di luar katalog ditolak; nilai saringan parameter). Tes DB Task 2.
2. Angka sama dengan halaman lain (omzet = laporan_keuangan, uang laci = saldo_laci, terbuang tidak menghitung yang batal). Tes DB Task 2.
3. WIB & pengelompokan minggu/bulan benar; pembanding = periode sebelumnya sama panjang. Tes DB Task 2 & unit Task 4.
4. Simpan dasbor atomik; tepat satu utama; minimal satu dasbor. Tes DB Task 1.
5. Siklus stok: episode habis & perkiraan habis benar. Tes DB Task 3.

### Task 1: Skema & kelola dasbor (0029) — `tests/db/dasbor-kelola.test.ts`
### Task 2: Katalog & agregasi (0030) — `tests/db/dasbor-agregasi.test.ts`
### Task 3: Siklus stok & riwayat kejadian (0031) — `tests/db/dasbor-khusus.test.ts`
### Task 4: Pustaka klien (`src/lib/dasbor/`): katalog (label, = server), periode WIB & pembanding, validasi spek, api (+ tes)
### Task 5: Grafik & panel (`src/lib/components/dasbor/`): Angka, Batang, Garis, Lingkaran, Tabel, PetaPanas, panel khusus (+ tes tampilan)
### Task 6: Halaman Dasbor: tampilan, saringan, pembaruan ±1 menit, kelola dasbor
### Task 7: Mode sunting: kisi gridstack (laptop), naik/turun & lebar (HP), formulir panel bertahap dengan pratinjau
### Task 8: E2E, push, docs (`scripts/uji-dasbor.ts`, `docs/uji/tahap-7a-dasbor-owner.md`, laporan, roadmap)
