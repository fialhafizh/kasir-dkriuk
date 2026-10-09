# Tahap 6 — Notifikasi Telegram

Turunan grand design §8. Disetujui owner dalam percakapan 9 Okt 2026 (bot @kasirdkriuk_bot sudah dibuat owner).

## 1. Tujuan & ukuran berhasil

Owner mengikuti semua outlet dari satu grup Telegram tanpa membuka aplikasi: struk, tutup toko, ringkasan harian, peringatan, dan uang kas. Pesan tidak hilang walau internet/Telegram sedang gangguan, dan tidak terkirim dua kali untuk kejadian yang sama.

## 2. Keputusan owner (9 Okt 2026)

1. Satu grup Telegram mode **Topics**, dipisah **per jenis pesan**: 🧾 Struk · 🏪 Tutup toko & harian · ⚠️ Peringatan · 💰 Kas. Topik dibuat otomatis oleh bot.
2. Peringatan: batal transaksi; selisih kas (tutup toko) & selisih setoran; stok menipis/minus (sekali saat status berubah); kiriman ditolak karena beda jumlah; opname menunggu persetujuan; data diabaikan kasir.
3. Ringkasan harian semua outlet, default **22.00 WIB**, jam bisa diubah admin.
4. Topik Kas: setoran dicatat & diterima, kasbon, pengeluaran laci ≥ batas (default Rp100.000, bisa diubah).
5. Token bot hanya di Supabase secrets (dan `.env.local` owner), tidak pernah di kode/GitHub/chat.

## 3. Arsitektur

```
transaksi/shift/stok/kas (DB) ──trigger──► telegram_antrean (pesan siap kirim, kunci unik)
pg_cron tiap menit ──pg_net──► Edge Function telegram (mode kirim) ──► Bot API sendMessage(message_thread_id)
pg_cron tiap menit ──► _jadwalkan_ringkasan_harian() (sekali per tanggal setelah jam diatur)
Admin → Telegram ──► Edge Function telegram (mode hubungkan / uji, JWT admin)
```

- **Antrean** `telegram_antrean (id, kunci unique, topik, teks, dibuat_at, terkirim_at, percobaan, galat, kirim_lagi_at)`. `kunci` (mis. `struk:<penjualan_id>`) mencegah pesan ganda saat kiriman offline diulang. Trigger hanya menyusun teks & insert (`on conflict do nothing`) — tidak pernah menggagalkan transaksi (galat ditangkap).
- **Pengaturan** satu baris `telegram_pengaturan (chat_id, topik jsonb {struk,harian,peringatan,kas}, jam_harian, batas_pengeluaran, jenis_mati text[], harian_terakhir)`. Admin baca/ubah lewat fungsi; kasir tidak.
- **Edge Function `telegram`**:
  - `kirim` (dipanggil cron dengan header `x-kunci-cron`; kuncinya dibuat acak di Supabase Vault saat migrasi, tidak pernah di kode): satu pengirim pada satu waktu (giliran 90 detik), ambil ≤ 10 pesan (urut, `for update skip locked`, dipinjam 2 menit), kirim dengan jeda 3 detik (±20 pesan/menit per grup), berhenti setelah 45 detik; gagal → percobaan+1, coba lagi bertahap (1, 2, 5, 15, 60 menit), berhenti setelah 10 kali (tampil di Admin). `retry_after` (429) menjeda seluruh pengiriman. Topik yang dihapus di grup dilupakan (pesan ke General) sampai admin menekan Hubungkan ulang.
  - `hubungkan` (admin): baca `getUpdates` untuk menemukan grup tempat bot jadi admin, cek mode Topics, buat 4 topik (`createForumTopic`) bila belum ada, simpan chat_id & id topik.
  - `uji` (admin): kirim pesan uji ke tiap topik.
- Teks pesan disusun di SQL (fungsi `_tg_*` per jenis) agar mudah diuji di PGlite; format HTML Telegram, nilai di-escape.

## 4. Isi pesan

- **Struk**: outlet, nomor struk, jam (WIB), kasir, item × qty = subtotal, total, kanal/metode. Penjualan offline dikirim saat sampai di server dengan jam aslinya.
- **Tutup toko**: outlet, jam buka–tutup, kasir, penjualan per kanal, jumlah transaksi & batal, laci seharusnya vs dihitung, selisih, pengeluaran laci, setoran.
- **Ringkasan harian** (per tanggal WIB, semua outlet aktif): omzet per kanal per outlet + total, jumlah transaksi, 5 menu terlaris, stok menipis/minus, setoran belum diterima, shift masih buka.
- **Peringatan**: batal transaksi (siapa, alasan, nominal, setelah tutup?); selisih ≠ 0 saat tutup toko; selisih setoran saat diterima; stok berubah ke menipis/minus (menurut `stok_outlet`, dicek saat gerakan stok; status terakhir disimpan agar tidak berulang); kiriman ditolak beda jumlah; opname/stok awal menunggu persetujuan; kejadian diabaikan kasir.
- **Kas**: setoran dicatat (kasir) & diterima (owner); kasbon; pengeluaran laci ≥ batas.

Jenis yang dimatikan admin tidak masuk antrean.

## 5. Layar — Admin → Telegram

Status (terhubung ke grup apa, pesan terkirim terakhir, pesan gagal), tombol **Hubungkan grup** dan **Kirim pesan uji**, jam ringkasan harian, batas pengeluaran, sakelar per jenis pesan, daftar pesan gagal dengan tombol **Kirim ulang**.

## 6. Keamanan

Token `TELEGRAM_BOT_TOKEN` di Supabase secrets; kunci cron acak di Supabase Vault (dibaca pg_cron & Edge Function lewat fungsi khusus service_role). Antrean & pengaturan hanya service_role/fungsi admin. Pesan tidak memuat harga beli/upah karyawan. Laporan data ditolak dari kasir dibatasi 10 per jam. Pesan panjang dipotong di akhir baris (batas 4096). Transaksi/batal tunai yang sampai setelah tutup toko mengirim **koreksi selisih**. Penjualan setelah jam ringkasan harian tidak masuk ringkasan hari itu (tetap ada di struk & tutup toko).

## 7. Pengujian

DB (PGlite): tiap trigger menghasilkan teks yang benar; kunci mencegah ganda; jenis dimatikan tidak masuk; stok menipis hanya sekali; ringkasan harian sekali per tanggal & isinya; trigger gagal tidak menggagalkan transaksi. Unit: penjadwalan ulang & pemilihan pesan di Edge Function (fungsi murni). E2E: pesan uji terkirim ke grup sungguhan; transaksi uji → struk masuk antrean & terkirim.
