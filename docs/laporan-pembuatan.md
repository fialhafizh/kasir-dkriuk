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
| 4b | Offline: batal, rusak, transfer, opname, stok awal; halaman admin Perangkat & kejadian diabaikan | Selesai, di main — uji owner menunggu |
| 5a | Kas harian: uang laci berjalan, pengeluaran, setoran, kas harian, penjualan admin | Selesai, di main — uji owner menunggu |
| 5b | Gaji & kasbon, biaya tetap (sewa), laba-rugi sederhana, arus kas | Selesai di cabang — menunggu review akhir & persetujuan gabung |
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
- 6 Okt 2026: akun GitHub owner ditandai (flagged) oleh GitHub sehingga push & GitHub Pages terhambat; owner mengajukan pemulihan. **Sementara aplikasi dipasang di Netlify** (unggah folder hasil build, tanpa GitHub). Hanya alamat Supabase & kunci publik yang ikut di hasil build (sudah dicek).
- Perangkat yang pernah login bisa dibuka offline kapan pun; perangkat baru butuh internet untuk login pertama. Keluar (logout) ditolak selama masih ada data belum terkirim.

---

### Tahap 4a — yang sudah jadi
- Buka toko, jualan (struk dengan **kode struk**; offline juga **nomor sementara**), catat sisa, dan tutup toko bisa tanpa internet; data terkirim otomatis berurutan saat online (penanda **Online/Offline**, **N belum terkirim**, **Sinkron sekarang**).
- Data yang ditolak server masuk menu **Perlu perhatian** (dengan alasan, bisa dicoba lagi).
- Dua perangkat yang membuka toko di hari yang sama digabung ke satu shift; tutup toko dari perangkat kedua tetap dicatat (hitungan lacinya disimpan).
- Penjualan/sisa yang jamnya sebelum stok awal/opname **disetujui** tetapi baru terkirim sesudahnya tidak memotong stok lagi.
- Aplikasi bisa dibuka offline walau login sudah lama; **Keluar** ditolak selama masih ada data belum terkirim.
- Kode struk 6 huruf/angka bisa sama untuk dua transaksi berbeda (jarang); pencarian akan menampilkan keduanya beserta jam & outlet.

### Tahap 4b — yang sudah jadi & keputusan (9 Okt 2026)
- **Semua pekerjaan kasir kini bisa tanpa internet**: batal transaksi, catat rusak, kirim/ubah/batal kiriman, terima kiriman, opname, stok awal. Data tersimpan di HP/tablet dan terkirim otomatis berurutan saat online; kirim ulang aman (tidak dobel).
- **Batal offline** memakai jam batal di perangkat. Batal yang jamnya sebelum stok dihitung (stok awal/opname) yang sudah disetujui tidak mengembalikan stok, karena hitungan fisik sudah mencerminkannya. Batal yang jamnya sebelum tutup toko tetap diterima walau baru sampai setelah toko ditutup; ringkasan diberi tanda "… pembatalan masuk setelah tutup toko". Batal sesudah jam tutup tetap hanya admin. *Catatan:* kasir secara teknis bisa mengirim batal "berjam mundur" untuk shift yang sudah ditutup; jejaknya selalu terlihat admin lewat tanda itu.
- **Batal yang sudah dibatalkan perangkat lain** dianggap berhasil (tidak masuk Perlu perhatian).
- **Transfer di buku stok**: barang keluar dari outlet pengirim dicatat pada **jam dikirim** (saat fisiknya pergi), masuk ke tujuan pada jam diterima; dibatalkan = keluar lalu kembali pada jam batal. Dengan begitu opname yang dihitung saat barang masih di jalan tetap benar. Terima kiriman offline: jumlah dicocokkan saat sinkron; bila beda masuk **Perlu perhatian** ("Ada perbedaan jumlah…"), kasir menghitung ulang lewat halaman Terima.
- **Opname & stok awal offline** berlaku pada jam kasir menghitung. Opname yang jamnya lebih lama dari hitungan terakhir ditolak (hitung ulang).
- **Angka stok di HP** = stok server terakhir + data yang belum terkirim (jualan menurut resep, rusak, terima); ditandai "Angka perkiraan" selama ada antrean. Halaman Stok perlu dibuka sekali saat online di tiap perangkat; setelah itu diperbarui otomatis tiap sinkron.
- **Tutup toko** tetap menghitung transaksi yang ditolak server (uangnya ada di laci) tetapi menampilkannya terpisah dengan peringatan.
- Perbaikan 4a yang ditemukan saat 4b: salinan data (menu, shift) kini benar-benar dipakai saat internet putus.
- Pengerasan: dua tab aplikasi tidak mengirim bersamaan; data terkirim lama dibersihkan tanpa menghapus shift yang belum ditutup; peringatan bila ada data belum terkirim milik akun lain; halaman terbuka cepat walau sinyal lemah.
- **Admin → Perangkat**: daftar HP/tablet kasir (kode, outlet, pengguna terakhir, jam sinkron; kuning bila > 24 jam) dan daftar **kejadian yang diabaikan kasir** beserta alasannya.

### Tahap 5a — Kas harian (keputusan owner 9 Okt 2026)
- Tahap 5 dipecah: **5a kas harian** dulu, lalu **5b** (biaya tetap/sewa, gaji, laba-rugi, arus kas).
- **Uang laci menumpuk lintas hari**; kasir menyetor ke owner kira-kira tiap 3 hari dan menyisakan uang kembalian (mis. 100.000). QRIS & ojol tidak masuk laci. Contoh: 100.000 + jual cash 800.000 + 600.000 + 1.200.000 − pengeluaran 100.000 = 2.600.000; setor 2.500.000 → laci 100.000.
- **Buka toko tidak lagi mengisi modal**: aplikasi menampilkan uang laci sekarang. Pertama kali per outlet, kasir mengisi uang laci awal sekali.
- **Tutup toko**: uang seharusnya = uang laci (sudah termasuk sisa kemarin, jual cash, batal, pengeluaran, setoran); selisih seperti biasa.
- **Pengeluaran kecil kasir** (gas, token listrik, air, lain-lain dengan keterangan wajib) langsung mengurangi laci; admin bisa membatalkan.
- **Setoran** dicatat kasir (laci langsung berkurang), **owner menekan Terima**; bila uang yang diterima beda, isi jumlah sebenarnya + catatan (selisih setoran).
- Setoran & pengeluaran bisa dicatat **kapan saja** (juga saat toko tutup) dan **tanpa internet**.
- **Membatalkan catatan yang salah** (pengeluaran dobel, setoran tidak jadi, penjualan dobel dari shift yang sudah ditutup) = **koreksi**: dianggap tidak pernah ada di laci, selisih shift lama terkoreksi, uang laci sekarang tidak bergeser. Batal kasir saat toko buka = uang memang dikembalikan.
- **Penjualan offline yang telat terkirim** memperbarui selisih shift-nya sendiri, bukan uang laci hari ini.
- **Saldo laci tidak ditampilkan di layar jualan** (hanya Buka toko, Tutup toko, Kas) supaya kasir tidak menghitung untuk menutupi selisih.
- Admin: **Kas harian** (per kanal, pengeluaran, setoran, uang laci awal → akhir, selisih per hari; per outlet / semua), **Setoran**, **Pengeluaran** (laci + di luar laci + belanja bahan dari Barang masuk; kategori bisa ditambah), **Penjualan** (cari & batal, termasuk shift yang sudah ditutup).
- Belanja bahan yang terlambat dicatat (barang sudah termasuk opname) dicatat di Pengeluaran sebagai "Belanja bahan" tanpa efek stok. Batal barang masuk tampil sebagai koreksi pada **tanggal pembatalan**.
- Outlet yang dinonaktifkan tidak bisa buka toko; data lama dari HP yang telat sinkron tetap diterima.
- Shift sebelum Tahap 5a tetap dihitung dengan rumus lama (modal + jual cash).

### Tahap 5b — Gaji, sewa, laba-rugi (keputusan owner 9 Okt 2026)
- **Gaji bulanan** = hari masuk × upah harian + penyesuaian (bonus/potongan, keterangan wajib) − kasbon. Ada **kasbon**.
- **Kehadiran dicatat admin** (centang per hari di halaman Gaji). Setelah gaji dibayar, kehadiran bulan itu **terkunci**; batalkan pembayarannya untuk mengubah.
- **Kasbon** bisa dari **laci** (dicatat kasir di menu Kas → Kasbon, juga tanpa internet; laci berkurang) atau **dari owner** (dicatat admin). Sisa kasbon dipotong saat gajian; yang lebih besar dari gaji dibawa ke bulan berikutnya.
- Gaji dibayar dari laci atau dari owner (pilih saat bayar) → otomatis tercatat sebagai pengeluaran kategori Gaji.
- Kasir hanya melihat **nama** karyawan (untuk kasbon), tidak melihat upah maupun gaji yang dibayar. Outlet karyawan tidak bisa dipindah (buat karyawan baru di outlet lain).
- **Biaya tetap: hanya sewa** (nominal setahun per outlet, berlaku sejak tanggal tertentu; bila naik, tambah baris baru). Di laba-rugi dibagi rata per hari. Pembayaran sewa yang sebenarnya dicatat di Pengeluaran kategori Sewa dan tidak dihitung dua kali.
- **Laba-rugi cara sederhana** (cara owner): omzet per kanal − belanja bahan − gaji − sewa − pengeluaran lain = laba, per outlet & semua outlet, per bulan atau rentang tanggal. Omzet ojol masih bruto; kasbon bukan biaya. Dilengkapi **arus kas** (uang masuk per kanal, uang keluar laci / luar laci, setoran diterima & selisihnya).
- **Semua analisis** (untung per menu / harga jual terlalu murah, bahan kebanyakan atau susut, terbuang, proyeksi akhir bulan) dikerjakan di **Tahap 7**.

## Catatan penting untuk tahap berikutnya

- **Tahap 5 (keuangan)**: pengeluaran laci & setor langsung mengurangi uang laci; tutup toko = modal + jual cash − void − pengeluaran laci − setoran; barang masuk dibayar dari bank, bukan laci; pembelian yang terlambat dicatat di belakang opname perlu jalur pengeluaran tanpa efek stok.
- **Tahap 7 (dashboard)**: terbuang dihitung dari catatan rusak yang tidak dibatalkan; susut dari selisih opname; analisis modal tepung memakai rumus campuran 50:50 menurut berat. Gerakan transfer keluar bertanggal jam kirim (bukan jam diterima); transfer yang dibatalkan punya pasangan keluar + kembali.

## Riwayat data uji di server

- 5 Okt 2026: satu transaksi uji owner (BL-261004-001) dan shift ujinya dihapus atas permintaan owner; server bersih sebelum pemakaian.
- 9 Okt 2026: database server diperbarui untuk Tahap 4b (migrasi 0020–0021); semua uji server (kasir, stok 3a/3b, offline 4a/4b) lulus memakai outlet & akun sementara yang sudah dihapus; server kembali bersih (3 outlet, 4 akun, 0 transaksi).
- 10 Okt 2026: database server diperbarui untuk Tahap 5a (migrasi 0022–0023); semua uji server lulus; sisa data uji dari pembersihan yang gagal dihapus; server bersih (3 outlet, 4 akun, 0 transaksi, 7 kategori pengeluaran).
