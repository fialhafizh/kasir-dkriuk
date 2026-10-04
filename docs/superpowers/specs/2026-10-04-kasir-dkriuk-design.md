# Kasir D'Kriuk — Grand Design

Tanggal: 4 Oktober 2026 · Status: **draft, menunggu review owner**

Aplikasi web (PWA) untuk kasir, stok bahan baku, dan keuangan tiga outlet ayam goreng milik owner. Dipakai dari HP dan tablet Android. Seluruh antarmuka berbahasa Indonesia, bertema merah–kuning D'Kriuk, dengan mode terang dan gelap.

---

## 1. Tujuan

1. Kasir mencatat setiap penjualan dengan cepat (tombol besar, sekali tap per item).
2. Setiap penjualan otomatis memotong stok bahan baku, sehingga owner tahu **stok aktual** di tiap outlet tanpa datang ke toko.
3. Owner melihat omzet, laba-rugi, menu terlaris, jam ramai, kanal penjualan, dan perbandingan outlet secara **real-time**, total atau per outlet.
4. Semua pemasukan dan pengeluaran tercatat per outlet, termasuk gaji, sewa, listrik, dan belanja bahan.

**Indikator sukses:** stok sistem cocok dengan hitungan fisik saat opname Minggu (selisih kecil dan bisa dijelaskan), laporan harian tersedia tanpa rekap manual, dan uang cash yang disetor cocok dengan catatan tutup shift.

---

## 2. Outlet & akun

| Outlet | Nama di struk | Alamat | Harga |
|---|---|---|---|
| Bukit Lama | D'Kriuk Bukit Lama | Jl. Sultan M. Mansyur No.1137, RT.14 RW.05, Bukit Lama, Kec. Ilir Barat I, Kota Palembang, Sumatera Selatan 30136 | Standar |
| Talang Kerangga | D'Kriuk Talang Kerangga | Jl. Ki Rangga Wirasantika, Talang Kerangga, Palembang | Standar |
| Kertapati | D'Krizzpy Kertapati | Jl. KH. Moh. Asyik, 3-4 Ulu, Kec. Seberang Ulu I, Kota Palembang, Sumatera Selatan 30254 (plus code XQW5+C67) | Ayam & kulit −Rp1.000 |

WA di struk (semua outlet): **+62 821-8388-6369**, ditambah ucapan terima kasih di bagian bawah.

### Peran

| Kemampuan | Admin (owner) | Kasir (1 per outlet) |
|---|---|---|
| Input penjualan, cetak struk | ✓ (pilih outlet) | ✓ outlet sendiri |
| Buka/tutup shift, modal kembalian | ✓ | ✓ |
| Void transaksi | ✓ | ✓, admin dapat notifikasi |
| Barang masuk (belanja bahan) | ✓ | — |
| Barang rusak/terbuang | ✓ | ✓ |
| Transfer stok antar outlet | setujui | ajukan & konfirmasi terima |
| Stock opname (Minggu) | tinjau & setujui selisih | hitung fisik |
| Pengeluaran kecil (gas, token listrik, air, lain-lain kecil) | ✓ | ✓ |
| Gaji, sewa, biaya tetap | ✓ | — |
| Lihat stok | semua outlet | outlet sendiri |
| Dashboard, laporan, export | ✓ | — |
| Kelola menu, harga, bahan, akun | ✓ | — |

Akun kasir **terikat ke outlet, bukan ke orang**. Kalau karyawan berganti, admin cukup mengganti nama tampilan atau password. Admin bisa menambah, menonaktifkan, menghapus, dan mereset password akun. Login memakai **username + password**.

---

## 3. Menu & harga

Menu sama di ketiga outlet. Hanya harga Kertapati yang berbeda.

| Item | Standar | Kertapati |
|---|---|---|
| Paha atas (Ori/Hot) | 11.000 | 10.000 |
| Dada (Ori/Hot) | 11.000 | 10.000 |
| Paha bawah (Ori/Hot) | 9.000 | 8.000 |
| Sayap (Ori/Hot) | 9.000 | 8.000 |
| Kulit krispy (per cup) | 9.000 | 8.000 |
| Nasi | 5.000 | 5.000 |
| Box (nasi box) | 1.000 | 1.000 |

**Aturan penjualan:**
- Ayam bisa dijual sendiri, dengan nasi (+5.000), atau sebagai nasi box (+5.000 nasi +1.000 box).
- Satu nasi box boleh berisi lebih dari satu potong ayam. Biaya box tetap +1.000 sekali.
- Nasi bisa dibeli terpisah.
- Tidak ada promo atau diskon.
- Harga ojol (GoFood/GrabFood/ShopeeFood) **sama** dengan harga di toko. Yang dicatat hanya kanalnya.

**Pelengkap (harga Rp0):** kemasan ayam besar, kemasan ayam kecil, plastik besar, plastik kecil, saus sambal, dan saus tomat. Kasir menambahkannya ke transaksi. Pelengkap tercetak di struk dengan harga 0 dan memotong stok.

Di layar kasir, setiap item (termasuk Nasi dan Box) adalah tombol tersendiri. Ada juga tombol pintas **"Nasi Box"** yang langsung menambahkan Nasi + Box. Harga yang dipakai dicatat pada baris transaksi saat terjual, sehingga perubahan harga nanti tidak mengubah laporan lama.

---

## 4. Stok bahan baku

Stok dihitung **per outlet** dari **buku besar pergerakan stok**. Setiap kejadian adalah satu baris: barang masuk, terjual, void, rusak, transfer keluar/masuk, dan koreksi opname. Stok saat ini adalah jumlah dari semua baris itu. Dengan cara ini setiap angka bisa ditelusuri asalnya.

Harga beli awal berasal dari daftar stokis Palembang dan menjadi nilai awal untuk Bukit Lama dan Talang Kerangga; angkanya hanya disimpan di aplikasi (data bisnis, tidak masuk repo). Kertapati mengisi harga kemasan dan plastiknya sendiri saat barang masuk.

| Bahan | Satuan beli | Harga beli | Isi | Dipotong otomatis oleh |
|---|---|---|---|---|
| Ayam Ori (Karkas 1) | pack = 1 kg | (lihat aplikasi) | 9 potong: 2 sayap · 2 paha bawah · 3 dada · 2 paha atas | ayam Ori per potongan |
| Ayam Hot (Karkas 2) | pack = 1 kg | (lihat aplikasi) | sama, pack terpisah dari Ori | ayam Hot per potongan |
| Kulit mentah | pack | (lihat aplikasi) | 17 porsi | kulit krispy |
| Cup kulit | pack | (lihat aplikasi) | 50 cup | kulit krispy |
| Beras | kg (karung 20 kg) | (lihat aplikasi) | porsi per kg diatur admin (default 10) | nasi |
| Kertas nasi | pack | (lihat aplikasi) | 100 lembar | nasi (1 lembar per porsi) |
| Box D'Kriuk | pack | (lihat aplikasi) | 100 box | item Box |
| Kemasan kecil | pack | (lihat aplikasi) | 100 | pelengkap |
| Kemasan besar (Kemasan Chicken) | pack | (lihat aplikasi) | 100 | pelengkap |
| Plastik besar 36/25 | pack | (lihat aplikasi) | 50 | pelengkap |
| Plastik kecil 25/15 | pack | (lihat aplikasi) | 100 | pelengkap |
| Plastik merah | pack | (lihat aplikasi) | 50 | tidak dipotong (khusus pesanan nasi box banyak); hanya dicatat saat beli |
| Saus sambal (Hot Branding) | pack | (lihat aplikasi) | 100 sachet | pelengkap |
| Saus tomat (Tomat Branding) | pack | (lihat aplikasi) | 100 sachet | pelengkap |
| Tepung D'Kriuk (Tepung Ori) | pack 1,3 kg / karung 19,5 kg | (lihat aplikasi) | tanpa campuran: 1 pack ≈ 3 pack ayam | **tidak** dipotong otomatis; dianalisis (§6) |
| Tepung A | karung 25 kg | (lihat aplikasi) | dicampur 50:50 dengan Tepung D'Kriuk | **tidak** dipotong otomatis; dianalisis (§6) |
| Minyak | per pembelian | (lihat aplikasi) | — | **tidak** dipotong otomatis; dianalisis (§6) |

**Nasi.** Stok beras dicatat dalam kg. Setiap porsi nasi memotong `1 ÷ porsi_per_kg` kg. Nilai `porsi_per_kg` diatur admin, dengan default **10** (sama dengan hitungan HPP franchise). Setiap opname, aplikasi menghitung **porsi per kg aktual** dari beras yang benar-benar terpakai dibagi porsi nasi terjual, lalu menampilkannya sebagai saran kalibrasi. Kalau angkanya terus di bawah perkiraan, itu tanda porsi nasi di toko lebih besar dari 150 g.

**Modal tepung (rumus wajib, dicatat dari owner 4 Okt 2026).** Tepung D'Kriuk dan Tepung A dicampur **50:50 menurut berat**, padahal harga per kg dan ukuran karungnya berbeda (D'Kriuk ±20 kg, Tepung A 25 kg), sehingga keduanya tidak habis bersamaan. Karena itu modal **tidak boleh** dihitung per karung:
1. Harga per kg tiap tepung = harga karung (atau pack) ÷ isi kg-nya, dari harga beli sebenarnya saat barang masuk.
2. Harga per kg campuran (acuan) = (harga/kg D'Kriuk + harga/kg Tepung A) ÷ 2.
3. Pemakaian per periode dihitung **dalam kg per jenis tepung**: stok awal + kg dibeli − stok akhir (opname).
4. Modal tepung periode = Σ (kg terpakai × harga/kg) untuk masing-masing tepung.
5. Modal tepung per potong = modal tepung periode ÷ (potong ayam + porsi kulit yang digoreng pada periode itu).
6. Rasio pemakaian D'Kriuk : Tepung A dibandingkan dengan 50:50; bila menyimpang jauh, laporan memberi peringatan (kemungkinan salah takar).

Analisis tepung di aplikasi menghitung angka sebenarnya per outlet: total kg tepung (D'Kriuk + A) yang dibeli di antara dua pembelian, dibagi potong ayam dan cup kulit terjual pada periode itu.

**Data bisnis tidak masuk repo publik.** Harga beli, file HPP, dan daftar harga stokis hanya diinput lewat aplikasi atau lewat file seed lokal yang di-*gitignore*. Migrasi publik hanya berisi struktur dan data yang tidak sensitif.

**Tampilan stok ayam:** disimpan per potongan, lalu ditampilkan sebagai *pack utuh + potongan lepas*. Contoh: "5 pack Ori + 3 sayap". Pack utuh = jumlah komposisi lengkap yang masih bisa dibentuk dari potongan yang tersisa. Ambang stok menipis memakai pack-ekuivalen (total potong ÷ 9).

**Ambang stok menipis (default, bisa diubah admin):** Ayam Ori 10 pack, Ayam Hot 5 pack, setiap kemasan 2 pack, cup kulit 50 pcs (1 pack). Bahan lain diatur admin.

**Stok minus:** penjualan tetap boleh, tetapi kasir melihat peringatan dan admin dapat notifikasi.

**Barang masuk:** hanya admin yang menginput, dengan memilih outlet tujuan. Harga beli ayam, kemasan, cup, plastik, dan saus diisi otomatis dari harga tetap per outlet (Kertapati punya harga sendiri). Harga beras, minyak, tepung, dan bahan lain diisi setiap kali beli. Setiap barang masuk **otomatis tercatat sebagai pengeluaran** outlet itu.

**Barang rusak/terbuang:** dicatat oleh kasir atau admin. Alasannya dipilih dari daftar: sisa tidak laku, gosong, basi, jatuh/rusak, atau lainnya (dengan catatan).

**Transfer antar outlet**, dengan alur:
1. Kasir outlet asal mengajukan.
2. Admin menyetujui.
3. Kasir outlet tujuan mengonfirmasi terima.

Stok baru berpindah di langkah 3. Setiap langkah mengirim notifikasi.

**Stock opname (setiap Minggu):**
1. Kasir menginput hitungan fisik.
2. Sistem menampilkan selisihnya.
3. Admin meninjau, lalu menyetujui koreksi.

Koreksi masuk ke buku besar sebagai baris "opname".

---

## 5. Kasir, shift & struk

**Layar kasir:** grid tombol besar untuk menu, dipakai landscape di tablet dan tetap nyaman di HP. Keranjang ada di samping atau bawah, dengan tombol **Bayar** yang mencolok.

**Pembayaran:** satu metode per transaksi, yaitu **Cash, QRIS, GoFood, GrabFood, atau ShopeeFood**. Untuk cash, kasir menginput uang diterima dan kembalian dihitung otomatis.

**Waktu:** setiap transaksi menyimpan timestamp lengkap (tanggal, jam, menit, detik) dalam WIB (Asia/Jakarta). Satu hari laporan = 00:00–23:59, karena toko tidak pernah buka lewat tengah malam.

**Struk:**
- Dicetak ke printer thermal Bluetooth langsung dari Chrome Android (ESC/POS, lebar 58/80 mm diatur di pengaturan).
- Salinannya dikirim ke grup Telegram.
- Isi struk: nama outlet, alamat, WA, nomor transaksi, waktu, kasir, item (termasuk pelengkap Rp0), total, metode bayar, uang diterima/kembalian, dan "Terima kasih".

**Void:**
- Kasir boleh membatalkan transaksi **dalam shift yang sama**.
- Alasan wajib diisi.
- Stok dikembalikan otomatis.
- Admin dapat notifikasi di aplikasi dan Telegram.
- Void di luar shift hanya bisa dilakukan admin.

**Shift:**
- *Buka shift*: kasir mengisi modal kembalian.
- *Tutup shift*: kasir menghitung uang fisik di laci. Sistem menampilkan **cash seharusnya = modal + penjualan cash − void cash** beserta selisihnya.
- Ringkasan shift per kanal (Cash, QRIS, GoFood, GrabFood, ShopeeFood) dikirim ke Telegram.

**Setoran:** uang cash per outlet disetor ke owner. Kasir mencatat setoran, lalu admin mengonfirmasi terima. Admin bisa melihat saldo cash yang belum disetor per outlet.

---

## 6. Keuangan

**Pendapatan:** otomatis dari penjualan, dipisah per outlet dan per kanal: Cash, QRIS, GoFood, GrabFood, ShopeeFood.

**Pengeluaran per outlet:**
- *Kasir:* gas, token listrik, air, dan pengeluaran kecil lain. Nominalnya bebas karena harganya tidak tetap.
- *Admin:* semua kategori, termasuk gaji, sewa, dan belanja bahan (otomatis dari barang masuk).
- Admin bisa menambah kategori baru.

**Halaman Biaya Tetap:** sewa tahunan per outlet dan biaya rutin lain yang bisa dikustom. Biaya ini dibagi rata per hari ke laporan laba-rugi.

**Halaman Gaji:**
- Data karyawan per outlet dengan **upah harian**. Data ini terpisah dari akun aplikasi.
- Admin mencatat kehadiran harian.
- Sistem menghitung gaji bulanan (hari hadir × upah harian, ditambah penyesuaian bila ada).
- Saat gaji dibayar, otomatis tercatat sebagai pengeluaran.

**Halaman Rencana Belanja:**
- Menampilkan stok saat ini, rata-rata pemakaian harian (7/14 hari), dan perkiraan berapa hari lagi habis, per outlet.
- Memberi saran jumlah beli dalam pack untuk N hari ke depan beserta perkiraan biayanya.
- Bisa langsung diubah menjadi barang masuk.

**Analisis minyak & tepung:** di antara dua pembelian minyak (atau tepung) di satu outlet, sistem menghitung potong ayam dan cup kulit yang terjual. Hasilnya: rata-rata **potong per liter/kg**, **biaya per potong**, dan tren dari waktu ke waktu.

**Laba-rugi (dasar akrual), per outlet dan total:**

```
  Pendapatan penjualan
− HPP bahan terpakai (harga beli rata-rata × pemakaian)
− Barang rusak/terbuang
− Minyak & tepung (dari analisis pemakaian / pembelian periode)
− Operasional: listrik, air, gas, lain-lain
− Gaji (akrual harian)
− Sewa & biaya tetap (dibagi per hari)
= Laba bersih
```

Selain laba-rugi, tersedia **laporan arus kas per kanal** (uang masuk per Cash/QRIS/ojol dikurangi uang keluar), karena belanja bahan dicatat sebagai pengeluaran langsung.

**Rekonsiliasi ojol:** admin menginput dana yang cair dari GoFood, GrabFood, dan ShopeeFood per periode. Sistem membandingkannya dengan penjualan tercatat, lalu menampilkan potongan komisi (Rp dan %) per aplikasi. Dari sini kelihatan apakah harga online sudah tepat dan aplikasi mana yang paling menguntungkan.

---

## 7. Dashboard (admin)

Data diperbarui real-time. Setiap panel bisa dilihat untuk **Semua outlet** atau per outlet, dengan rentang waktu: Hari ini, Kemarin, 7 hari, Bulan ini, atau kustom.

- **Angka utama:** omzet, jumlah transaksi, rata-rata per transaksi, potong ayam terjual, laba kotor, cash belum disetor.
- **Tren omzet:** harian, mingguan, bulanan, dibandingkan dengan periode sebelumnya.
- **Kanal penjualan:** Cash, QRIS, GoFood, GrabFood, ShopeeFood (nominal dan jumlah transaksi).
- **Menu terlaris:** Ori vs Hot, per potongan, kulit, dan nasi box.
- **Jam ramai:** heatmap hari × jam per outlet.
- **Perbandingan outlet:** berdampingan.
- **Status stok:** pack + potongan, dengan penanda menipis/minus.
- **Feed kejadian:** void, transfer, opname, selisih kas, stok menipis.
- Laba-rugi, arus kas, analisis minyak/tepung, rencana belanja, dan rekonsiliasi ojol di halaman masing-masing.
- **Export** setiap laporan ke **PDF** dan **Excel**.

---

## 8. Telegram (satu grup untuk semua outlet)

| Pesan | Kapan | Format |
|---|---|---|
| Struk transaksi | setiap transaksi | ringkas: outlet, waktu, item, total, kanal |
| Ringkasan tutup shift | saat kasir tutup shift | per kanal, cash seharusnya vs fisik, selisih |
| Ringkasan harian | jam yang diatur admin (default 22:00 WIB) | semua outlet, omzet per kanal, terlaris, stok menipis |
| Peringatan | saat terjadi | void, stok menipis/minus, transfer, opname, selisih kas |

Token bot hanya disimpan di server (Supabase secrets), tidak pernah di kode publik.

---

## 9. Offline & sinkron

Aplikasi bisa dipasang ke layar utama HP/tablet (PWA). Ketika internet putus:
- Kasir tetap bisa berjualan.
- Transaksi disimpan di perangkat dengan ID unik, lalu terkirim otomatis saat online. Mengirim ulang tidak akan membuat transaksi ganda.
- Ada indikator **"N transaksi belum terkirim"** dan tombol **Sinkron sekarang**.
- Struk tetap tercetak. Pesan Telegram dan update dashboard menyusul setelah sinkron.
- Data menu, harga, dan stok terakhir disimpan di perangkat supaya layar kasir tetap berjalan.

---

## 10. Arsitektur & teknologi

```
 HP/Tablet (Chrome Android)                    Supabase (gratis)
 ┌───────────────────────────────┐            ┌──────────────────────────────┐
 │ SvelteKit SPA (PWA)           │  HTTPS     │ Postgres + Row Level Security│
 │  • Svelte 5 + TypeScript      │◄──────────►│ Auth (username+password)     │
 │  • Tailwind CSS v4            │  Realtime  │ Realtime (dashboard live)    │
 │  • Dexie (IndexedDB) outbox   │            │ Edge Functions → Telegram    │
 │  • Web Bluetooth → printer    │            │ pg_cron (ringkasan harian)   │
 └───────────────────────────────┘            └──────────────────────────────┘
        ▲ di-hosting di GitHub Pages (repo open source, deploy via GitHub Actions)
```

- **Frontend:** SvelteKit 2 + Svelte 5 (adapter-static), TypeScript, Tailwind CSS v4. Svelte dipilih karena hasil build-nya sangat kecil dan cepat di HP murah.
- **Grafik:** Apache ECharts, dimuat hanya di halaman admin.
- **Export:** SheetJS (Excel), jsPDF + autotable (PDF). Keduanya dimuat saat tombol export ditekan.
- **Offline:** @vite-pwa/sveltekit (service worker) + Dexie.
- **Keamanan:**
  - Seluruh akses data dijaga RLS di database. Kasir secara teknis tidak bisa membaca atau menulis data outlet lain maupun data keuangan.
  - Anon key Supabase memang aman berada di kode publik karena dibatasi RLS.
  - Rahasia (token Telegram, service key) hanya ada di Edge Functions.
  - Operasi yang mengubah stok/uang berjalan lewat fungsi database (RPC), supaya aturan dan perhitungannya di satu tempat.
- **Struktur kode:**
  - Modular per fitur (`src/lib/features/{kasir,stok,keuangan,dashboard,...}`), satu file satu tanggung jawab, maksimal 1000 baris per file.
  - Migrasi SQL bernomor di `supabase/migrations/`.
- **Pengujian:**
  - Vitest untuk logika murni: harga, konversi pack/potong, kembalian, laba-rugi, rencana belanja.
  - Tes SQL untuk RLS dan fungsi stok.
  - Playwright untuk alur utama: login → jual → tutup shift.
- **Biaya:** Rp0. GitHub Pages dan Supabase paket gratis. Project Supabase gratis dijeda jika 7 hari tanpa aktivitas, dan ini tidak terjadi karena toko buka setiap hari.

---

## 11. Data yang masih ditunggu dari owner

**Sudah terjawab (4 Okt):** harga beli & isi pack (daftar stokis), box nasi = stok tersendiri (Box D'Kriuk), pengeluaran kecil kasir tidak memengaruhi hitungan laci, ejaan alamat "Wirasantika", logo (`4.jpg` ikon, `5.jpg` wordmark).

Juga terjawab: cup kulit isi 50, Tepung Ori = Tepung D'Kriuk (1,3 kg/pack), Tepung A Rp257.000/25 kg dicampur 50:50, plastik merah tidak dipotong otomatis, kertas nasi 1 lembar per porsi.

Alamat Kertapati, isi Kemasan Besar (100), dan isi plastik merah (50) juga sudah diterima.

Masih ditunggu (tidak menghambat pengerjaan): **kalibrasi nasi**. Masak 1 kg beras, timbang nasi matangnya, lalu bagi 150 g (lihat §4). Sementara dipakai 10 porsi/kg.

## 12. Backlog (di luar versi ini)

- Kirim struk ke WhatsApp pembeli
- Nama pelanggan & nomor antrean
- Foto nota pengeluaran (opsional)
- Pembayaran campuran (split payment)

---

## 13. Tahapan pengerjaan

Setiap tahap selesai dengan hasil yang bisa dicoba, punya rencana implementasi sendiri, dan bisa dikerjakan di sesi terpisah.

| Tahap | Isi | Hasil yang bisa dicoba |
|---|---|---|
| 0. Fondasi | Repo, scaffold SvelteKit + Tailwind, tema merah–kuning terang/gelap, layout responsif, skema database + RLS, seed 3 outlet/menu/bahan, login & routing per peran | Login sebagai admin/kasir, masuk ke halaman sesuai peran |
| 1. Data master | Kelola outlet, akun, bahan & isi pack, harga beli per outlet, menu & harga per outlet, resep pemotongan stok, ambang stok | Admin bisa mengatur semua data dasar |
| 2. Kasir | Layar POS, keranjang, 5 metode bayar + kembalian, struk thermal Bluetooth, buka/tutup shift, riwayat, void | Transaksi nyata tercatat dan struk tercetak |
| 3. Stok | Barang masuk (→ pengeluaran), stok pack + potongan, rusak/terbuang, transfer 3 langkah, opname Minggu, peringatan menipis/minus | Stok bergerak otomatis dan bisa diaudit |
| 4. Offline | PWA, outbox Dexie, indikator & tombol sinkron, cache menu/harga | Jualan tetap jalan saat internet putus |
| 5. Keuangan | Pengeluaran + kategori, setoran cash, biaya tetap (sewa), gaji harian→bulanan, laba-rugi, arus kas per kanal | Laporan keuangan per outlet |
| 6. Telegram | Struk per transaksi, ringkasan shift & harian, peringatan | Grup Telegram menerima laporan otomatis |
| 7. Dashboard & analisis | Dashboard real-time + filter, grafik, heatmap jam ramai, perbandingan outlet, analisis minyak/tepung, rencana belanja, rekonsiliasi ojol, export PDF/Excel | Dashboard lengkap untuk owner |
| 8. Rilis | Uji menyeluruh, deploy GitHub Pages, panduan pengguna kasir & admin | Siap dipakai di 3 outlet |
