# Tahap 7b — Analisis kebocoran (perkiraan) + rincian kasbon

Turunan grand design §6–7 dan Tahap 5b/7a. Disetujui owner dalam percakapan 9–10 Okt 2026.

## 1. Tujuan

Owner bisa mencari **kebocoran**: menu yang untungnya terlalu tipis (harga jual terlalu murah), bahan yang susut/kebanyakan dipakai, nilai rupiah yang terbuang, pemakaian minyak & tepung per potong, dan proyeksi akhir bulan. Semua ini **perkiraan** untuk analisis; **laba riil tetap** dari Laba-rugi Tahap 5b (omzet − belanja bahan − gaji − sewa − pengeluaran lain) dan diberi label jelas agar tidak tertukar.

Tambahan: di Gajian, **rincian kasbon** tiap karyawan (dari kasir & admin) supaya potongan bulanan mudah dicek.

## 2. Keputusan owner

1. Modal bahan = **rata-rata harga barang masuk di periode itu**; bila tidak ada pembelian di periode itu, harga acuan (Admin → Harga Beli).
2. Modal **pack ayam** dibagi ke tiap potongan **sebanding harga jual** potongan itu (jumlah modal seluruh potongan = harga pack).
3. Menu ditandai **untung tipis** bila untung kotor < batas (awal **30%**, diatur admin).
4. Laba riil tetap rumus sederhana 5b; analisis 7b = perkiraan.
5. Kasbon: setiap pinjaman tercatat langsung (kasir di menu Kas atau admin); saat gajian potongan otomatis terisi **seluruh sisa kasbon**, admin boleh mengubah (mis. dicicil 200 rb), sisanya otomatis terisi di gajian bulan berikutnya — **sudah berjalan sejak 5b**; 7b menambah rincian.

## 3. Perhitungan

**Modal per satuan bahan** (per outlet & periode `[dari, sampai)`):
- Harga satuan beli = Σ subtotal ÷ Σ jumlah barang masuk (tidak batal) di outlet & periode; bila tidak ada, `harga_beli` acuan outlet.
- Satuan beli satu bahan (beras, tepung, minyak, kemasan, …): modal per satuan bahan = Σ subtotal ÷ Σ (jumlah × isi) atas semua satuan beli bahan itu yang dibeli di periode; bila tidak ada pembelian: acuan satuan beli ber-isi terkecil ÷ isi.
- Satuan beli berisi > 1 bahan (pack ayam): bobot tiap bahan = rata-rata harga jual menu ayam satu-bahan itu di outlet (bobot 1 bila tidak ada); modal potongan *i* = harga pack × bobot*i* ÷ Σ(isi*j* × bobot*j*).
- Bahan tanpa harga sama sekali → modal tidak diketahui; menu yang memakainya ditandai "modal belum lengkap".

**Untung per menu**: modal menu = Σ resep × modal bahan; untung/porsi = harga jual outlet − modal; persen = untung ÷ harga jual. Periode: terjual (jumlah), omzet item, modal terjual, untung kotor (omzet item − jumlah × modal). Tanda tipis bila persen < batas.

**Susut**: gerakan stok `opname` (selisih hitungan − sistem saat opname disetujui, bertanggal jam hitung) × modal, per bahan & outlet. Minus = hilang/kebanyakan dipakai dibanding resep.

**Terbuang**: catatan sisa/rusak tidak batal × modal, per alasan & bahan.

**Minyak & tepung** (grand design §6): per outlet & bahan (minyak, tepung D'Kriuk, tepung A), urutan pembelian; untuk tiap pembelian sampai pembelian berikutnya (atau sekarang): potong ayam + porsi kulit terjual, **potong per liter/kg** = terjual ÷ jumlah dibeli, **biaya per potong** = subtotal ÷ terjual. Periode: total kg tepung per jenis → rasio D'Kriuk : A (peringatan bila di luar 40–60%), modal tepung per potong = Σ biaya tepung ÷ potong.

**Proyeksi bulan berjalan**: dari `laporan_keuangan` (laba riil) 1 bulan ini s.d. hari ini: omzet & laba ÷ hari berlalu × hari sebulan; dibanding bulan lalu penuh. Ditandai "perkiraan".

## 4. Layar

- **Admin → Analisis** (outlet/semua, periode): tab **Untung per menu** (tabel urut untung % terkecil, tanda tipis, batas bisa diubah), **Susut & terbuang** (rupiah per bahan/alasan), **Minyak & tepung**, **Proyeksi**. Label "Perkiraan — laba riil ada di Laba-rugi".
- **Dasbor**: sumber baru `untung_menu` (ukuran: untung, modal, omzet; kelompok: waktu, outlet, menu, kategori, varian), `susut` (ukuran: nilai, jumlah; kelompok: waktu, outlet, bahan); `terbuang` mendapat ukuran `nilai`.
- **Gaji → Gajian**: tiap karyawan bisa membuka **rincian kasbon** (tanggal, jumlah, dari laci/owner, dicatat oleh, sudah dipotong / sebagian / belum — dipotong urut tanggal tertua), sisa yang terbawa. Daftar kasbon admin menampilkan pencatat.

## 5. Pengujian

DB: modal rata-rata vs acuan; pembagian pack sebanding harga jual (jumlah = harga pack); untung menu & tanda tipis; susut dari opname; nilai terbuang; interval minyak/tepung & rasio; proyeksi; sumber dasbor baru; admin saja. Unit: status kasbon dipotong urut tanggal. E2E server & daftar uji owner.
