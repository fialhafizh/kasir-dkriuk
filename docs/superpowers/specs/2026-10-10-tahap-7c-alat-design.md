# Tahap 7c — Rencana belanja, ringkasan gaji, laporan ojol, ekspor Excel/PDF

Turunan grand design §7 dan Tahap 7a/7b. Disetujui owner dalam percakapan 10 Okt 2026 (contoh manual owner: tabel belanja stokis & ringkasan gaji di spreadsheet — angka bisnisnya tidak disalin ke repo).

## 1. Keputusan owner

1. **Ojol**: kasir mencatat pesanan ojol dengan harga toko; owner sendiri mencocokkan dengan pencairan ke rekening. Aplikasi cukup memberi **laporan per aplikasi** (jumlah pesanan & total harga toko per hari/periode), tanpa mencatat pencairan.
2. **Rencana belanja** (biasanya belanja ke stokis sekali seminggu, hari tidak tetap): saran beli **per outlet** = kebutuhan **N hari ke depan** (awal 7) dari **tren 7 hari terakhir** − stok sekarang; contoh owner: Bukit Lama perlu 80 Ori/minggu, sisa 10 → beli 70; Hot habis → 20; kulit habis → 4. Ada total semua outlet. Angka bisa diubah sebelum dibagikan.
3. Halaman belanja **seperti tabel manual owner** (barang × outlet, total pesanan, harga satuan, harga total, jumlah) dan bisa dibagikan: **teks siap tempel ke grup WA** dan **kirim ke Telegram** (agar bisa disalin dari HP ke WA, tidak harus dari web).
4. **Ringkasan gaji** seperti tabel kanan contoh owner (nama, gaji/hari, hari masuk, gaji sebulan, pinjam/kasbon, total) + total; bisa disalin & dikirim ke Telegram.
5. **Setiap data yang tampil (dasbor & halaman lain) bisa diekspor ke Excel**; cetak/simpan PDF lewat tombol Cetak.

## 2. Rencana belanja (`rencana_belanja(p_hari)`, admin)

- Baris = barang belanja: satu **pack campuran** (Ayam Ori/Hot) per kelompok, atau satu satuan beli untuk bahan tunggal (bila bahan punya beberapa satuan beli, pakai yang punya harga acuan di outlet itu dengan isi terkecil; bila tidak ada, isi terkecil).
- Per outlet aktif:
  - **stok** (dalam satuan beli) = saldo buku stok ÷ isi;
  - **pemakaian/hari** = (terjual + batal jual + rusak/sisa, 7 hari terakhir) ÷ 7 ÷ isi; untuk bahan yang tidak dipotong otomatis (tepung, minyak, plastik merah) = rata-rata **pembelian** 28 hari terakhir per hari, dan stoknya tidak dipakai (ditandai "perkiraan dari pembelian");
  - **saran** = max(0, ⌈pemakaian/hari × N − max(stok, 0)⌉);
  - **harga** = harga acuan outlet (Harga Beli), bila tidak ada harga barang masuk terakhir.
- Layar **Admin → Belanja**: pilih N hari; tabel barang × outlet (sel saran bisa diubah), total pesanan, harga satuan, harga total, jumlah keseluruhan; stok & pemakaian terlihat sebagai keterangan kecil. Tombol **Salin untuk WA**, **Kirim ke Telegram**, **Excel**, **Cetak**. Isian yang diubah disimpan di perangkat (bukan server) sampai diatur ulang.

Format teks WA/Telegram (contoh):
```
Belanja stokis — Sel 14/10/2026
Ayam Original: 65 (TK 10 · BL 45 · KP 10)
Ayam Hot: 25 (TK 10 · BL 15)
…
Total: Rp…
```

## 3. Ringkasan gaji

Di **Admin → Gaji**, per bulan & outlet (atau semua): nama, gaji/hari, hari masuk, gaji sebulan (hari × upah), penyesuaian, kasbon dipotong (yang dibayar; bila belum dibayar: saran potongan = sisa kasbon sebatas gaji), total diterima; baris jumlah. Tombol Salin untuk WA, Kirim ke Telegram, Excel.

## 4. Laporan ojol

**Admin → Ojol**: periode & outlet; per aplikasi: jumlah pesanan & total harga toko; tabel per hari × aplikasi. Salin/Telegram/Excel.

## 5. Kirim ke Telegram

`kirim_teks_telegram(p_jenis, p_teks)` (admin) memasukkan teks ke antrean Telegram (dikirim ±1 menit) di topik **💰 Kas**; jenis `belanja`, `gaji`, `ojol`. Teks di-escape; dipotong di akhir baris bila > 4000 karakter.

## 6. Ekspor

- **Excel (.xlsx)**: penulis XLSX kecil buatan sendiri (zip memakai `fflate`), dimuat saat tombol ditekan; angka tetap angka (bisa dijumlah di Excel), teks sebagai teks.
- Tombol **Excel** pada: setiap panel dasbor (data panel), Analisis (semua tab), Belanja, Ringkasan gaji, Ojol, Laba-rugi, Kas harian, Setoran, Pengeluaran, Penjualan.
- **Cetak/PDF**: tombol Cetak memakai cetak peramban; gaya cetak menyembunyikan menu & tombol.

## 7. Pengujian

DB: rencana belanja (contoh owner 80/minggu − 10 = 70, habis → kebutuhan penuh, bahan analisis dari pembelian, pembulatan ke atas, harga acuan), kirim teks Telegram (admin, topik kas, escape). Unit: penulis XLSX (zip berisi sheet, angka/teks, nama lembar), teks WA belanja & gaji, ringkasan gaji. E2E server & daftar uji owner.
