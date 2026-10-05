# Tahap 3b — Stok lanjutan: rusak/terbuang, transfer antar outlet, opname mingguan

Turunan grand design `2026-10-04-kasir-dkriuk-design.md` §4, di atas Tahap 3a (`2026-10-06-tahap-3a-stok-design.md`, sudah di main). Disetujui owner per bagian dalam percakapan 5 Okt 2026. Wajib baca "Catatan wajib" roadmap (keluarga "sebelum dihitung").

## 1. Tujuan & ukuran berhasil

- Barang rusak/terbuang (termasuk sisa tidak laku & dimakan/dibawa karyawan) **langsung mengurangi stok** dan tersimpan per alasan untuk dashboard Tahap 7 ("berapa yang terbuang").
- Kasir tidak lupa mencatat sisa harian: langkah wajib "Ada sisa yang tidak terjual?" di Tutup toko.
- Transfer antar outlet hanya berpindah bila jumlah yang diketik penerima **sama persis** dengan yang dikirim.
- Opname mingguan dengan hitung buta; admin melihat selisih per bahan dan menyetujui koreksi; angka sistem & selisih tersimpan permanen.

Berhasil bila: kasir mencatat 3 sayap Ori gosong → stok sayap Ori turun 3; tutup toko tidak bisa lanjut sebelum pertanyaan sisa dijawab; BL mengirim 2 pack Ayam Ori ke TK → TK mengetik 2 pack → BL −18 potong, TK +18 potong; TK mengetik 1 pack → ditolak dengan pesan, stok tidak berubah; opname disetujui → stok = hitungan pada jam dihitung.

## 2. Keputusan owner (5 Okt 2026)

1. Sisa harian bisa campuran (dibuang, dibawa/dimakan karyawan, jarang dijual lagi) → semuanya langsung mengurangi stok; yang disimpan lalu dijual lagi besok **tidak** dicatat.
2. Transfer: **tanpa persetujuan admin**. Pengirim menulis jumlah kiriman; penerima mengetik jumlah diterima; **tidak cocok → tidak bisa dikonfirmasi**, muncul "Ada perbedaan jumlah. Silakan hubungi outlet pengirim (…)". Tidak ada status "hilang di jalan".
3. Opname: kasir **tidak melihat** angka sistem (hitung buta).
4. Void transaksi yang terjadi sebelum opname/stok awal lalu dibatalkan sesudahnya: **selalu mengembalikan stok** (aturan sekarang; opname berikutnya membetulkan kasus langka transaksi ganda).

## 3. Di luar cakupan

Notifikasi Telegram (Tahap 6); dashboard terbuang & susut (Tahap 7, cukup datanya tersimpan); offline (Tahap 4); kas harian/pengeluaran (Tahap 5).

## 4. Model data (migrasi baru; 0001–0011 tidak diubah)

- **`20261007000012_jenis_gerakan_3b.sql`** — hanya `alter type public.jenis_gerakan add value` untuk `rusak`, `rusak_batal`, `transfer_keluar`, `transfer_masuk`, `opname` (file tersendiri: nilai enum baru tidak bisa dipakai di transaksi yang sama).
- **`rusak`**: `id uuid` (dibuat perangkat, idempoten), `outlet_id`, `waktu` (selalu `now()`), `alasan` enum `alasan_rusak` (`sisa_tidak_laku`, `dimakan_karyawan`, `gosong`, `basi`, `jatuh_rusak`, `lainnya`), `catatan` (wajib 3–200 bila `lainnya`, opsional ≤200 selain itu), `dicatat_oleh`, `batal_at/batal_oleh/batal_alasan`. **`rusak_item`**: `rusak_id`, `bahan_id`, `qty numeric(14,4) > 0`.
- **`transfer`**: `id uuid` (idempoten), `dari_outlet_id`, `ke_outlet_id` (≠ dari), `status` enum (`dikirim`, `diterima`, `dibatalkan`), `dikirim_at/oleh`, `diubah_at`, `diterima_at/oleh`, `batal_at/oleh/alasan`, `catatan`. **`transfer_item`**: `transfer_id`, `bahan_id`, `qty > 0`.
- **`opname`**: sama dengan `stok_awal` (`status` diajukan/disetujui/ditolak, `dihitung_at`, `diajukan_oleh`, `diputus_*`, `catatan`); satu `diajukan` per outlet. **`opname_item`**: `opname_id`, `bahan_id`, `qty_hitung >= 0`, `qty_sistem numeric(14,4)` (diisi saat disetujui = saldo buku besar s.d. `dihitung_at`).
- **`gerakan_stok`** mendapat kolom sumber `rusak_id`, `transfer_id`, `opname_id` + CHECK sumber per jenis (pola 3a).
- RLS: baca outlet sendiri / admin semua. `transfer` terbaca oleh outlet asal, outlet tujuan, dan admin. `transfer_item` terbaca oleh outlet asal & admin; outlet tujuan **baru bisa membaca setelah status bukan `dikirim`** (hitung buta). `opname` (kepala/status) terbaca kasir outletnya; `opname_item` (berisi `qty_sistem`) **hanya admin**. `rusak` & `rusak_item` terbaca outlet sendiri / admin.

## 5. Fungsi server (security definer, `search_path=''`, cek akses `coalesce`, pesan Indonesia 22023/42501 + allowlist)

**Kunci bersama per outlet**: semua penulis yang memengaruhi hitungan memakai `pg_advisory_xact_lock(hashtextextended('stok:' || outlet_id, 0))` — putuskan stok awal/opname, barang masuk & batalnya, rusak & batalnya, konfirmasi transfer (kunci kedua outlet, urutan id agar tidak deadlock). (Migrasi baru mengganti fungsi 3a dengan `create or replace`.)

- `catat_rusak(p jsonb)` → `{id, outlet_id, alasan, catatan?, item:[{bahan_id, qty}]}`; kasir outlet itu/admin; bahan aktif, unik, qty >0; tulis `rusak` (−qty) per bahan.
- `batal_rusak(p_id, p_alasan)` admin; balik persis (`rusak_batal`); ditolak bila ada stok awal/opname disetujui dengan `dihitung_at >= rusak.waktu` (sudah termasuk hitungan).
- `kirim_transfer(p jsonb)` → `{id, dari, ke, catatan?, item}`; kasir outlet asal/admin; tujuan aktif & ≠ asal.
- `ubah_transfer(p_id, p_item, p_catatan)` / `batal_transfer(p_id, p_alasan)`: kasir outlet asal/admin, hanya status `dikirim`.
- `terima_transfer(p_id, p_item)` kasir outlet tujuan/admin, status `dikirim`: bandingkan per bahan (himpunan bahan & jumlah sama persis, toleransi 0,0001); tidak cocok → 22023 `Ada perbedaan jumlah. Silakan hubungi outlet pengirim (<nama>)`; cocok → status `diterima`, tulis `transfer_keluar` (−) di asal & `transfer_masuk` (+) di tujuan, keduanya `waktu = now()`.
- `ajukan_opname(p_outlet, p_item)`: kasir/admin; wajib stok awal disetujui; satu ajuan menunggu; ditolak bila ada transfer `dikirim` dari/ke outlet itu (`Selesaikan kiriman/penerimaan dulu sebelum opname`). Isian sama dengan stok awal (bahan aktif, unik, 0..1.000.000).
- `putuskan_opname(p_id, p_setuju, p_item, p_catatan)` admin: rumus sama dengan stok awal (selisih = hitungan − saldo s.d. `dihitung_at`, tulis `opname` bila ≠0), simpan `qty_sistem` per item; tolak dengan alasan.
- `catat_barang_masuk` / `batal_barang_masuk` (ganti): penjaga "sebelum dihitung" memakai stok awal **atau opname** disetujui terakhir.
- Stok awal: tetap seperti 3a, plus kunci bersama.

## 6. Layar

**Kasir — tab Stok:** tombol **Catat rusak**, **Kirim ke outlet lain**, **Terima kiriman (n)**, **Opname** (pita kuning "Waktunya opname mingguan" setiap Minggu WIB sampai opname minggu itu dikirim). Daftar kiriman keluar yang menunggu dengan Ubah/Batalkan. Formulir isian memakai komponen hitungan 3a (pack + lepas / per potong / kg); untuk rusak & transfer hanya baris yang diisi yang dikirim (kosong = tidak ada).

**Kasir — Tutup toko:** langkah wajib sebelum hitung uang: **"Ada sisa yang tidak terjual?"** → *Tidak ada* (lanjut) atau isian cepat: potongan ayam Ori/Hot (8), Kulit (porsi), Nasi (porsi → kg beras memakai `resep` menu nasi). Alasan bawaan *Sisa tidak laku (dibuang)*, bisa diganti; boleh simpan lebih dari sekali dengan alasan berbeda. Jawaban "sudah dijawab" diingat per shift di perangkat (sessionStorage per shift id).

**Admin — Stok:** bagian **Rusak** (daftar per outlet + Batalkan), **Transfer** (semua, status, Batalkan bila macet), **Hitungan** (stok awal & opname: tabel hitungan / sistem / selisih, selisih besar ditandai — |selisih| ≥ 1 pack-setara atau ≥ 10%; ubah angka; Setujui/Tolak). Riwayat gerakan memakai label baru. **Beranda:** per outlet + "Opname menunggu persetujuan", "Kiriman belum diterima".

## 7. Galat & kasus tepi

- Transfer ke diri sendiri / outlet nonaktif / kosong → ditolak. Terima oleh outlet asal → ditolak. Konfirmasi ganda → yang kedua "sudah diterima".
- Ubah/batal setelah diterima → ditolak. Admin membatalkan transfer macet.
- Rusak `lainnya` tanpa catatan → ditolak. Rusak ganda (id sama) → sekali.
- Opname saat ada ajuan menunggu / transfer menunggu / tanpa stok awal → ditolak dengan pesan jelas.
- Semua pesan baru masuk allowlist dan dijaga tes yang membaca migrasi.

## 8. Pengujian

- DB (PGlite): rusak potong & batal persis + penjaga sebelum dihitung; transfer cocok/tidak cocok (stok tak berubah), hitung buta (tujuan tak bisa membaca item saat dikirim), ubah/batal hanya pengirim & hanya saat dikirim, konfirmasi ganda; opname rumus (jual sebelum & sesudah dihitung), `qty_sistem` tersimpan, penolakan saat transfer menunggu; barang masuk mundur sebelum opname ditolak; hak kasir/admin/anon/nonaktif.
- Unit: konversi sisa nasi porsi→kg, kumpul isian opsional (rusak/transfer), penanda selisih besar, pengingat Minggu WIB.
- E2E server `scripts/uji-stok-3b.ts`; daftar uji owner `docs/uji/tahap-3b-stok-owner.md`.
