# Tahap 5b — Gaji & kasbon, biaya tetap (sewa), laba-rugi sederhana, arus kas

Turunan grand design §6 dan Tahap 5a (`2026-10-09-tahap-5a-kas-harian-design.md`). Disetujui owner per bagian dalam percakapan 9 Okt 2026.

## 1. Tujuan & ukuran berhasil

Owner bisa mencatat karyawan, kehadiran, kasbon, dan gaji bulanan; mencatat sewa; lalu membaca **laba-rugi riil per outlet per bulan** dengan cara owner sendiri (omzet − belanja bahan − gaji − sewa − pengeluaran lain) dan **arus kas** per kanal.

Contoh owner (Bukit Lama, sebulan): omzet 30 jt − belanja bahan 25 jt − gaji, sewa & pengeluaran 3 jt = laba 2 jt.

## 2. Keputusan owner (9 Okt 2026)

1. Gaji **bulanan**: hari masuk × upah harian + penyesuaian − kasbon. Ada **kasbon**.
2. **Kehadiran dicatat admin saja** (centang per hari).
3. Kasbon **bisa dari laci** (dicatat kasir di menu Kas atau admin; mengurangi laci; bisa offline) **atau dari owner** (dicatat admin; laci tidak berubah).
4. Biaya tetap: **hanya sewa** (halaman tetap bisa menampung biaya tetap lain).
5. Laba-rugi memakai **cara sederhana** (tanpa koreksi sisa bahan). **Semua analisis** (untung per menu, susut bahan, terbuang, proyeksi, tren) di **Tahap 7**.
6. Gaji dibayar dari laci atau dari owner (pilih saat bayar); otomatis tercatat sebagai pengeluaran kategori Gaji; setelah dibayar bulan itu terkunci (batalkan pembayaran untuk mengubah).

## 3. Data & aturan

- `karyawan (id, outlet_id, nama, upah_harian, aktif)` — terpisah dari akun aplikasi. Kasir hanya bisa melihat **nama** karyawan aktif outletnya (lewat fungsi), tidak melihat upah.
- `kehadiran (karyawan_id, tanggal)` — ada baris = masuk. Hanya admin. Tidak bisa diubah untuk bulan yang gajinya sudah dibayar.
- Kategori sistem diberi `kode`: `kasbon` (kasir boleh), `gaji`, `sewa`, `belanja_bahan` (kategori "Belanja bahan di luar Barang masuk"). `pengeluaran.karyawan_id` wajib untuk kasbon & gaji.
- **Kasbon** = baris `pengeluaran` kategori kasbon (sumber laci/luar). **Sisa kasbon** karyawan = Σ kasbon tidak batal − Σ potongan kasbon di gaji yang dibayar (tidak batal). Batal kasbon (admin) hanya bila sisa kasbon ≥ jumlahnya.
- `gaji (id, karyawan_id, bulan (tanggal 1), hari_masuk, upah_harian, penyesuaian, keterangan, potongan_kasbon, dibayar, pengeluaran_id, dibayar_at/oleh, batal_at/oleh/alasan)`; satu gaji aktif per karyawan per bulan. Dibayar = hari × upah + penyesuaian − potongan (≥ 0); potongan ≤ sisa kasbon. Pembayaran membuat `pengeluaran` kategori gaji (sumber laci/luar, jam sekarang) bila dibayar > 0. Batal gaji membatalkan pengeluarannya (koreksi, sesuai 5a). Pengeluaran kategori gaji tidak bisa dibatalkan lewat halaman Pengeluaran.
- `biaya_tetap (id, outlet_id, nama, per_tahun, mulai, aktif)` — untuk tiap hari, berlaku baris aktif dengan `mulai` terakhir ≤ hari itu (per outlet & nama). Bagian per hari = per_tahun ÷ 365.

## 4. Laba-rugi & arus kas (`laporan_keuangan(outlet|null, dari, sampai)`, admin, ≤ 366 hari)

```
Omzet per kanal (penjualan tidak batal, menurut tanggal jual)
− Belanja bahan  = barang masuk (tanggalnya) − koreksi batal (tanggal batal) + pengeluaran kategori belanja_bahan
− Gaji           = Σ hari masuk di periode × upah (upah di gaji yang dibayar untuk bulan itu, selain itu upah karyawan sekarang)
                   + penyesuaian gaji dibayar yang bulannya dalam periode
− Sewa           = Σ per hari bagian biaya tetap
− Pengeluaran lain = pengeluaran (laci + luar, tidak batal) selain kasbon/gaji/sewa/belanja_bahan, per kategori
= Laba
```

Omzet ojol bruto (potongan aplikasi di Tahap 7). Kasbon bukan biaya.

**Arus kas:** masuk per kanal; keluar: pengeluaran per kategori dipisah laci/luar (termasuk kasbon, gaji dibayar, sewa dibayar), belanja bahan (Barang masuk); setoran diterima owner & selisih setoran (menurut jam diterima).

## 5. Layar

- **Kasir → Kas**: bagian **Kasbon** (pilih karyawan, nominal, keterangan) — antrean offline, laci berkurang.
- **Admin → Gaji**: karyawan (tambah/ubah/nonaktif), kehadiran per outlet per bulan (centang), kasbon (daftar, catat dari laci/owner, batal), gajian per bulan (hitung, penyesuaian, potongan kasbon, Bayar dari laci/owner, batal).
- **Admin → Biaya tetap**: sewa per outlet (nominal setahun, mulai berlaku), riwayat.
- **Admin → Laba-rugi**: outlet/semua, bulan atau rentang; laba-rugi + arus kas.

## 6. Pengujian

DB: kehadiran terkunci setelah gaji dibayar; sisa kasbon & potongan; batal gaji = koreksi laci; kasbon laci mengurangi saldo; kasir tidak melihat upah; laporan contoh owner (omzet − belanja − gaji − sewa − lain); sewa per hari dengan perubahan nominal; arus kas. Unit: proyeksi laci dengan kasbon, pembentuk kejadian. E2E server & daftar uji owner.
