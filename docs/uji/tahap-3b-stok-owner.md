# PR owner — uji Tahap 3b (rusak, transfer, opname)

Status: **belum dicoba**. Jalankan `npm run dev`, buka di Chrome. Butuh stok awal yang sudah disetujui (Tahap 3a). Centang `[x]` yang sudah.

## Rusak/terbuang
- [ ] Kasir → Stok → **Catat rusak** → alasan "Gosong" → isi 2 sayap Ori → Catat → stok sayap Ori turun 2
- [ ] Alasan "Lainnya" tanpa catatan → ditolak dengan pesan
- [ ] Admin → Stok → **Rusak** → batalkan catatan tadi (isi alasan) → stok kembali

## Sisa di Tutup toko
- [ ] Tutup toko → muncul "Ada sisa yang tidak terjual?" → **Ada sisa** → isi 3 dada Ori + 2 porsi nasi → Catat sisa → Lanjut tutup toko
- [ ] Stok: dada Ori turun 3, beras turun 0,2 kg
- [ ] Buka shift baru, Tutup toko lagi → pertanyaan muncul lagi; pilih **Tidak ada sisa** → langsung ke hitung uang

## Transfer (butuh 2 akun kasir, mis. BL & TK, atau admin di dua tab)
- [ ] Kasir BL → **Kirim ke outlet lain** → tujuan Talang Kerangga → 1 pack Ayam Ori (isi per potongan) → Kirim
- [ ] Kasir TK → tab Stok menunjukkan **Terima kiriman (1)** → buka → isi angka berbeda → muncul "Ada perbedaan jumlah. Silakan hubungi outlet pengirim (Bukit Lama)"
- [ ] Isi angka yang sama → diterima; stok BL turun, TK naik
- [ ] Kirim lagi, lalu BL **Ubah** jumlahnya / **Batalkan** → TK tidak bisa menerima yang dibatalkan
- [ ] Admin → Stok → **Transfer** menampilkan semuanya

## Opname
- [ ] Hari Minggu (atau setelahnya bila belum opname minggu ini): tab Stok kasir menampilkan "Waktunya opname mingguan"
- [ ] Opname saat masih ada kiriman menunggu → ditolak "Selesaikan kiriman/penerimaan dulu"
- [ ] Isi semua bahan → Kirim → Admin → Stok → **Opname** → tabel hitungan / sistem / selisih, selisih besar merah ⚠
- [ ] Setujui → stok = hitungan
- [ ] Beranda admin: "opname menunggu persetujuan" / "kiriman belum diterima" muncul saat ada

Catatan hasil uji:
