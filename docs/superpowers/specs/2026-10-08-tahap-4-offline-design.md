# Tahap 4 — Offline penuh untuk kasir + pemasangan online (GitHub Pages)

Turunan grand design `2026-10-04-kasir-dkriuk-design.md` §9. Disetujui owner per bagian dalam percakapan 5 Okt 2026. Wajib baca "Catatan wajib" roadmap untuk Tahap 4 (cold start offline, shift penjualan offline, stok vs hitungan, opname tanpa id).

## 1. Tujuan & ukuran berhasil

- **Semua pekerjaan kasir tetap berjalan tanpa internet** (keputusan owner: opsi C): buka toko, jualan + cetak struk, batal transaksi, catat rusak & sisa, kirim & konfirmasi terima transfer, opname, tutup toko.
- Data terkirim ke server **berurutan, persis sekali**, dengan jam kejadian asli; server memeriksa ulang semuanya; uang, stok, dan shift tetap benar walau ada beberapa perangkat dan sinyal putus-sambung.
- Aplikasi **terpasang online** di `https://daffialhafizh.github.io/kasir-dkriuk/` (repo publik `daffialhafizh/kasir-dkriuk`) dan bisa dipasang ke layar utama HP/tablet — dimajukan dari Tahap 8 supaya offline, printer Bluetooth, dan RawBT bisa diuji di perangkat sungguhan.

Berhasil bila: matikan internet di tablet → buka toko, jual 3 transaksi (struk tercetak dengan nomor sementara + kode struk), catat sisa, tutup toko → nyalakan internet → semua terkirim, nomor resmi muncul di Riwayat, ringkasan shift & stok di server sama dengan di perangkat; perangkat kedua yang offline bersamaan di outlet yang sama tergabung ke shift yang sama.

## 2. Keputusan owner (5 Okt 2026)

1. **Cakupan C** — semua tindakan kasir offline; pekerjaan admin tetap online.
2. **Perangkat**: umumnya satu per outlet, tapi bisa pindah ke HP karyawan (baterai habis) dan bisa dua perangkat aktif bersamaan.
3. **Tutup toko di satu perangkat menutup outlet**; perangkat lain yang membuka lagi sesudahnya = **shift baru** dengan catatan jam tutup & jam buka lagi.
4. **Nomor struk = B + kode struk**: online nomor resmi; offline nomor sementara `S<kode perangkat>-NNN`; nomor resmi diberikan saat sinkron (urut kedatangan, tanpa loncatan); setiap transaksi punya **kode struk** pendek permanen yang tercetak; semua nomor bisa dicari & ditelusuri ke transaksinya.
5. **Pemasangan online dimajukan ke Tahap 4**; riwayat git berisi harga beli lama tetap dibiarkan walau repo publik (keputusan lama, dikonfirmasi ulang).
6. Owner minta semua keputusan dicatat di **laporan pembuatan aplikasi** (`docs/laporan-pembuatan.md`).

## 3. Cara kerja sinkron

**Penyimpanan di perangkat (IndexedDB):**
1. *Salinan server*: menu, harga outlet, resep, bahan & isi pack, outlet, profil & outlet kasir, shift terbuka, stok outlet, status stok awal/opname, transfer masuk/keluar yang menunggu — diperbarui setiap online.
2. *Antrean kejadian* (outbox): setiap tindakan kasir = satu kejadian `{id uuid, jenis, outlet_id, perangkat_id, waktu (jam perangkat), data}`. Layar memakai salinan + antrean (stok berkurang, penjualan tampil di Riwayat bertanda "belum terkirim").

**Pengiriman:** berurutan menurut urutan dibuat; otomatis saat online, saat aplikasi dibuka, berkala, dan tombol **Sinkron sekarang**. Kiriman ulang aman (id kejadian). Kejadian yang **ditolak** server (galat isian/aturan, bukan galat jaringan) pindah ke **Perlu perhatian** dengan alasannya dan antrean lanjut; kejadian yang bergantung padanya (mis. penjualan di shift yang gagal dibuka) ikut menunggu di belakangnya.

**Aturan server (migrasi baru, fungsi lama dipertahankan untuk kompatibilitas):**
- Semua fungsi kasir menerima **id dari perangkat** (shift, penjualan, void, rusak, transfer, terima, opname, tutup) dan idempoten.
- **Shift**: dibuat di perangkat dengan id sendiri. Saat sampai di server: bila outlet punya shift terbuka → id perangkat **dialiaskan** ke shift itu (digabung; modal kedua jadi catatan); bila shift outlet terakhir sudah ditutup → shift baru dengan catatan "dibuka lagi setelah ditutup jam …".
- **Penjualan** membawa id shift perangkat + jam kejadian; masuk ke shift tempat ia terjadi walau tiba setelah shift ditutup → ringkasan dihitung ulang dan shift diberi tanda "ada penjualan masuk setelah tutup toko" (admin melihat selisih kas baru).
- **Tutup toko** membawa uang laci + ringkasan perangkat; server menutup shift dan menyimpan ringkasan resmi (dihitung server).
- **Jam perangkat dipercaya** dalam batas: tidak di masa depan (> 5 menit) dan tidak lebih dari 7 hari ke belakang.
- **Stok vs hitungan fisik**: penjualan/rusak yang jam kejadiannya ≤ stok awal/opname terakhir yang disetujui tetapi tiba sesudahnya → tercatat (uang, riwayat) **tanpa efek stok** (ditandai), karena hitungan fisik sudah mencerminkannya; void-nya juga tanpa efek stok.
- **Nomor**: server memberi nomor resmi urut kedatangan per outlet per hari WIB (hari dari jam kejadian); nomor sementara & kode struk disimpan permanen.
- **Opname** & **terima transfer** memakai id perangkat (menutup catatan "opname tanpa id"); hasil pembandingan transfer baru diketahui setelah sinkron (bila beda → Perlu perhatian dengan pesan "Ada perbedaan jumlah…").
- Kejadian yang **diabaikan** kasir dilaporkan ke server (tabel log) beserta alasannya.

**Perangkat:** saat pertama login, perangkat mendaftar dan mendapat **kode perangkat** (angka kecil); server mencatat outlet, pengguna terakhir, jam sinkron terakhir.

**Login:** perangkat yang pernah login bisa dibuka offline kapan pun memakai sesi tersimpan (termasuk token lewat 1 jam — sesi diperbarui saat online kembali). Perangkat baru butuh internet untuk login pertama. **Keluar ditolak** selama antrean belum kosong.

## 4. Pemasangan online & PWA

- Repo publik `daffialhafizh/kasir-dkriuk`; GitHub Actions membangun & memasang ke GitHub Pages setiap push ke `main` (base path `/kasir-dkriuk`). Variabel publik (URL Supabase, kunci publishable) sebagai *repository variables*; kunci service role & token **tidak pernah** ke GitHub.
- Manifest: nama "Kasir D'Kriuk", ikon logo, warna merah, tampilan standalone. Service worker menyimpan semua file aplikasi untuk dibuka offline.
- Versi baru: pita "Versi baru tersedia — Muat ulang"; tidak diterapkan otomatis selama antrean belum kosong.
- Minta penyimpanan permanen (`navigator.storage.persist`); bila ditolak tampil peringatan agar rajin sinkron.

## 5. Layar

**Kasir:** penanda atas (Online/Offline, "N belum terkirim", Sinkron sekarang, jam sinkron terakhir); halaman **Perlu perhatian** (alasan, Coba lagi, Abaikan + alasan wajib); Riwayat dengan pencarian nomor resmi/sementara/kode struk + detail jejak (jam jual, jam sampai, perangkat, kasir, isi); struk mencetak kode struk (+ nomor sementara saat offline), cetak ulang setelah sinkron memakai nomor resmi; semua layar kasir Tahap 2–3b bekerja dari salinan + antrean.

**Admin:** halaman **Perangkat** (kode, outlet, pengguna terakhir, jam sinkron terakhir — tanda bila lama tidak sinkron); **Kejadian diabaikan**; catatan shift ("digabung dari 2 perangkat", "ada penjualan masuk setelah tutup toko", "dibuka lagi setelah ditutup jam …") di ringkasan.

## 6. Di luar cakupan

Pekerjaan admin offline; notifikasi Telegram (Tahap 6); domain sendiri; aplikasi native.

## 7. Pengujian

- DB (PGlite): idempoten per id perangkat untuk semua fungsi baru; penggabungan shift dua perangkat; buka lagi setelah tutup; penjualan tiba setelah tutup → ringkasan diperbarui & ditandai; nomor resmi urut kedatangan; jam di luar batas; penjualan/rusak sebelum hitungan → tanpa efek stok (dan void-nya); terima transfer & opname idempoten.
- Unit: antrean (urutan, tolak vs galat jaringan, ketergantungan), proyeksi stok/riwayat lokal, nomor sementara & kode struk, sesi offline.
- Perangkat sungguhan (daftar uji owner): pasang ke layar utama, mode pesawat, dua perangkat bersamaan, printer & RawBT.
