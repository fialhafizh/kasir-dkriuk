# Kasir D'Kriuk

Aplikasi kasir, stok bahan baku, dan keuangan untuk outlet D'Kriuk Bukit Lama, D'Kriuk Talang Kerangga, dan D'Krizzpy Kertapati.

## Teknologi
SvelteKit 3 (Svelte 5) + Tailwind CSS 4, di-hosting statis (GitHub Pages, hash router). Data, login, dan aturan akses di Supabase (Postgres + Row Level Security).

## Menjalankan di komputer
1. `npm install`
2. Salin `.env.example` ke `.env.local`, isi dengan kunci project Supabase.
3. `npm run dev`

## Perintah
| Perintah | Fungsi |
|---|---|
| `npm run dev` | server pengembangan |
| `npm test` | semua test (logika, komponen, kontras warna, database via PGlite) |
| `npm run check` | pemeriksaan tipe Svelte/TypeScript |
| `npm run build` | build statis ke `build/` (`BASE_PATH=/kasir-dkriuk` untuk GitHub Pages) |
| `npx supabase db push` | pasang migrasi ke project Supabase |
| `node --env-file=.env.local scripts/bootstrap-users.ts` | buat 4 akun awal (sekali saja; password ditulis ke `akun-awal.txt`) |
| `npm run sb -- <perintah>` | Supabase CLI dengan kredensial `.env.local`, output disamarkan (mis. `db push`, `functions deploy admin-akun --use-api`) |
| `node --env-file=.env.local scripts/uji-akun.ts` | uji fungsi server akun & hak akses data master dengan akun sementara (dihapus otomatis) |
| `node --env-file=.env.local scripts/seed-harga-beli.ts` | isi harga beli dari `data/harga-beli.local.json` (tidak di-commit) |
| `node --env-file=.env.local scripts/uji-kasir.ts` | uji alur kasir di server (outlet & akun sementara, dibersihkan otomatis) |
| `node --env-file=.env.local scripts/uji-stok.ts` | uji alur stok di server (outlet & akun sementara, dibersihkan otomatis) |
| `node --env-file=.env.local scripts/uji-stok-3b.ts` | uji rusak, transfer, opname di server (outlet & akun sementara, dibersihkan otomatis) |
| `node --env-file=.env.local scripts/uji-offline.ts` | uji fungsi offline di server (perangkat, gabung shift, jual telat, kode struk) |

## Akun
- Login memakai **username + password**. Di belakang layar username menjadi email `username@kasir-dkriuk.invalid` (domain yang tidak bisa didaftarkan siapa pun).
- Peran (`admin`/`kasir`) dan outlet disimpan di `app_metadata`, yang hanya bisa diisi server.
- Jangan membuat akun lewat tombol **Add user** di Supabase Studio: akun itu tidak punya `app_metadata` peran, sehingga tidak mendapat profil dan saat login muncul "Profil akun tidak ditemukan. Hubungi admin." Pakai script di atas, atau menu kelola akun (Tahap 1).
- Untuk menghapus akun, hapus user Auth-nya (profil ikut terhapus), jangan hanya baris di tabel `profiles`.

## Keamanan
- Jangan commit `.env.local`, `akun-awal.txt`, file harga/HPP, atau data bisnis lain (sudah diatur di `.gitignore`; folder `data/` seluruhnya diabaikan).
- `tests/rahasia.test.ts` gagal bila ada nilai dari `data/*.local.json` muncul di file yang di-commit.
- Kunci publishable (anon) aman berada di aplikasi karena semua tabel dilindungi RLS. Build menolak kunci rahasia di variabel `PUBLIC_*`.
- Pendaftaran akun publik dimatikan di Supabase; akun hanya dibuat oleh admin.

## Dokumen
- Rancangan: `docs/superpowers/specs/2026-10-04-kasir-dkriuk-design.md`
- Rencana per tahap: `docs/superpowers/plans/`

## Alamat aplikasi

https://fialhafizh.github.io/kasir-dkriuk/ — dipasang otomatis oleh GitHub Actions (`.github/workflows/pages.yml`) setiap ada perubahan di `main`. Variabel repo yang dibutuhkan: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`. Build lokal dengan base path di Git Bash Windows: `MSYS_NO_PATHCONV=1 BASE_PATH=/kasir-dkriuk npm run build`.
