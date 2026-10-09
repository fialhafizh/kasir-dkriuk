# Tahap 6 — Notifikasi Telegram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pesan otomatis ke grup Telegram "Backup Dkriuk" (mode Topics): struk, tutup toko & ringkasan harian, peringatan, kas.

**Architecture:** Trigger DB menyusun teks → `telegram_antrean` (kunci unik). pg_cron tiap menit: jadwalkan ringkasan harian lalu memanggil Edge Function `telegram` (pg_net) yang mengirim antrean lewat Bot API. Admin → Telegram memanggil fungsi yang sama untuk *hubungkan* & *uji*.

**Spec:** `docs/superpowers/specs/2026-10-09-tahap-6-telegram-design.md`

## Global Constraints

- Migrasi 0001–0025 di server, tidak boleh diubah; baru `20261012000026_telegram_skema`, `…27_fungsi_telegram_pesan`, `…28_fungsi_telegram_admin`. Push setelah review akhir.
- Trigger notifikasi **tidak boleh** menggagalkan transaksi (exception ditangkap → warning).
- pg_cron/pg_net hanya ada di server: pembuatan jadwal dibungkus pengecekan `pg_available_extensions` (PGlite melewatinya).
- Token bot hanya `TELEGRAM_BOT_TOKEN` di Supabase secrets; dibaca Edge Function. Pemanggilan mode `kirim` tanpa sesi aman (hanya mengirim antrean yang sudah ada).
- Pola keamanan, pesan galat, ukuran file, rahasia, commit sama dengan tahap sebelumnya.

## Review Focus

1. Tidak ada pesan ganda (kunci) & tidak ada transaksi gagal karena notifikasi. Tes DB Task 2.
2. Stok menipis/minus sekali per perubahan status; status sama dengan tampilan aplikasi (`src/lib/stok/tampil.ts`). Tes DB Task 2.
3. Ringkasan harian sekali per tanggal WIB setelah jamnya. Tes DB Task 3.
4. Antrean: lease/skip locked, coba lagi bertahap, berhenti setelah 10 kali, `retry_after`. Tes DB Task 3 & unit Task 4.
5. Kasir tidak bisa membaca/mengubah pengaturan & antrean. Tes DB Task 3.

### Task 1: Skema (0026)
`telegram_pengaturan` (1 baris), `telegram_antrean`, `telegram_status_stok`; RLS tertutup; tes skema.

### Task 2: Pesan & trigger (0027) — `tests/db/telegram-pesan.test.ts`
Helper `_tg_esc/_tg_rp/_tg_jam/_tg_antre`, `_tg_status_stok(outlet)`; trigger: struk (constraint deferred), batal, tutup + selisih kas, setoran (+ selisih), pengeluaran/kasbon, opname & stok awal diajukan, kejadian diabaikan, status stok; RPC `lapor_ditolak(p)`.

### Task 3: Harian, admin, antrean kirim, jadwal (0028) — `tests/db/telegram-admin.test.ts`
`_tg_harian(tanggal)`, `_tg_tiap_menit()`, `telegram_status()`, `simpan_telegram(p)`, `kirim_ulang_telegram(p_id)`, `_tg_ambil(n)`, `_tg_hasil(...)`, jadwal pg_cron.

### Task 4: Edge Function `telegram`
`supabase/functions/_shared/telegram.ts` (logika murni + tes `tests/functions/telegram.test.ts`), `supabase/functions/telegram/index.ts` (kirim / hubungkan / uji), `config.toml`.

### Task 5: Klien
`src/lib/telegram/api.ts` (+ tes), `src/routes/admin/telegram/+page.svelte`, AdminNav; `antrean.ts` melapor kejadian ditolak (`lapor_ditolak`, tidak menghambat).

### Task 6: Deploy, E2E, docs
Secret token, push 0026–0028, deploy fungsi, hubungkan grup, `scripts/uji-telegram.ts`, `docs/uji/tahap-6-telegram-owner.md`, laporan, roadmap.
