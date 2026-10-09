# Tahap 7b — Analisis kebocoran: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Modal per bahan, untung per menu (tanda tipis), susut & terbuang rupiah, minyak & tepung, proyeksi; sumber dasbor baru; rincian kasbon di Gajian.

**Spec:** `docs/superpowers/specs/2026-10-10-tahap-7b-analisis-design.md`

## Global Constraints
- Migrasi 0001–0031 di server, tidak diubah; baru `20261014000032_analisis_modal`, `…33_analisis_lain`, `…34_dasbor_sumber_7b` (create or replace fungsi katalog dasbor). Push setelah review akhir.
- Semua admin saja; label "perkiraan"; bahasa Indonesia; ≤ 1000 baris/file; tanpa data bisnis di repo (contoh angka tes bukan harga asli).

## Review Focus
1. Modal: rata-rata periode vs acuan, pembagian pack sebanding harga jual (Σ = harga pack), bahan tanpa harga.
2. Untung menu & susut/terbuang memakai modal outlet & periode yang benar.
3. Interval minyak/tepung & rasio.
4. Katalog dasbor tetap aman (validasi & potongan SQL tetap), klien = server.

### Task 1: Modal & untung menu (0032) — `tests/db/analisis-modal.test.ts`
### Task 2: Susut/terbuang, minyak/tepung, proyeksi, batas untung (0033) — `tests/db/analisis-lain.test.ts`
### Task 3: Sumber dasbor 7b (0034) — tes di `tests/db/dasbor-agregasi.test.ts`
### Task 4: Klien `src/lib/analisis/*` + halaman Admin → Analisis
### Task 5: Rincian kasbon di Gajian (`src/lib/kas/gaji.ts` + komponen)
### Task 6: E2E, push, docs
