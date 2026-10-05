# Laporan Pembuatan Aplikasi Kasir D'Kriuk

Catatan ringkas semua tahap, keputusan owner, dan hal penting yang perlu diketahui. Diperbarui setiap tahap. Rincian teknis ada di `docs/superpowers/specs/` (desain) dan `docs/superpowers/plans/` (rencana); daftar uji owner ada di `docs/uji/`.

**Outlet:** BL D'Kriuk Bukit Lama · TK D'Kriuk Talang Kerangga · KP D'Krizzpy Kertapati (ayam & kulit −Rp1.000).
**Akun:** satu admin (owner) dan satu kasir per outlet.
**Teknologi:** aplikasi web (PWA) SvelteKit, database Supabase (gratis), dipasang di GitHub Pages (gratis). Biaya Rp0/bulan.

---

## Status

| Tahap | Isi | Status |
|---|---|---|
| 0 | Fondasi: login, tema merah–kuning terang/gelap, database & aturan akses | Selesai, di main |
| 1 | Data master: outlet, akun, bahan & isi pack, harga beli, menu & harga jual, resep | Selesai, di main |
| 2 | Kasir: jualan, 5 metode bayar, kembalian, struk printer Bluetooth/RawBT, buka & tutup toko, riwayat & batal | Selesai, di main — **uji printer menunggu owner** |
| 3a | Stok dasar: potong otomatis dari penjualan, barang masuk, stok awal, tanda Aman/Menipis/Minus | Selesai, di main — uji owner menunggu |
| 3b | Stok lanjutan: rusak/terbuang & sisa harian, transfer antar outlet, opname mingguan | Selesai, di main — uji owner menunggu |
| 4a | Offline: buka toko, jualan + struk, sisa, tutup toko tanpa internet; aplikasi online & bisa dipasang ke layar utama | Selesai — uji owner menunggu |
| 4b | Offline: batal, rusak, transfer, opname; halaman admin Perangkat & kejadian diabaikan | Berikutnya |
| 5 | Keuangan: pengeluaran, setoran, kas harian, gaji, sewa, laba-rugi | Belum |
| 6 | Telegram: struk, ringkasan shift & harian, peringatan | Belum |
| 7 | Dashboard & analisis (termasuk modal tepung, terbuang, susut) | Belum |
| 8 | Rilis: uji menyeluruh, panduan pengguna | Belum |

---

## Keputusan owner per tahap

### Umum
- Repo kode **publik** di GitHub (`daffialhafizh/kasir-dkriuk`). Harga beli & data bisnis **tidak pernah** dimasukkan ke kode (dijaga tes otomatis). Riwayat lama yang berisi harga beli dibiarkan (harga stokis tidak rahasia).
- Bahasa aplikasi: Indonesia. Tampilan untuk tablet & HP.
- Tidak ada outlet yang buka lewat tengah malam: toko wajib ditutup sebelum jualan hari berikutnya (batas 00.00 WIB).

### Tahap 2 — Kasir
- Modal kembalian diisi saat pertama jualan (terisi modal terakhir); "Tutup toko" di akhir hari menghitung selisih uang laci.
- Struk otomatis tercetak bila printer tersambung (OKAY 58B, kertas 58 mm); cadangan lewat aplikasi RawBT.
- Ojol (GoFood/GrabFood/ShopeeFood) cukup sebagai metode bayar.
- Jumlah item di keranjang bisa diketik langsung (mis. 150 nasi box).

### Tahap 3a — Stok dasar
- Stok dicatat per outlet sebagai buku besar: setiap kejadian satu baris, bisa ditelusuri.
- Penjualan memotong stok otomatis sesuai resep; batal transaksi **selalu** mengembalikan stok persis.
- Barang masuk hanya diinput admin; harga terisi otomatis (beras, tepung A, minyak wajib diketik); nilainya menjadi pengeluaran di Tahap 5.
- Stok awal diisi kasir, disetujui admin; berlaku pada jam kasir menghitung.
- Barang yang datang sebelum stok dihitung jangan dicatat lagi (formulir mengingatkan jam hitung).

### Tahap 3b — Stok lanjutan
- Rusak/terbuang langsung mengurangi stok; alasan: sisa tidak laku (dibuang), dimakan/dibawa karyawan, gosong, basi, jatuh/rusak, lainnya. Disimpan per alasan untuk dashboard "berapa yang terbuang".
- **Tutup toko** wajib menjawab "Ada sisa yang tidak terjual?"; nasi diisi porsi → otomatis kg beras.
- **Transfer antar outlet tanpa persetujuan admin**: pengirim mencatat jumlah; penerima mengetik jumlah yang diterima **tanpa melihat** angka kiriman; tidak cocok → ditolak dengan pesan "Ada perbedaan jumlah. Silakan hubungi outlet pengirim". Pengirim boleh mengubah/membatalkan selama belum diterima.
- **Opname mingguan** (pengingat setiap Minggu) dengan **hitung buta**; admin melihat selisih per bahan dan menyetujui. Angka stok di tab kasir **disembunyikan selama opname jatuh tempo** (pilihan B).
- Selama opname/stok awal menunggu persetujuan, barang masuk atau rusak dari sebelum jam hitung tidak bisa dicatat/dibatalkan — tolak hitungan itu dulu bila perlu dibetulkan.

### Tahap 4 — Offline & pemasangan online (desain disetujui 5 Okt 2026)
- **Semua pekerjaan kasir tetap jalan tanpa internet** (pilihan C): buka toko, jualan + struk, batal, rusak & sisa, kirim/terima transfer, opname, tutup toko. Pekerjaan admin tetap butuh internet.
- Data tersimpan di perangkat dan terkirim **berurutan, persis sekali** saat online; jam kejadian asli yang dipakai.
- Perangkat: umumnya satu per outlet, bisa pindah ke HP karyawan, bisa dua perangkat bersamaan. Dua perangkat yang membuka toko di hari yang sama **digabung** ke satu shift; tutup toko di satu perangkat menutup outlet; membuka lagi sesudahnya = shift baru dengan catatan jam tutup & buka.
- Penjualan yang terjadi sebelum tutup toko tapi baru terkirim sesudahnya tetap masuk shift-nya; ringkasan diperbarui dan diberi tanda untuk admin.
- **Nomor struk**: online nomor resmi; offline nomor sementara `S<kode perangkat>-NNN`; setiap transaksi punya **kode struk** pendek yang tercetak dan bisa dicari; struk offline tetap bisa ditelusuri ke pesanannya (nomor resmi, nomor sementara, jam jual, jam sampai, perangkat, kasir, isi).
- Kejadian yang ditolak server masuk **Perlu perhatian** (coba lagi / abaikan dengan alasan, dilaporkan ke admin). Admin punya halaman **Perangkat** (jam sinkron terakhir tiap HP/tablet).
- **Pemasangan online dimajukan ke Tahap 4** supaya bisa diuji di HP/tablet sungguhan (offline, printer Bluetooth, RawBT): alamat `https://daffialhafizh.github.io/kasir-dkriuk/`, bisa dipasang ke layar utama.
- Perangkat yang pernah login bisa dibuka offline kapan pun; perangkat baru butuh internet untuk login pertama. Keluar (logout) ditolak selama masih ada data belum terkirim.

---

### Tahap 4a — yang sudah jadi
- Buka toko, jualan (struk dengan **kode struk**; offline juga **nomor sementara**), catat sisa, dan tutup toko bisa tanpa internet; data terkirim otomatis berurutan saat online (penanda **Online/Offline**, **N belum terkirim**, **Sinkron sekarang**).
- Data yang ditolak server masuk menu **Perlu perhatian** (dengan alasan, bisa dicoba lagi).
- Dua perangkat yang membuka toko di hari yang sama digabung ke satu shift; tutup toko dari perangkat kedua tetap dicatat (hitungan lacinya disimpan).
- Penjualan/sisa yang jamnya sebelum stok awal/opname **disetujui** tetapi baru terkirim sesudahnya tidak memotong stok lagi.
- Aplikasi bisa dibuka offline walau login sudah lama; **Keluar** ditolak selama masih ada data belum terkirim.
- Kode struk 6 huruf/angka bisa sama untuk dua transaksi berbeda (jarang); pencarian akan menampilkan keduanya beserta jam & outlet.

## Catatan penting untuk tahap berikutnya

- **Tahap 5 (keuangan)**: pengeluaran laci & setor langsung mengurangi uang laci; tutup toko = modal + jual cash − void − pengeluaran laci − setoran; barang masuk dibayar dari bank, bukan laci; pembelian yang terlambat dicatat di belakang opname perlu jalur pengeluaran tanpa efek stok.
- **Tahap 7 (dashboard)**: terbuang dihitung dari catatan rusak yang tidak dibatalkan; susut dari selisih opname; analisis modal tepung memakai rumus campuran 50:50 menurut berat.

## Riwayat data uji di server

- 5 Okt 2026: satu transaksi uji owner (BL-261004-001) dan shift ujinya dihapus atas permintaan owner; server bersih sebelum pemakaian.
