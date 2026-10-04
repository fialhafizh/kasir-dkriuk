# PR owner — uji Tahap 3a (stok dasar)

Status: **belum dicoba**. Jalankan `npm run dev`, buka di Chrome. Centang `[x]` yang sudah, tulis catatan bila ada yang aneh.

## Jumlah keranjang (koreksi Tahap 2)
- [ ] Ketuk angka jumlah di keranjang → ketik 150 → Enter → total berubah sesuai
- [ ] Kosongkan kotaknya atau ketik 0 → angka kembali seperti semula (baris tidak hilang)

## Stok awal
- [ ] Login kasir → tab **Stok** → "Stok awal belum diisi" → **Isi stok awal**
- [ ] Ayam diisi per potongan; kemasan dll. "pack + pcs"; beras dalam kg (boleh koma) → **Kirim ke admin**
- [ ] Login admin → **Stok → Stok awal** → betulkan satu angka → **Setujui stok awal**
- [ ] Tab Stok kasir sekarang menampilkan tanda Aman/Menipis/Minus

## Potong otomatis
- [ ] Jual 1 Dada Ori + 1 Nasi → Stok: dada berkurang 1, beras berkurang 0,1 kg, kertas nasi berkurang 1
- [ ] Batalkan transaksi itu di Riwayat → stok kembali
- [ ] Admin → Stok → ketuk "Ayam Ori" → riwayat menampilkan Terjual & Batal jual beserta nomor transaksi

## Barang masuk
- [ ] Admin → Stok → **Barang masuk** → pilih outlet → tambah "Pack Ayam Ori" 5 → harga terisi otomatis → Simpan
- [ ] Stok Ayam Ori bertambah 5 pack
- [ ] Beras: harga harus diketik (tidak terisi otomatis)
- [ ] Batalkan barang masuk (isi alasan) → stok kembali

## Peringatan
- [ ] Jual ayam melebihi stok → di layar jualan muncul pita "Stok minus: …"; penjualan tetap bisa
- [ ] Beranda admin menampilkan "x menipis, y minus" per outlet

Catatan hasil uji:
