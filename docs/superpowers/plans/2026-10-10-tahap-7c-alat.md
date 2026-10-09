# Tahap 7c — Alat: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Spec:** `docs/superpowers/specs/2026-10-10-tahap-7c-alat-design.md`

## Global Constraints
- Migrasi 0001–0035 di server, tidak diubah; baru `20261015000036_belanja_kirim_teks`. Push setelah review akhir.
- Admin saja; bahasa Indonesia; ≤ 1000 baris/file; tidak ada harga/gaji asli di repo (contoh tes memakai angka buatan).

### Task 1: SQL `rencana_belanja`, `kirim_teks_telegram`, `_tg_topik` (belanja/gaji/ojol → kas) — `tests/db/belanja.test.ts`
### Task 2: `src/lib/ekspor/xlsx.ts` (+tes) & `TombolEkspor.svelte`, gaya cetak
### Task 3: Admin → Belanja (`src/lib/belanja/*` + halaman) — teks WA, Telegram, Excel
### Task 4: Ringkasan gaji (komponen di Gaji) & Admin → Ojol
### Task 5: Tombol Excel di dasbor, Analisis, Laba-rugi, Kas, Setoran, Pengeluaran, Penjualan
### Task 6: E2E, push, docs
