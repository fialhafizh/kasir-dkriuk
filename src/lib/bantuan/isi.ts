// Isi panduan (Tahap 8) — satu sumber untuk halaman Bantuan, petunjuk "?", dan infografis static/panduan.html.
// Jangan memuat harga, gaji, nama karyawan, atau kunci apa pun.

export type Peran = 'umum' | 'kasir' | 'admin' | 'pemilik';

export interface Topik {
	id: string;
	judul: string;
	ikon: string;
	/** di mana menemukannya di aplikasi */
	menu?: string;
	ringkas: string;
	langkah?: string[];
	catatan?: string[];
	awas?: string[];
}

export interface Bagian {
	id: string;
	judul: string;
	peran: Peran;
	ikon: string;
	pengantar: string;
	topik: Topik[];
}

export const ALUR_HARIAN = [
	{ ikon: '🔓', judul: 'Buka toko', isi: 'Kasir membuka toko; uang laci awal tampil otomatis.' },
	{ ikon: '🍗', judul: 'Jualan', isi: 'Pilih menu, cara bayar, struk tercetak. Tetap jalan tanpa internet.' },
	{ ikon: '🗑️', judul: 'Sisa & rusak', isi: 'Catat yang terbuang beserta alasannya.' },
	{ ikon: '💸', judul: 'Kas', isi: 'Pengeluaran kecil, kasbon karyawan, setoran ke pemilik.' },
	{ ikon: '🔒', judul: 'Tutup toko', isi: 'Hitung uang laci, isi sisa, selisih langsung terlihat.' },
	{ ikon: '📨', judul: 'Telegram', isi: 'Struk, tutup toko, peringatan, kas, ringkasan harian ke grup.' },
	{ ikon: '📊', judul: 'Dasbor & analisis', isi: 'Pemilik memantau omzet, stok, untung per menu, belanja.' }
] as const;

export const BAGIAN: Bagian[] = [
	{
		id: 'umum',
		judul: 'Mengenal aplikasi',
		peran: 'umum',
		ikon: '🏠',
		pengantar: 'Kasir D\'Kriuk adalah aplikasi kasir, stok, dan keuangan untuk 3 outlet: Bukit Lama, Talang Kerangga (D\'Kriuk), dan Kertapati (D\'Krizzpy).',
		topik: [
			{
				id: 'tentang',
				judul: 'Apa saja yang bisa dilakukan',
				ikon: '✨',
				ringkas: 'Jualan & struk, stok otomatis dari resep, kas laci & setoran, gaji & kasbon, laba-rugi, dasbor yang bisa dirakit, analisis kebocoran, rencana belanja, laporan Telegram, ekspor Excel.',
				catatan: [
					'Dibuka lewat peramban di HP/tablet/laptop: fialhafizh.github.io/kasir-dkriuk — bisa dipasang ke layar utama seperti aplikasi.',
					'Ada dua peran: **kasir** (satu outlet, pekerjaan harian toko) dan **admin/pemilik** (semua outlet, laporan, pengaturan).',
					'Pekerjaan kasir tetap jalan **tanpa internet**; data terkirim otomatis begitu online.',
					'Data disimpan di server Supabase; kode aplikasi publik tetapi data & kunci rahasia tidak.'
				]
			},
			{
				id: 'peta-menu',
				judul: 'Peta menu',
				ikon: '🗺️',
				ringkas: 'Kasir: Jualan · Riwayat · Stok · Kas · Tutup toko · Bantuan. Admin: Dasbor · Kas · Setoran · Pengeluaran · Penjualan · Ojol · Laba-rugi · Analisis · Gaji · Biaya tetap · Belanja · Stok · Bahan · Menu · Harga Beli · Akun · Perangkat · Telegram · Bantuan.'
			},
			{
				id: 'istilah',
				judul: 'Istilah penting',
				ikon: '📖',
				ringkas: 'Kata-kata yang sering muncul di aplikasi.',
				catatan: [
					'**Uang laci**: uang tunai di laci, menumpuk lintas hari sampai disetor ke pemilik.',
					'**Selisih**: uang yang dihitung saat tutup toko dikurangi uang yang seharusnya ada.',
					'**Setoran**: uang yang diambil dari laci untuk pemilik; pemilik menekan Terima.',
					'**Kasbon**: pinjaman karyawan; otomatis dipotong saat gajian.',
					'**Opname**: menghitung stok fisik (mingguan); selisihnya disebut **susut**.',
					'**Pack**: satuan beli (mis. 1 pack ayam Ori = 3 dada, 2 paha atas, 2 paha bawah, 2 sayap).',
					'**Perkiraan**: angka analisis (untung per menu, susut, proyeksi). Laba riil ada di Laba-rugi.'
				]
			}
		]
	},
	{
		id: 'kasir',
		judul: 'Panduan kasir',
		peran: 'kasir',
		ikon: '🧑‍🍳',
		pengantar: 'Pekerjaan harian di toko. Semua langkah di bagian ini bisa dilakukan tanpa internet.',
		topik: [
			{
				id: 'masuk',
				judul: 'Masuk & pasang di HP',
				ikon: '📲',
				menu: 'Halaman masuk',
				ringkas: 'Masuk dengan nama pengguna & password dari pemilik, lalu pasang ke layar utama.',
				langkah: [
					'Buka alamat aplikasi di Chrome.',
					'Isi nama pengguna & password, tekan **Masuk**.',
					'Menu Chrome ⋮ → **Tambahkan ke layar utama** / **Instal aplikasi**.',
					'Selanjutnya buka dari ikon di layar utama, juga saat tidak ada internet.'
				],
				awas: ['Jangan menekan **Keluar** selama masih ada data yang belum terkirim (aplikasi akan menolak).', 'Jangan memberi tahu password ke orang lain.']
			},
			{
				id: 'buka-toko',
				judul: 'Buka toko',
				ikon: '🔓',
				menu: 'Jualan',
				ringkas: 'Sebelum jualan pertama hari itu, buka toko. Uang laci tampil otomatis.',
				langkah: [
					'Buka menu **Jualan**, tekan **Buka toko**.',
					'Pertama kali di outlet ini: isi **uang laci awal** (uang yang ada di laci).',
					'Selanjutnya cukup periksa uang laci yang tampil, tekan **Buka**.'
				],
				catatan: ['Toko kemarin harus ditutup dulu sebelum jualan hari ini.']
			},
			{
				id: 'jualan',
				judul: 'Jualan & struk',
				ikon: '🍗',
				menu: 'Jualan',
				ringkas: 'Pilih menu, jumlah, cara bayar; kembalian dihitung otomatis dan struk tercetak.',
				langkah: [
					'Ketuk menu untuk menambah ke keranjang; jumlah bisa diketik (mis. 150 nasi box).',
					'Pilih cara bayar: **Tunai**, **QRIS**, **GoFood**, **GrabFood**, atau **ShopeeFood** (ojol dicatat dengan harga toko).',
					'Tunai: isi uang diterima → kembalian tampil.',
					'Tekan **Bayar**. Struk tercetak bila printer Bluetooth tersambung (cadangan: aplikasi RawBT).'
				],
				catatan: ['Setiap struk punya **kode struk** 6 huruf/angka untuk dicari.', 'Saat offline nomor struk sementara berawalan S (mis. S3-012); nomor resmi menyusul.']
			},
			{
				id: 'offline',
				judul: 'Internet putus (offline)',
				ikon: '📴',
				menu: 'Penanda di atas layar',
				ringkas: 'Tetap jualan seperti biasa. Data tersimpan di HP dan terkirim otomatis saat online.',
				catatan: [
					'Penanda **Offline** dan **N belum terkirim** tampil di atas. Tekan **Sinkron sekarang** bila sudah online.',
					'Angka stok di HP saat offline adalah **perkiraan**.',
					'Bila server menolak suatu data, data itu masuk **Perlu perhatian**.'
				],
				awas: ['Jangan hapus data peramban / jangan logout selama masih ada data belum terkirim.']
			},
			{
				id: 'perlu-perhatian',
				judul: 'Perlu perhatian',
				ikon: '⚠️',
				menu: 'Penanda "Perlu perhatian"',
				ringkas: 'Data yang ditolak server beserta alasannya. Coba lagi atau abaikan dengan alasan.',
				langkah: ['Buka **Perlu perhatian**.', 'Baca alasannya (mis. "Ada perbedaan jumlah" saat terima kiriman).', 'Perbaiki lalu **Coba lagi**, atau **Abaikan** dengan alasan (dilaporkan ke pemilik).']
			},
			{
				id: 'batal',
				judul: 'Batal transaksi',
				ikon: '↩️',
				menu: 'Riwayat',
				ringkas: 'Transaksi yang salah dibatalkan dari Riwayat; stok kembali otomatis.',
				langkah: ['Buka **Riwayat**, cari transaksinya.', 'Tekan **Batal**, isi alasan.'],
				catatan: ['Pembatalan dilaporkan ke grup Telegram (⚠️ Peringatan).', 'Setelah toko ditutup, pembatalan hanya oleh admin.']
			},
			{
				id: 'stok-kasir',
				judul: 'Stok: sisa, kiriman, opname',
				ikon: '📦',
				menu: 'Stok',
				ringkas: 'Stok berkurang otomatis dari jualan. Kasir mencatat sisa/rusak, kirim & terima barang, opname, dan stok awal.',
				langkah: [
					'**Rusak/sisa**: pilih bahan, jumlah, alasan (sisa tidak laku, dimakan karyawan, gosong, basi, jatuh, lainnya).',
					'**Kirim ke outlet lain**: pilih outlet & jumlah. Bisa diubah/dibatalkan selama belum diterima.',
					'**Terima kiriman**: ketik jumlah yang benar-benar datang (tanpa melihat angka kiriman). Beda jumlah → ditolak, hubungi pengirim.',
					'**Opname mingguan**: hitung semua stok fisik, kirim; admin menyetujui.',
					'**Stok awal**: dihitung sekali saat mulai memakai aplikasi; admin menyetujui.'
				],
				catatan: ['Tanda **Menipis** (kuning) & **Minus** (merah) ikut dilaporkan ke Telegram.']
			},
			{
				id: 'kas-kasir',
				judul: 'Kas: pengeluaran, kasbon, setoran',
				ikon: '💸',
				menu: 'Kas',
				ringkas: 'Uang keluar dari laci dicatat di sini dan langsung mengurangi uang laci.',
				langkah: [
					'**Pengeluaran**: pilih kategori (gas, token listrik, air, lain-lain…), isi nominal & keterangan bila diminta.',
					'**Kasbon karyawan**: pilih nama karyawan & nominal. Otomatis dipotong saat gajian.',
					'**Setoran**: isi uang yang diserahkan ke pemilik (sisakan uang kembalian di laci). Pemilik menekan Terima.'
				],
				catatan: ['Bisa dicatat kapan saja, juga saat toko tutup dan tanpa internet.']
			},
			{
				id: 'tutup-toko',
				judul: 'Tutup toko',
				ikon: '🔒',
				menu: 'Tutup toko',
				ringkas: 'Di akhir hari: isi sisa yang tidak terjual, hitung uang laci, lihat selisih.',
				langkah: [
					'Buka **Tutup toko**.',
					'Jawab "Ada sisa yang tidak terjual?" (nasi diisi porsi).',
					'Hitung uang di laci, ketik jumlahnya.',
					'Periksa ringkasan (penjualan per kanal, uang seharusnya, selisih), tekan **Tutup toko**.'
				],
				catatan: ['Ringkasan tutup toko & selisih otomatis terkirim ke Telegram.']
			}
		]
	},
	{
		id: 'admin',
		judul: 'Panduan admin & pemilik',
		peran: 'admin',
		ikon: '👑',
		pengantar: 'Semua menu admin butuh internet. Pilih outlet & periode di atas halaman bila tersedia.',
		topik: [
			{
				id: 'dasbor',
				judul: 'Dasbor',
				ikon: '📊',
				menu: 'Admin → Dasbor',
				ringkas: 'Angka & grafik yang bisa dirakit sendiri seperti Kibana. Diperbarui ±1 menit.',
				langkah: [
					'Pilih dasbor (mis. **Ringkasan**), outlet, dan periode (hari ini, 7 hari, bulan ini, pilih tanggal…).',
					'**Ubah dasbor** → seret panel lewat ⠿, tarik sudut untuk ukuran (di HP: ↑ ↓, lebar, tinggi) → **Simpan**.',
					'**+ Tambah panel**: pilih tampilan (angka, batang, garis, lingkaran, tabel, peta panas) → sumber data → ukuran → dikelompokkan per → saringan → pratinjau → **Pakai panel ini**.',
					'Panel khusus: status stok, siklus stok (berapa lama sekali habis, perkiraan habis), riwayat kejadian, uang di laci.',
					'**Kelola dasbor**: buat baru/salin, ganti nama, jadikan utama, hapus, kembalikan bawaan.'
				],
				catatan: ['Tombol **Tabel** di panel menampilkan angkanya; tombol **Excel** mengunduh datanya.']
			},
			{
				id: 'analisis',
				judul: 'Analisis kebocoran',
				ikon: '🔎',
				menu: 'Admin → Analisis',
				ringkas: 'Perkiraan untuk mencari kebocoran: untung per menu, susut & terbuang, minyak & tepung, proyeksi akhir bulan.',
				catatan: [
					'Modal bahan = rata-rata harga barang masuk di periode itu (bila tidak ada: Harga Beli).',
					'Pack ayam dibagi ke tiap potongan sebanding harga jual.',
					'Menu di bawah batas untung (awal 30%) ditandai **Untung tipis**.',
					'Laba riil tetap di **Laba-rugi**.'
				]
			},
			{
				id: 'belanja',
				judul: 'Rencana belanja',
				ikon: '🛒',
				menu: 'Admin → Belanja',
				ringkas: 'Saran beli tiap outlet untuk N hari dari tren 7 hari terakhir dikurangi stok; siap dibagikan.',
				langkah: [
					'Isi jumlah hari (awal 7), periksa saran tiap outlet.',
					'Ubah angka bila hitungan kasir berbeda (kosongkan untuk kembali ke saran).',
					'**Salin untuk WA** lalu tempel di grup pemesanan, atau **Kirim ke Telegram** agar bisa disalin dari HP.',
					'**Excel** / **Cetak** untuk arsip.'
				],
				catatan: ['Tepung, minyak & plastik merah dihitung dari rata-rata pembelian 4 minggu.']
			},
			{
				id: 'ojol',
				judul: 'Laporan ojol',
				ikon: '🛵',
				menu: 'Admin → Ojol',
				ringkas: 'Jumlah pesanan & total harga toko per aplikasi untuk dicocokkan dengan pencairan.'
			},
			{
				id: 'keuangan',
				judul: 'Laba-rugi, kas harian, setoran, pengeluaran',
				ikon: '💰',
				menu: 'Admin → Laba-rugi / Kas / Setoran / Pengeluaran / Penjualan',
				ringkas: 'Laba riil = omzet − belanja bahan − gaji − sewa − pengeluaran lain.',
				langkah: [
					'**Setoran**: tekan **Terima** saat uang sampai; bila jumlahnya beda, isi jumlah sebenarnya + catatan.',
					'**Pengeluaran**: catat pengeluaran laci/luar laci, belanja bahan di luar Barang masuk; batalkan yang salah.',
					'**Penjualan**: cari transaksi per tanggal, batalkan yang dobel (termasuk shift yang sudah ditutup).',
					'**Kas harian**: uang laci awal → akhir, selisih per hari.'
				]
			},
			{
				id: 'gaji',
				judul: 'Gaji & kasbon',
				ikon: '👥',
				menu: 'Admin → Gaji',
				ringkas: 'Gaji = hari masuk × upah harian + penyesuaian − kasbon.',
				langkah: [
					'Tambah karyawan per outlet (nama, upah harian).',
					'Centang **kehadiran** per hari.',
					'Kasbon dari kasir (menu Kas) atau admin masuk otomatis; lihat **Rincian kasbon**.',
					'**Gajian**: potongan terisi seluruh sisa kasbon (boleh diubah/dicicil), pilih dari laci/owner, **Bayar**. Bulan itu terkunci.',
					'**Ringkasan gaji**: salin ke WA / kirim Telegram / Excel.'
				]
			},
			{
				id: 'stok-admin',
				judul: 'Stok & barang masuk',
				ikon: '🏬',
				menu: 'Admin → Stok',
				ringkas: 'Catat barang masuk (otomatis jadi belanja bahan), setujui stok awal & opname, pantau transfer.',
				catatan: ['Barang yang datang sebelum stok dihitung jangan dicatat lagi.', 'Selama opname menunggu persetujuan, barang masuk/rusak dari sebelum jam hitung tertahan.']
			},
			{
				id: 'master',
				judul: 'Data master',
				ikon: '🧾',
				menu: 'Admin → Bahan / Menu / Harga Beli / Biaya tetap',
				ringkas: 'Bahan & isi pack, ambang menipis, menu & resep, harga jual per outlet, harga beli acuan, sewa per tahun.'
			},
			{
				id: 'akun',
				judul: 'Akun & perangkat',
				ikon: '🔑',
				menu: 'Admin → Akun / Perangkat',
				ringkas: 'Buat akun kasir per outlet, reset password, nonaktifkan. Pantau HP kasir yang lama tidak sinkron.'
			},
			{
				id: 'telegram',
				judul: 'Telegram',
				ikon: '📨',
				menu: 'Admin → Telegram',
				ringkas: 'Grup bertopik: 🧾 Struk · 🏪 Tutup toko & harian · ⚠️ Peringatan · 💰 Kas.',
				langkah: ['**Hubungkan grup** (sekali).', '**Kirim pesan uji** untuk memeriksa.', 'Atur jam ringkasan harian (awal 22.00), batas pengeluaran yang dilaporkan, nyalakan/matikan jenis pesan.'],
				catatan: ['Pesan gagal tampil di halaman ini dan bisa dikirim ulang.']
			},
			{
				id: 'ekspor',
				judul: 'Excel & cetak',
				ikon: '📤',
				ringkas: 'Tombol **Excel** di panel dasbor, Analisis, Belanja, Gaji, Ojol, Laba-rugi, Kas, Setoran, Pengeluaran, Penjualan. **Cetak** untuk simpan PDF.'
			}
		]
	},
	{
		id: 'pemilik',
		judul: 'Operasional pemilik',
		peran: 'pemilik',
		ikon: '🗓️',
		pengantar: 'Persiapan sebelum dipakai dan kebiasaan rutin agar angka selalu benar.',
		topik: [
			{
				id: 'persiapan',
				judul: 'Persiapan data awal',
				ikon: '🚀',
				ringkas: 'Sekali di awal, sebelum outlet memakai aplikasi.',
				langkah: [
					'Isi **Harga Beli** acuan tiap outlet.',
					'Periksa **harga jual** & **resep** menu.',
					'Buat akun kasir tiap outlet.',
					'Kasir mengisi **stok awal**; admin menyetujui.',
					'Kasir mengisi **uang laci awal** saat buka toko pertama.',
					'Isi **karyawan** (upah harian) dan **sewa** (Biaya tetap).',
					'Hubungkan **Telegram** & kirim pesan uji.'
				]
			},
			{
				id: 'rutinitas',
				judul: 'Rutinitas',
				ikon: '🔁',
				ringkas: 'Harian, mingguan, bulanan.',
				catatan: [
					'**Harian**: lihat ringkasan harian di Telegram (22.00), terima setoran yang masuk, cek peringatan.',
					'**Mingguan**: opname, setujui hasilnya; buka Belanja untuk pesanan ke stokis.',
					'**Bulanan**: centang kehadiran, gajian, lihat Laba-rugi & Analisis, unduh Excel untuk arsip.'
				]
			},
			{
				id: 'keamanan',
				judul: 'Keamanan & cadangan data',
				ikon: '🛡️',
				ringkas: 'Kasir hanya melihat outletnya sendiri; harga beli, gaji, dan laporan hanya admin.',
				catatan: ['Ganti/reset password kasir bila HP hilang (Admin → Akun).', 'Cadangan data server dibuat berkala oleh pembuat aplikasi.', 'Token bot & kunci server tidak pernah ada di aplikasi yang terpasang.']
			},
			{
				id: 'faq',
				judul: 'Masalah umum',
				ikon: '❓',
				ringkas: 'Jawaban cepat untuk hal yang sering terjadi.',
				catatan: [
					'**Struk tidak tercetak** → nyalakan Bluetooth & printer, sambungkan ulang; atau pakai RawBT.',
					'**Angka di dasbor belum berubah** → tunggu ±1 menit atau tekan Muat ulang; HP kasir mungkin belum sinkron.',
					'**Selisih kas** → cek pengeluaran/kasbon/setoran yang lupa dicatat, transaksi yang belum terkirim, atau batal.',
					'**"Ada perbedaan jumlah" saat terima kiriman** → hitung ulang, hubungi outlet pengirim.',
					'**Menu Dasbor/Belanja tidak muncul di HP** → tutup lalu buka lagi aplikasinya.'
				]
			}
		]
	}
];

export const SEMUA_TOPIK: (Topik & { bagian: Bagian })[] = BAGIAN.flatMap((b) => b.topik.map((t) => ({ ...t, bagian: b })));
export const cariTopik = (id: string) => SEMUA_TOPIK.find((t) => t.id === id);

/** Bagian yang tampil untuk peran: kasir melihat umum + kasir; admin melihat semua. */
export function bagianUntuk(peran: 'kasir' | 'admin'): Bagian[] {
	return peran === 'admin' ? BAGIAN : BAGIAN.filter((b) => b.peran === 'umum' || b.peran === 'kasir');
}

/** Pencarian sederhana tanpa membedakan huruf besar/kecil di judul, ringkas, langkah, catatan. */
export function cocok(t: Topik, kata: string): boolean {
	const q = kata.trim().toLowerCase();
	if (!q) return true;
	return [t.judul, t.ringkas, t.menu ?? '', ...(t.langkah ?? []), ...(t.catatan ?? []), ...(t.awas ?? [])].join(' ').toLowerCase().includes(q);
}

/** **tebal** → <b>; teks lain di-escape (untuk halaman Bantuan & infografis). */
export function tebal(t: string): string {
	return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}
