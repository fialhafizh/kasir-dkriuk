# Tahap 7a — Dasbor yang bisa dirakit (seperti Kibana)

Turunan grand design §7. Tahap 7 dipecah: **7a dasbor** → 7b analisis kebocoran (laba per menu, susut, nilai terbuang, minyak/tepung, proyeksi) → 7c alat (rekonsiliasi ojol, rencana belanja, ekspor PDF/Excel). Disetujui owner per bagian dalam percakapan 9 Okt 2026.

## 1. Tujuan & ukuran berhasil

Owner bisa memantau dan menganalisis semua data yang masuk (penjualan, item, stok, terbuang, kas, setoran, kejadian) dari HP maupun laptop, lewat **dasbor yang bisa dibuat, diubah, dan disusun sendiri** tanpa menulis rumus. Satu dasbor bawaan "Ringkasan" langsung terpakai. Angka sama dengan halaman lain (Kas, Laba-rugi, Stok).

## 2. Keputusan owner (9 Okt 2026)

1. Urutan 7a dasbor → 7b analisis → 7c alat.
2. Dipakai di HP dan laptop sama pentingnya.
3. Diperbarui otomatis ±1 menit + tombol Muat ulang (bukan detik itu juga).
4. Semua data bisa diagregasikan per hari/minggu/bulan, per outlet, dst.; termasuk bahan paling banyak terpakai, terbuang harian, pendapatan per outlet per hari.
5. Setiap kejadian tercatat dengan jamnya → **siklus stok**: berapa lama sekali stok habis, pemakaian per hari, perkiraan habis; **riwayat kejadian** lengkap.
6. Dasbor **bisa dirakit seperti Kibana**: banyak dasbor, tambah/ubah/hapus panel, **hanya admin** yang bisa mengubah.
7. Tata letak: **seret & ubah ukuran di laptop**, susun otomatis di HP (di HP disunting dengan naik/turun & lebar).
8. Hitungan di server; grafik buatan sendiri (tema merah–kuning terang/gelap).
9. "Potong ayam" = item kategori ayam (Dada/Paha Atas/Paha Bawah/Sayap Ori & Hot); kulit, nasi, box terpisah.
10. Semua tampilan berbahasa Indonesia.

## 3. Definisi angka

- Omzet & transaksi: penjualan tidak batal menurut **jam jual** (WIB), termasuk penjualan offline yang telat sampai. Ojol bruto (potongan aplikasi di 7c).
- Batal: menurut jam batal. Terbuang: catatan sisa/rusak tidak batal, menurut jamnya. Pemakaian bahan: gerakan stok `jual` + `jual_batal` (dipotong resep, dikembalikan saat batal).
- Uang laci saat ini: `saldo_laci` per outlet (tidak tergantung periode).
- Periode pembanding: panjang sama tepat sebelum periode (mis. hari ini ↔ kemarin, 7 hari ↔ 7 hari sebelumnya); **bulan ini ↔ tanggal yang sama bulan lalu** (1–9 Okt ↔ 1–9 Sep), bulan lalu ↔ bulan sebelumnya.
- Tutup toko: shift yang benar-benar ditutup (bukan tertunda), selisih dari ringkasan shift, menurut jam tutup.

## 4. Katalog (satu-satunya yang diterima server)

| Sumber | Ukuran | Pengelompokan |
|---|---|---|
| `penjualan` | omzet, transaksi, rata_rata | waktu, outlet, kanal, kasir, jam, hari |
| `item` | jumlah, rupiah | waktu, outlet, menu, kategori, varian, kanal |
| `pemakaian` | jumlah | waktu, outlet, bahan |
| `terbuang` | jumlah | waktu, outlet, bahan, alasan |
| `barang_masuk` | rupiah, jumlah | waktu, outlet, barang |
| `pengeluaran` | rupiah | waktu, outlet, kategori, sumber |
| `setoran` | dicatat, diterima, selisih | waktu, outlet |
| `tutup_toko` | selisih, banyak | waktu, outlet, kasir |
| `batal` | banyak, rupiah | waktu, outlet, kasir, kanal |

- `waktu` memakai satuan `jam` / `hari` / `minggu` / `bulan` (WIB). `jam` = jam 0–23, `hari` = Senin–Minggu.
- Satu panel: 1 sumber, 1–4 ukuran, 0–2 pengelompokan, saringan pada kolom pengelompokan sumber itu (daftar nilai), urutan (ukuran naik/turun atau kelompok), batas 1–500 baris.
- Server mengembalikan setiap kelompok sebagai `kunci` + `label` yang bisa dibaca (nama outlet, menu, bahan beserta satuannya, kasir, kanal, alasan).
- Sumber baru di 7b/7c cukup ditambahkan ke katalog.

## 5. Dasbor & panel

- `dasbor (id, nama, urutan, utama, saringan {outlet_id|null, periode, dari, sampai}, diubah_at, diubah_oleh)`; tepat satu `utama`.
- `dasbor_panel (id, dasbor_id, judul, jenis, spek jsonb, x, y, w, h)` di kisi 12 kolom.
- Garis 1 ukuran; batang dengan beberapa ukuran ditampilkan berdampingan (tiap ukuran skala & satuannya sendiri), nilai minus berwarna merah. Panel boleh tinggi maks. 20 baris kisi.
- Jenis tampilan: `angka`, `batang`, `garis`, `lingkaran`, `tabel`, `peta_panas` (dua pengelompokan, mis. hari × jam). Jenis khusus: `status_stok`, `siklus_stok`, `riwayat`, `uang_laci`.
- Spek panel: sumber, ukuran, kelompok, saringan, urutan, batas, `periode_kunci` (opsional: abaikan periode atas, mis. "30 hari terakhir", "bulan ini"), `bandingkan` (angka & tabel; kolom ± per baris kelompok selain waktu), `outlet_kunci` (opsional).
- Periode: Hari ini, Kemarin, 7 hari, 30 hari, Bulan ini, Bulan lalu, Kustom (dihitung di perangkat dalam WIB, dikirim sebagai rentang jam).
- Penyimpanan seluruh dasbor (beserta panelnya) dalam satu fungsi — tersimpan utuh atau tidak sama sekali. Validasi spek di server memakai katalog.
- Dasbor bawaan **Ringkasan** (dibuat migrasi; bisa dikembalikan lewat tombol **Kembalikan bawaan** yang membuat ulang dasbor itu):
  angka (omzet, transaksi, rata-rata, potong ayam, terbuang, uang laci) dengan pembanding; garis omzet per hari × outlet; batang kanal; batang menu terlaris (10 teratas); batang varian Ori/Hot; batang bahan terpakai (10 teratas); batang terbuang per hari × alasan; peta panas hari × jam; tabel perbandingan outlet; status stok; riwayat kejadian.

## 6. Panel khusus

- **Status stok**: semua outlet (atau outlet terpilih), sama dengan halaman Stok (pack + lepas, menipis/minus).
- **Siklus stok** (per outlet & baris stok/bahan yang dipilih di panel):
  - lini waktu saldo (titik tiap gerakan, digambar per jam/hari),
  - **episode habis**: kapan saldo ≤ 0 (habis/minus) dan kapan pulih; **lama bertahan** sejak barang masuk/terima sampai habis; rata-rata jarak antar barang masuk,
  - pemakaian rata-rata per hari (jual + sisa/rusak) dan **perkiraan habis** = saldo sekarang ÷ pemakaian rata-rata 7 hari terakhir.
- **Riwayat kejadian**: daftar urut waktu (terbaru dulu, muat lebih) dari jualan, batal, sisa/rusak, barang masuk, transfer (kirim/terima/batal), opname & stok awal (diajukan/diputus), buka & tutup toko (dengan selisih), pengeluaran, kasbon, setoran (dicatat/diterima), data diabaikan kasir; bisa disaring per jenis & outlet.
- **Uang laci**: saldo laci tiap outlet sekarang.

## 7. Layar

- Menu admin **Dasbor** (paling atas). Tampilan: pemilih dasbor, saringan outlet & periode, tombol Muat ulang (+ jam terakhir diperbarui; tanda bila offline/gagal), kisi panel. Di HP panel berjajar ke bawah sesuai urutan kisi.
- Tiap panel grafik bisa dibalik ke **tabel angka**.
- **Mode sunting** (tombol **Ubah dasbor**): di layar lebar panel diseret & diubah ukurannya (pustaka gridstack, dimuat hanya saat menyunting); di HP tombol naik/turun & lebar. **Tambah panel** = formulir bertahap (jenis → sumber → ukuran → kelompok → saringan → periode) dengan pratinjau langsung; menu ⋯ panel: ubah, gandakan, hapus. **Simpan**/**Batal**.
- **Kelola dasbor**: buat baru (kosong / salin), ganti nama, hapus (minimal tersisa satu), jadikan utama, kembalikan bawaan.

## 8. Keamanan & kinerja

- Semua fungsi & tabel dasbor hanya admin; kasir ditolak (42501).
- Agregasi dibangun dari potongan SQL tetap per katalog; nilai saringan & rentang selalu parameter (tidak ada teks pengguna yang masuk ke SQL). Rentang ≤ 400 hari, baris ≤ 500.
- Data diambil hanya untuk panel yang tampil; pembaruan otomatis hanya saat halaman terlihat.

## 9. Pengujian

DB (PGlite): tiap sumber × ukuran dengan contoh hitungan manual (batal tidak dihitung, offline telat masuk ke jam aslinya, WIB, minggu/bulan), saringan, batas & urutan, pembanding; spek tidak valid ditolak; kasir ditolak; simpan dasbor atomik, tepat satu utama, kembalikan bawaan; siklus stok (episode habis, lama bertahan, perkiraan habis); riwayat kejadian urut & tersaring. Unit: periode WIB & pembanding, validasi spek klien = katalog server, susun kisi HP, skala grafik. E2E server & daftar uji owner.
