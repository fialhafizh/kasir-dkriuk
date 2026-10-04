# PR owner — uji Tahap 2 (layar kasir)

Status: **belum dicoba** (menunggu akses printer OKAY 58B). Centang `[x]` yang sudah, tulis catatan bila ada yang aneh.

Persiapan: di laptop jalankan `npm run dev`, buka di **Chrome**. Nyalakan Bluetooth laptop.

## Tanpa printer (bisa dicoba sekarang)
- [ ] Login kasir → layar "Modal awal" muncul → isi modal → masuk layar jualan
- [ ] Tambah beberapa menu, ubah jumlah (+/−), tombol **Nasi Box**, lalu **Kosongkan** (harus minta konfirmasi)
- [ ] Bayar **cash** pakai tombol uang cepat → kembalian benar, nomor struk `KODE-YYMMDD-001`
- [ ] Bayar **QRIS** / GoFood → tanpa input uang, tertulis "Lunas"
- [ ] Uang kurang dari total → tombol Bayar tidak bisa ditekan
- [ ] **Riwayat** → batalkan satu transaksi (alasan wajib) → tertulis dibatalkan, total tidak dihitung
- [ ] **Tutup toko** → isi uang di laci → selisih Pas/Lebih/Kurang benar → setelah ditutup, kembali ke Jualan minta modal lagi
- [ ] Matikan Wi-Fi → banner "Internet terputus", Bayar terkunci → nyalakan lagi → pulih sendiri (≤20 detik) atau tombol **Coba sambung lagi**
- [ ] Login admin → pilih outlet → bisa jualan untuk outlet itu; ganti outlet → keranjang kosong
- [ ] Tampilan HP: Chrome → F12 → ikon HP (lebar 360) → bar total + Bayar di bawah tidak menutupi menu

## Dengan printer OKAY 58B
- [ ] Tombol **Sambungkan printer** → pilih printer → status siap
- [ ] Selesai bayar → struk **tercetak otomatis**, huruf rapi selebar kertas 58 mm
- [ ] Matikan printer → nyalakan → sambungkan ulang → **Cetak ulang** berhasil
- [ ] Riwayat → cetak ulang struk lama (ada tulisan CETAK ULANG / DIBATALKAN bila dibatalkan)

## Setelah aplikasi online (GitHub Pages, tahap berikutnya)
- [ ] Di HP/tablet Android: cetak lewat aplikasi **RawBT**
- [ ] Tampilan di tablet sungguhan (dua kolom) dan HP

## Pertanyaan yang belum dijawab
- Apakah ada outlet yang buka **lewat tengah malam**? Sekarang toko wajib ditutup sebelum jualan hari berikutnya (batas 00.00 WIB).

Catatan hasil uji:
