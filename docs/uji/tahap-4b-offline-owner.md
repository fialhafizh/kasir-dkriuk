# PR owner — uji Tahap 4b (batal, stok, transfer, opname tanpa internet; admin Perangkat)

Status: **belum dicoba**. Alamat: https://fialhafizh.github.io/kasir-dkriuk/

Siapkan: buka menu **Stok** sekali saat online di setiap HP/tablet kasir (supaya datanya tersimpan di perangkat).

## Batal transaksi offline
- [ ] Mode pesawat → jual 1 transaksi → **Riwayat** → isi alasan → **Batalkan** → tampil "Dibatalkan … (belum terkirim)"
- [ ] **Tutup toko**: transaksi yang dibatalkan tidak dihitung di "Cash seharusnya"
- [ ] Matikan mode pesawat → penanda **0 belum terkirim**; Riwayat menampilkan batal dengan nomor resmi

## Stok offline
- [ ] Mode pesawat → **Stok** tetap tampil dengan tulisan "Data dari perangkat (terakhir online …)"
- [ ] **Catat rusak** → tercatat; angka stok di layar langsung berkurang ("Angka perkiraan")
- [ ] **Kirim ke outlet lain** (mis. BL → TK) → muncul di "Menunggu diterima" bertanda belum terkirim; bisa **Ubah** / **Batalkan**
- [ ] Online lagi → di outlet tujuan, **Terima kiriman** (bisa offline juga): isi jumlah **salah** → setelah sinkron muncul di **Perlu perhatian**: "Ada perbedaan jumlah…" → isi ulang jumlah yang **benar** dari halaman Terima → diterima; yang salah tadi diabaikan dengan alasan
- [ ] **Opname** offline (Minggu) → "Opname tercatat…" → online → admin melihat & menyetujui opname; jam hitung = jam kasir menghitung

## Ganti akun
- [ ] Saat masih ada data belum terkirim, **Keluar** tetap ditolak. (Bila sesi terputus dan akun lain masuk di perangkat itu, layar login & kasir menampilkan "… data belum terkirim milik akun lain"; data itu baru terkirim saat akun pencatatnya masuk lagi.)

## Admin
- [ ] Menu **Perangkat**: daftar HP/tablet (kode, outlet, pengguna terakhir, jam sinkron terakhir); yang > 24 jam tidak sinkron bertanda kuning
- [ ] Bagian **Kejadian diabaikan** menampilkan data yang diabaikan kasir beserta alasannya
- [ ] Ringkasan Tutup toko menampilkan catatan bila ada: "Digabung dari beberapa perangkat", "… penjualan/pembatalan masuk setelah tutup toko"

Catatan hasil uji:
