# Tahap 3a — Stok dasar: buku besar, potong otomatis, barang masuk, stok awal

Turunan dari grand design `2026-10-04-kasir-dkriuk-design.md` §4. Disetujui owner per bagian dalam percakapan (Tahap 3 dipecah: **3a** sekarang, **3b** = rusak/terbuang, transfer 3 langkah, opname mingguan).

## 1. Tujuan & ukuran berhasil

- Setiap penjualan memotong stok bahan per outlet secara otomatis sesuai resep; setiap pembatalan mengembalikan **persis** potongan transaksi itu.
- Admin mencatat barang masuk per outlet; stok bertambah, nilainya tersimpan sebagai calon pengeluaran (dibaca Tahap 5).
- Kasir mengisi stok awal sekali; admin menyetujui; sejak itu stok tiap bahan per outlet bisa dilihat, ditelusuri baris demi baris, dan diberi tanda Aman / Menipis / Minus.
- Koreksi Tahap 2: jumlah item di keranjang bisa **diketik langsung** (mis. 150 nasi box).

Berhasil bila: owner menjual 1 Dada Ori dan melihat stok dada Ori berkurang 1 (beserta kemasan bila dipilih); membatalkannya mengembalikan angka; memasukkan 5 pack Ayam Ori menambah 15 dada, 10 paha atas, 10 paha bawah, 10 sayap; layar stok menampilkan "5 pack Ori + 3 sayap".

## 2. Di luar cakupan 3a

- Rusak/terbuang, transfer antar outlet, opname mingguan → **3b** (memakai tabel gerakan yang sama).
- Pengeluaran kecil kasir, setor, laporan kas harian, laba-rugi → **Tahap 5** (lihat catatan kas harian di grand design §5).
- Notifikasi Telegram → **Tahap 6**. Di 3a peringatan hanya di dalam aplikasi.
- Offline → Tahap 4. Rencana belanja & analisis tepung/minyak → Tahap 7.

## 3. Model data (migrasi baru 0010+, migrasi lama tidak diubah)

**`gerakan_stok`** — buku besar, hanya bertambah (tidak ada update/delete dari aplikasi).
- `id` bigint identity, `outlet_id`, `bahan_id` (FK restrict), `qty numeric(14,4)` (+ masuk / − keluar, ≠ 0), `jenis` enum, `waktu` (waktu usaha), `dicatat_at` default now() (urutan audit), `oleh` (profil).
- Sumber (tepat satu sesuai jenis): `penjualan_id`, `barang_masuk_id`, `stok_awal_id`.
- `jenis` enum 3a: `awal`, `masuk`, `masuk_batal`, `jual`, `jual_batal`. Enum dirancang untuk ditambah di 3b (`rusak`, `transfer_keluar`, `transfer_masuk`, `opname`).
- Indeks `(outlet_id, bahan_id, waktu)`, `(penjualan_id)`, `(barang_masuk_id)`.

**Stok saat ini** = `sum(qty)` per (outlet, bahan) — view `stok_outlet` (security_invoker) yang juga mengembalikan baris 0 untuk bahan aktif tanpa gerakan.

**`barang_masuk`** (kepala): `id`, `outlet_id`, `tanggal` (date, default hari ini WIB, paling lama 7 hari ke belakang, tidak boleh masa depan), `waktu`, `total` integer (Σ subtotal), `catatan`, `dicatat_oleh`, `dicatat_at`, `batal_at`, `batal_oleh`, `batal_alasan`.
**`barang_masuk_item`**: `barang_masuk_id`, `satuan_beli_id`, `qty numeric(10,3) > 0` (dalam satuan beli; beras/minyak boleh desimal), `harga` integer per satuan beli, `subtotal` generated. Isi bahan dihitung dari `satuan_beli_isi` saat dicatat dan ditulis ke `gerakan_stok` (snapshot — perubahan isi pack di master tidak mengubah riwayat).

**`stok_awal`**: `id`, `outlet_id`, `status` enum (`diajukan`, `disetujui`, `ditolak`), `dihitung_at` (waktu kasir mengirim), `diajukan_oleh`, `diputus_at`, `diputus_oleh`, `catatan`. Satu outlet paling banyak satu `diajukan` dan satu `disetujui` (indeks unik parsial). **`stok_awal_item`**: `stok_awal_id`, `bahan_id`, `qty_hitung numeric(14,4) >= 0`.

**Hak akses (RLS):** kasir hanya membaca baris outletnya sendiri; admin membaca semua; tidak ada insert/update/delete langsung dari klien — semua lewat fungsi `security definer` (`search_path = ''`, cek akses memakai `coalesce(...)` seperti 0009, pesan galat berbahasa Indonesia, errcode 22023/42501). Anon tidak punya hak apa pun; hak tabel diberikan eksplisit.

## 4. Pemotongan otomatis (di server)

- `catat_penjualan` diganti (`create or replace` di migrasi baru): pada cabang **bukan kiriman ulang**, setelah item tersimpan, tulis satu baris `jual` per bahan = −Σ(qty item × resep.qty) untuk bahan `mode = 'otomatis'`, `waktu` = waktu penjualan. Hasil fungsi tetap sama bentuknya (+ daftar bahan yang menjadi minus, untuk peringatan kasir).
- `void_penjualan` diganti: tulis baris `jual_batal` = kebalikan **persis** dari baris `jual` transaksi itu (dibaca dari `gerakan_stok`, bukan resep terkini). Berlaku juga untuk void admin di luar shift. Penjualan sebelum Tahap 3 terpasang tidak punya baris `jual`, jadi void-nya tidak mengubah stok.
- Stok **boleh minus**; penjualan tidak pernah ditolak karena stok.
- Bahan `catat`/`analisis` (plastik merah, tepung, minyak) tidak pernah dipotong otomatis; hanya bertambah dari barang masuk/stok awal (pemakaian lewat opname 3b).

## 5. Barang masuk (admin)

- Pilih outlet → tanggal → baris barang per satuan beli + jumlah.
- Harga terisi dari `harga_beli` outlet itu; boleh diubah per entri (tidak mengubah master). Satuan `harga_tetap = false` (beras, karung tepung A, minyak) wajib diisi harganya setiap kali.
- Simpan → `barang_masuk` + item + baris `masuk` per bahan (jumlah × isi), dalam satu transaksi database.
- **Batalkan** (admin, alasan wajib): tandai `batal_*` dan tulis baris `masuk_batal` kebalikan persis. Tidak ada hapus.

## 6. Stok awal (kasir → admin)

1. Selama outlet belum punya stok awal `disetujui`, kasir melihat **Isi stok awal**: semua bahan aktif. Ayam per potongan (sayap, paha bawah, dada, paha atas × Ori/Hot); bahan berpack satu-bahan diisi **pack + pcs lepas** (dikonversi ke satuan dasar); kg/liter diisi angka desimal. Kirim → `diajukan` dengan `dihitung_at = now()`.
2. Admin membuka, boleh mengubah angka, lalu **Setujui** atau **Tolak** (alasan). Ditolak → kasir bisa mengisi ulang.
3. Setujui → untuk tiap bahan tulis baris `awal` dengan `waktu = dihitung_at` dan `qty = qty_hitung − saldo(outlet, bahan, gerakan dengan waktu ≤ dihitung_at)`. Akibatnya stok pada saat dihitung = hitungan kasir, dan penjualan setelah itu tetap memotong. (Rumus yang sama dipakai opname 3b.)
4. Sebelum disetujui: layar stok outlet itu menampilkan "Belum ada stok awal"; peringatan menipis/minus tidak ditampilkan; pemotongan penjualan tetap dicatat.

## 7. Tampilan & peringatan

**Format angka stok:**
- Ayam per varian: pack utuh = min(potong bahan ÷ isi pack bahan itu) atas 4 potongan; sisanya potongan lepas, mis. "5 pack Ori + 3 sayap". Ambang = Σ potong varian ÷ 9 dibandingkan `satuan_beli.ambang`.
- Bahan dengan satu satuan beli satu-bahan: "3 pack + 40 pcs" (pakai satuan beli berisi terkecil); ambang = stok ÷ isi.
- kg/liter: angka desimal (maks 2 digit tampil), mis. "12,5 kg". Opname toleran pembulatan (0,0833 kg/porsi).
- Status: **Minus** (< 0), **Menipis** (ambang terisi dan ≤ ambang), **Aman**. Bahan tanpa ambang hanya bisa Aman/Minus.

**Admin:** menu baru **Stok** — pilih outlet; daftar bahan per kelompok dengan status; ketuk bahan → riwayat gerakan (waktu, jenis, jumlah, nomor transaksi/barang masuk, oleh). Halaman **Barang masuk** (daftar + tambah + batalkan). Halaman **Stok awal** (ajuan per outlet → setujui/tolak). Beranda admin: ringkasan per outlet "2 menipis, 1 minus" + ajuan stok awal yang menunggu.

**Kasir:** tab **Stok** di navigasi bawah (baca saja, outlet sendiri) + tombol Isi stok awal bila perlu. Layar jualan: pita peringatan bila ada bahan minus ("Stok minus: dada Ori — lapor admin"); diperbarui setelah setiap transaksi dari daftar minus yang dikembalikan `catat_penjualan`.

## 8. Koreksi Tahap 2 (tugas pertama)

Jumlah di keranjang menjadi kotak angka yang bisa diketik langsung (tetap ada + / −), keyboard angka di HP, nilai dibatasi 1–999 seperti sekarang; kosong/0 saat diketik tidak langsung menghapus baris (baris dihapus lewat tombol hapus/−).

## 9. Galat & kasus tepi

- Barang masuk ke outlet yang tidak ada / satuan nonaktif / jumlah ≤ 0 / harga negatif → ditolak dengan pesan jelas.
- Stok awal ganda: ajuan kedua saat masih `diajukan` ditolak; setelah `disetujui`, ajuan baru ditolak (koreksi lewat opname 3b).
- Kasir mengakses outlet lain atau akun nonaktif → 42501 (pola `coalesce`).
- Kiriman ulang penjualan tidak menulis gerakan dua kali; void dua kali tidak membalik dua kali.
- Bahan baru ditambahkan admin setelah stok awal → stoknya mulai dari 0 dari barang masuk.
- Pesan galat baru masuk allowlist `pesanKasir`/pesan admin dan dijaga tes yang membaca migrasi.

## 10. Pengujian

- DB (PGlite): pemotongan per resep termasuk nasi 0,1 kg & kulit + cup; kiriman ulang tidak menggandakan; void membalik persis walau resep diubah di antaranya; void admin setelah tutup; barang masuk memecah isi pack; batal barang masuk; stok awal dengan penjualan sebelum & sesudah `dihitung_at`; RLS kasir/admin/anon/nonaktif; stok minus diizinkan.
- Unit: format pack + potongan, status ambang, konversi pack + pcs ↔ satuan dasar, input jumlah keranjang.
- E2E server (`scripts/uji-stok.ts`, outlet & akun sementara, dibersihkan): jual → stok turun, void → kembali, barang masuk → naik, stok awal disetujui.
- Daftar uji owner di `docs/uji/`.
