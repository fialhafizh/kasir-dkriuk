# Tahap 5a — Kas harian: buku kas laci, pengeluaran, setoran, laporan harian

Turunan grand design `2026-10-04-kasir-dkriuk-design.md` §5 (kas harian, setoran) & §6 (pengeluaran). Disetujui owner per bagian dalam percakapan 9 Okt 2026. Tahap 5 dipecah: **5a** (dokumen ini) lalu **5b** (biaya tetap/sewa, gaji, laba-rugi, arus kas per kanal). Wajib baca "Catatan wajib" roadmap butir Tahap 5.

## 1. Tujuan & ukuran berhasil

Owner bisa melihat **uang di laci tiap outlet setiap saat**, mencatat **setoran** yang diterimanya, dan membaca **catatan harian per outlet** dari semua kanal beserta pengeluarannya. Kasir mencatat pengeluaran kecil & setoran (juga tanpa internet), dan Tutup toko menghitung uang laci dengan benar walau uang menumpuk beberapa hari.

Berhasil bila (contoh owner): laci Bukit Lama 100.000 → jual cash tgl 1–3 (800.000, 600.000, 1.200.000), pengeluaran kecil 100.000 → aplikasi menunjukkan **2.600.000**; kasir mencatat setoran 2.500.000 → laci **100.000**; owner menekan Terima → setoran berstatus diterima; Kas harian tgl 1–3 menampilkan penjualan per kanal, pengeluaran, setoran, saldo laci awal/akhir tiap hari.

## 2. Keputusan owner (9 Okt 2026)

1. Tahap 5 dipecah 5a (kas harian) lalu 5b (biaya tetap, gaji, laba-rugi, arus kas).
2. **Uang laci menumpuk lintas hari**; kasir menyetor ke owner kira-kira tiap 3 hari dan menyisakan uang kembalian (mis. 100.000). QRIS & ojol tidak pernah masuk laci.
3. **Buka toko tidak lagi mengisi modal**: modal = uang laci saat itu (otomatis). Pertama kali per outlet, kasir mengisi **uang laci awal** sekali.
4. **Setoran dicatat kasir** (laci langsung berkurang), **owner mengonfirmasi terima**; bila jumlah yang diterima beda, owner mengisi jumlah sebenarnya → **selisih setoran** tercatat (laci tidak berubah lagi).
5. **Pengeluaran kecil kasir langsung tercatat** (gas, token listrik, air, lain-lain dengan keterangan wajib), admin bisa membatalkan dengan alasan.
6. **Setoran & pengeluaran bisa dicatat kapan saja**, termasuk saat toko tutup (buku kas laci per outlet yang terus berjalan).
7. Admin: menu **Kas harian**, **Setoran**, **Pengeluaran** (laci + admin + belanja bahan otomatis; kategori bisa ditambah), **Penjualan** (riwayat & batal termasuk shift yang sudah ditutup).
8. Belanja bahan yang terlambat (barang sudah termasuk opname) dicatat sebagai pengeluaran "Belanja bahan" tanpa efek stok. Batal barang masuk tercatat sebagai koreksi pada **tanggal pembatalan**.
9. Outlet nonaktif tidak bisa buka toko / jualan.

## 3. Buku kas laci

**Gerakan laci** (bukan tabel baru; dihitung dari sumbernya, seperti view):

| Sumber | Jumlah | Jam |
|---|---|---|
| Penjualan cash (bukan koreksi) | + total | `penjualan.waktu` |
| Batal penjualan cash (bukan koreksi) | − total | `penjualan.void_at` |
| Pengeluaran sumber laci (tidak dibatalkan) | − jumlah | `pengeluaran.waktu` |
| Setoran (tidak dibatalkan) | − jumlah | `setoran.waktu` |

**Titik hitung** (jangkar): `laci_awal` (sekali per outlet) dan setiap **tutup toko** (`shift.ditutup_at`, `shift.uang_fisik`; bukan `tutup_tertunda`). Hitungan kedua dari perangkat lain di shift gabungan (`shift_perangkat`) hanya catatan, bukan jangkar.

**Saldo laci pada jam T** = jangkar terakhir ≤ T + jumlah gerakan dengan jam di (jangkar, T]. Gerakan yang jamnya ≤ jangkar sudah termasuk uang yang dihitung.

**Uang seharusnya saat tutup shift S** = saldo pada `S.ditutup_at` dengan jangkar terakhir **sebelum** S (bukan S sendiri). **Selisih S** = `uang_fisik − uang seharusnya`. Dihitung saat dibaca, bukan disimpan: penjualan/batal offline yang jamnya sebelum tutup tetapi tiba sesudahnya otomatis memperbarui selisih shift itu (dan shift ditandai seperti Tahap 4), tanpa menggeser saldo sesudahnya.

**Koreksi catatan** (bukan uang keluar/masuk laci): batal pengeluaran & batal setoran oleh admin, serta **batal penjualan oleh admin untuk shift yang sudah ditutup** (`penjualan.void_koreksi = true`) — baris itu dianggap tidak pernah ada di laci (penjualan & batalnya sama-sama tidak dihitung), sehingga selisih shift lama terkoreksi dan saldo sekarang tidak bergeser. Batal kasir (termasuk batal offline berjam sebelum tutup) = uang dikembalikan → gerakan biasa.

**Modal shift** (`shift.modal`) = saldo laci pada jam buka (dihitung server); hanya untuk tampilan ringkasan.

## 4. Data & fungsi server (migrasi 0022+)

- `laci_awal (outlet_id pk, jumlah, waktu, oleh, dicatat_at)`.
- `kategori_pengeluaran (id, nama unik, untuk_kasir bool, aktif, urutan)`; seed: Gas, Token listrik, Air, Lain-lain (kasir; Lain-lain wajib keterangan) dan Belanja bahan, Perbaikan & peralatan, Lain-lain admin (admin). Admin bisa menambah/menonaktifkan.
- `pengeluaran (id uuid dari perangkat, outlet_id, sumber 'laci'|'luar', kategori_id, jumlah 1..100.000.000, waktu, keterangan ≤200, dicatat_oleh, perangkat_id, dicatat_at, batal_at/oleh/alasan)`. Kasir hanya `laci` + kategori `untuk_kasir`; admin keduanya. Admin `luar` memakai tanggal (jam 12.00 WIB tanggal itu).
- `setoran (id uuid dari perangkat, outlet_id, jumlah, waktu, catatan, dicatat_oleh, perangkat_id, dicatat_at, diterima_at/oleh, jumlah_diterima, catatan_terima, batal_at/oleh/alasan)`.
- `penjualan.void_koreksi boolean default false`.
- Fungsi (idempoten per id, jam dari `_waktu_perangkat`): `catat_pengeluaran_offline(p)`, `catat_setoran_offline(p)`, `batal_pengeluaran(id, alasan)` (admin), `terima_setoran(id, jumlah_diterima, catatan)` (admin), `batal_setoran(id, alasan)` (admin, hanya yang belum diterima), `catat_pengeluaran_admin(p)`, kategori (admin). `buka_shift_offline` menerima `laci_awal` (diisi bila outlet belum punya) dan menyimpan `modal` = saldo laci pada jam buka. `void_penjualan` (admin, shift tertutup) menandai `void_koreksi`.
- `_saldo_laci(outlet, jam, kecuali_shift)`; `saldo_laci(outlet)` (kasir outlet sendiri/admin) → `{ saldo, jangkar_at }`; `ringkasan_shift` menambah `pengeluaran_laci`, `setoran`, dan menghitung `cash_seharusnya`/`selisih` dengan rumus §3.
- `kas_harian(outlet, dari, sampai)` (admin) → per tanggal WIB: penjualan per kanal (jumlah & total), jumlah batal, pengeluaran laci per kategori, pengeluaran luar, belanja bahan (barang masuk + koreksi batal pada tanggal batal), setoran, saldo laci awal & akhir hari, selisih hitung (shift yang ditutup hari itu).
- `buka_shift_offline`/`catat_penjualan_offline` menolak outlet nonaktif ("Outlet ini nonaktif").

## 5. Layar

**Kasir** (semua bisa offline lewat antrean Tahap 4; jenis kejadian baru `pengeluaran`, `setoran`):
- *Buka toko*: "Uang di laci sekarang: RpX" (saldo; bila belum pernah, isian uang laci awal) → Buka.
- *Tutup toko*: "Uang seharusnya di laci" = saldo (sudah termasuk pengeluaran & setoran); ringkasan menampilkan pengeluaran & setoran shift.
- *Pengeluaran* (menu baru): kategori, nominal, keterangan; daftar pengeluaran hari ini (batal dari admin).
- *Setoran* (menu baru): saldo laci, jumlah disetor, catatan; daftar setoran terakhir & status (belum diterima / diterima / selisih).
- Penanda saldo laci di layar jualan tidak ditampilkan (hindari kasir menghitung untuk menutupi selisih) — hanya di Buka/Tutup toko & Setoran.

**Admin:** Kas harian (outlet/semua, tanggal/rentang), Setoran (belum diterima → Terima/Batal; riwayat), Pengeluaran (daftar semua sumber + tambah pengeluaran admin + kategori + batal), Penjualan (riwayat per outlet & tanggal, cari nomor/kode struk, batal).

## 6. Di luar cakupan (5b / tahap lain)

Biaya tetap & sewa, gaji & kehadiran, laba-rugi, arus kas per kanal (5b); rekonsiliasi ojol & export (Tahap 7); Telegram (Tahap 6); saldo rekening bank.

## 7. Pengujian

- DB (PGlite): saldo laci contoh owner (100.000 → 2.600.000 → setor → 100.000); jangkar tutup; penjualan offline berjam sebelum tutup yang tiba sesudahnya memperbarui selisih shift itu tanpa menggeser saldo; koreksi admin (batal pengeluaran/setoran, void shift tertutup) tidak menggeser saldo sesudah jangkar; idempoten per id; hak akses (kasir outlet sendiri, kategori kasir saja, admin semua); terima setoran dengan selisih; kas harian per tanggal WIB termasuk koreksi barang masuk pada tanggal batal; outlet nonaktif ditolak.
- Unit: proyeksi saldo laci di perangkat (salinan + antrean termasuk tutup sebagai jangkar), pembentuk kejadian, layar.
- E2E server (outlet & akun sementara) dan daftar uji owner.
