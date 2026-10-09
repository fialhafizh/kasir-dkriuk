// Katalog dasbor (sama persis dengan public._dasbor_katalog di migrasi 0030 — dijaga tes).

export const KATALOG = {
	penjualan: { ukuran: ['omzet', 'transaksi', 'rata_rata'], kelompok: ['waktu', 'outlet', 'kanal', 'kasir', 'jam', 'hari'] },
	item: { ukuran: ['jumlah', 'rupiah'], kelompok: ['waktu', 'outlet', 'menu', 'kategori', 'varian', 'kanal'] },
	pemakaian: { ukuran: ['jumlah'], kelompok: ['waktu', 'outlet', 'bahan'] },
	terbuang: { ukuran: ['jumlah'], kelompok: ['waktu', 'outlet', 'bahan', 'alasan'] },
	barang_masuk: { ukuran: ['rupiah', 'jumlah'], kelompok: ['waktu', 'outlet', 'barang'] },
	pengeluaran: { ukuran: ['rupiah'], kelompok: ['waktu', 'outlet', 'kategori', 'sumber'] },
	setoran: { ukuran: ['dicatat', 'diterima', 'selisih'], kelompok: ['waktu', 'outlet'] },
	tutup_toko: { ukuran: ['selisih', 'banyak'], kelompok: ['waktu', 'outlet', 'kasir'] },
	batal: { ukuran: ['banyak', 'rupiah'], kelompok: ['waktu', 'outlet', 'kasir', 'kanal'] }
} as const;

export type Sumber = keyof typeof KATALOG;
export const SUMBER = Object.keys(KATALOG) as Sumber[];

export const LABEL_SUMBER: Record<Sumber, string> = {
	penjualan: 'Penjualan',
	item: 'Item terjual',
	pemakaian: 'Pemakaian bahan',
	terbuang: 'Sisa / terbuang',
	barang_masuk: 'Barang masuk',
	pengeluaran: 'Pengeluaran',
	setoran: 'Setoran',
	tutup_toko: 'Tutup toko',
	batal: 'Batal transaksi'
};

const LABEL_UKURAN: Record<string, string> = {
	omzet: 'Omzet',
	transaksi: 'Transaksi',
	rata_rata: 'Rata-rata per transaksi',
	jumlah: 'Jumlah',
	rupiah: 'Rupiah',
	dicatat: 'Dicatat kasir',
	diterima: 'Diterima',
	selisih: 'Selisih',
	banyak: 'Banyak'
};
/** Ukuran yang nilainya rupiah. */
const RUPIAH = new Set(['penjualan.omzet', 'penjualan.rata_rata', 'item.rupiah', 'barang_masuk.rupiah', 'pengeluaran.rupiah', 'setoran.dicatat',
	'setoran.diterima', 'setoran.selisih', 'tutup_toko.selisih', 'batal.rupiah']);

export const labelUkuran = (u: string) => LABEL_UKURAN[u] ?? u;
export const ukuranRupiah = (sumber: string, u: string) => RUPIAH.has(`${sumber}.${u}`);

export const LABEL_KELOMPOK: Record<string, string> = {
	waktu: 'Waktu',
	outlet: 'Outlet',
	kanal: 'Kanal',
	kasir: 'Kasir',
	jam: 'Jam',
	hari: 'Hari',
	menu: 'Menu',
	kategori: 'Kategori',
	varian: 'Varian (Ori/Hot)',
	bahan: 'Bahan',
	alasan: 'Alasan',
	barang: 'Barang',
	sumber: 'Sumber uang'
};

export const SATUAN_WAKTU = ['jam', 'hari', 'minggu', 'bulan'] as const;
export type SatuanWaktu = (typeof SATUAN_WAKTU)[number];
export const LABEL_SATUAN: Record<SatuanWaktu, string> = { jam: 'Per jam', hari: 'Per hari', minggu: 'Per minggu', bulan: 'Per bulan' };

export const JENIS_GRAFIK = ['angka', 'batang', 'garis', 'lingkaran', 'tabel', 'peta_panas'] as const;
export const JENIS_KHUSUS = ['status_stok', 'siklus_stok', 'riwayat', 'uang_laci'] as const;
export type JenisGrafik = (typeof JENIS_GRAFIK)[number];
export type JenisPanel = JenisGrafik | (typeof JENIS_KHUSUS)[number];
export const LABEL_JENIS: Record<JenisPanel, string> = {
	angka: 'Angka',
	batang: 'Batang',
	garis: 'Garis',
	lingkaran: 'Lingkaran',
	tabel: 'Tabel',
	peta_panas: 'Peta panas',
	status_stok: 'Status stok',
	siklus_stok: 'Siklus stok',
	riwayat: 'Riwayat kejadian',
	uang_laci: 'Uang di laci'
};

export const JENIS_RIWAYAT = ['jual', 'batal', 'sisa', 'barang_masuk', 'transfer', 'opname', 'toko', 'pengeluaran', 'kasbon', 'setoran', 'diabaikan'] as const;
export const LABEL_RIWAYAT: Record<(typeof JENIS_RIWAYAT)[number], string> = {
	jual: 'Jualan',
	batal: 'Batal',
	sisa: 'Sisa/rusak',
	barang_masuk: 'Barang masuk',
	transfer: 'Transfer',
	opname: 'Opname & stok awal',
	toko: 'Buka/tutup toko',
	pengeluaran: 'Pengeluaran',
	kasbon: 'Kasbon',
	setoran: 'Setoran',
	diabaikan: 'Data diabaikan'
};
