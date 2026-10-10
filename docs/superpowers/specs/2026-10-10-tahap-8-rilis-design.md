# Tahap 8 — Rilis: panduan (infografis + Bantuan + petunjuk "?") & uji menyeluruh

Disetujui owner 10 Okt 2026.

## 1. Keputusan owner
1. **Dokumen infografis HTML** lengkap tentang semua yang dibuat, **seinteraktif mungkin**, ringan, bisa diekspor owner sendiri ke PDF/PPT (bukan file PDF terpisah).
2. **Halaman Bantuan** di aplikasi untuk kasir & admin.
3. **Petunjuk "?"** singkat di layar-layar penting.
4. Uji menyeluruh sebelum dipakai di semua outlet.

## 2. Satu sumber isi
`src/lib/bantuan/isi.ts` berisi semua topik (judul, untuk siapa, ringkas, langkah, catatan/peringatan, alur). Dipakai oleh:
- **Bantuan** di aplikasi (`/kasir/bantuan`, `/admin/bantuan`): daftar topik + cari; bisa dibuka offline (ikut cache aplikasi); tombol Cetak.
- **Petunjuk "?"** (`Petunjuk.svelte`, `topik="..."`): ringkasan topik + tautan "selengkapnya" ke Bantuan. Dipasang di Jualan, Tutup toko, Kas, Stok (kasir) dan Dasbor, Analisis, Belanja, Gaji, Telegram (admin).
- **Infografis** `static/panduan.html` (terbit di `…/kasir-dkriuk/panduan.html`, ikut cache offline), dibuat skrip `npm run panduan` dari isi yang sama (tes memastikan file selalu sesuai isi): satu file mandiri tanpa pustaka luar, tema merah–kuning terang/gelap, sampul, peta fitur, alur harian bergambar, tab Kasir/Admin/Pemilik, pencarian, buka-tutup langkah, **mode slide** (satu bagian per layar, tombol ←/→) dan **gaya cetak** (satu slide per halaman lanskap → simpan PDF dari peramban; PDF bisa dibuka/diubah ke PPT).
- Tidak memuat harga, gaji, nama karyawan, atau kunci apa pun.

## 3. Isi (ringkas)
- **Umum**: tentang aplikasi (3 outlet, PWA, offline, Telegram, peran), alur harian, peta menu.
- **Kasir**: masuk & pasang di HP, buka toko, jualan & struk/printer, offline & sinkron, Perlu perhatian, batal transaksi, sisa/rusak, kirim & terima barang, opname & stok awal, pengeluaran, kasbon, setoran, tutup toko.
- **Admin**: dasbor (lihat, saringan, ubah, tambah panel, kelola), analisis, belanja, ojol, laba-rugi, kas harian, setoran, pengeluaran, penjualan, gaji & ringkasan, biaya tetap, stok (barang masuk, setujui stok awal/opname, transfer), data master (bahan & isi pack, menu & resep, harga jual, harga beli), akun, perangkat, Telegram, Excel & cetak.
- **Pemilik/operasional**: persiapan data awal, rutinitas harian/mingguan/bulanan, cadangan data, keamanan, masalah umum (FAQ).

## 4. Uji menyeluruh
- **Keamanan**: tes DB yang memeriksa semua tabel `public`: pengunjung tanpa login tidak bisa membaca apa pun; kasir tidak bisa membaca tabel khusus admin; semua fungsi yang mengubah data menolak kasir/anon sesuai perannya.
- **Alur lengkap di server** (`scripts/uji-alur.ts`): buka toko → jual (tunai/QRIS/ojol) → batal → sisa → pengeluaran → kasbon → tutup toko → setoran diterima → kas harian, laba-rugi, dasbor, analisis, rencana belanja saling cocok.
- **Beban** (`npm run uji:beban`, di luar tes harian): ±1 tahun data 3 outlet di PGlite; waktu agregasi dasbor, riwayat, siklus stok, untung menu, rencana belanja dicatat & dibatasi.
- **Cadangan** (`npm run cadangan`): salinan data server ke folder lokal yang tidak di-commit; cara pulihkan di panduan.
- Daftar langkah go-live owner `docs/uji/tahap-8-rilis-owner.md`.
