# PR owner — uji Tahap 6 (notifikasi Telegram)

Status: **belum dicoba**.

Grup: **Backup Dkriuk** (Topics aktif, bot @kasirdkriuk_bot admin dengan izin Kelola Topik).

## Admin → Telegram
- [ ] Status "Terhubung ke Backup Dkriuk"; di grup ada 4 topik: 🧾 Struk · 🏪 Tutup toko & harian · ⚠️ Peringatan · 💰 Kas
- [ ] **Kirim pesan uji** → satu pesan masuk di tiap topik
- [ ] Ubah jam ringkasan harian (mis. 5 menit dari sekarang), simpan → ringkasan masuk topik 🏪 pada jam itu (sekali sehari), lalu kembalikan ke 22:00
- [ ] Matikan "Struk setiap transaksi", simpan → transaksi berikutnya tidak masuk topik 🧾; nyalakan lagi

## Dari HP kasir (pesan masuk ±1 menit setelah data sampai di server)
- [ ] Jualan → struk di 🧾 (item, total, cara bayar)
- [ ] Jualan saat mode pesawat → setelah online, struk masuk dengan keterangan "Dicatat offline"
- [ ] Batal transaksi → ⚠️ (alasan, siapa)
- [ ] Tutup toko → ringkasan di 🏪; bila uang laci beda → ⚠️ Selisih kas
- [ ] Setoran → 💰; konfirmasi terima di Admin → Setoran → 💰, bila jumlah beda → ⚠️ Selisih setoran
- [ ] Kasbon → 💰; pengeluaran laci ≥ Rp100.000 → 💰 (di bawah itu tidak)
- [ ] Stok jadi menipis/minus → ⚠️ sekali (tidak berulang tiap transaksi)
- [ ] Ajukan opname / stok awal → ⚠️ menunggu persetujuan
- [ ] Terima kiriman dengan jumlah beda (ditolak) → ⚠️ Data kasir ditolak server

Catatan hasil uji:
