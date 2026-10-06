# PR owner — uji Tahap 5a (kas harian)

Status: **belum dicoba**.

## Kasir
- [ ] **Buka toko pertama kali** (per outlet): diminta "Uang di laci sekarang" → isi (mis. 100.000) → Mulai jualan
- [ ] Jual beberapa transaksi cash & QRIS → **Tutup toko**: "Cash seharusnya di laci" = uang laci awal + jual cash (QRIS tidak masuk laci) → hitung uang → tutup
- [ ] **Buka toko besok**: tidak perlu mengetik modal; tampil "Uang di laci sekarang Rp…" = hitungan tutup kemarin
- [ ] Menu **Kas** → Pengeluaran (mis. Gas 25.000) → tercatat; Lain-lain wajib keterangan
- [ ] Menu **Kas** → Setoran: tampil uang di laci; isi jumlah (sisakan uang kembalian) → "Ya, uang sudah diserahkan" → sisa di laci benar
- [ ] Semua di atas juga bisa dalam **mode pesawat** (terkirim saat online)
- [ ] Ringkasan Tutup toko menampilkan baris pengeluaran & setoran selama shift

## Admin
- [ ] **Setoran**: setoran kasir tampil "Belum diterima" → Terima (jumlah sama) → pindah ke riwayat; coba satu dengan jumlah beda + catatan → tampil selisih
- [ ] **Pengeluaran**: daftar laci + belanja bahan (dari Barang masuk); catat pengeluaran di luar laci (mis. perbaikan); tambah kategori baru & jadikan "Dipakai kasir"; batalkan pengeluaran yang salah → laci & selisih shift terkoreksi
- [ ] **Kas harian**: per outlet & semua outlet; penjualan per kanal, pengeluaran, setoran, uang laci awal → akhir, selisih per hari
- [ ] **Penjualan**: cari transaksi dengan kode struk; batalkan transaksi dari hari kemarin (koreksi) → Kas harian hari itu & selisih shift-nya berubah

Catatan hasil uji:
