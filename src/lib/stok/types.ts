export type JenisGerakan =
	| 'awal'
	| 'masuk'
	| 'masuk_batal'
	| 'jual'
	| 'jual_batal'
	| 'rusak'
	| 'rusak_batal'
	| 'transfer_keluar'
	| 'transfer_masuk'
	| 'opname';
export type StatusStok = 'aman' | 'menipis' | 'minus';

/** Satu baris layar stok: satu bahan, atau satu kelompok ayam per varian. */
export interface BarisStok {
	kunci: string;
	label: string;
	teks: string;
	status: StatusStok;
	bahan_id: string[];
}

export interface Gerakan {
	id: number;
	bahan_id: string;
	qty: number;
	jenis: JenisGerakan;
	waktu: string;
	nomor: string | null;
}

export interface BarangMasuk {
	id: string;
	outlet_id: string;
	tanggal: string;
	waktu: string;
	total: number;
	catatan: string | null;
	batal_at: string | null;
	batal_alasan: string | null;
	item: { satuan_beli_id: string; nama: string; qty: number; harga: number; subtotal: number }[];
}

export interface StokAwal {
	id: string;
	outlet_id: string;
	status: 'diajukan' | 'disetujui' | 'ditolak';
	dihitung_at: string;
	catatan: string | null;
	item: { bahan_id: string; qty_hitung: number }[];
}

export interface KirimBarangMasuk {
	id: string;
	outlet_id: string;
	tanggal: string;
	catatan?: string;
	item: { satuan_beli_id: string; qty: number; harga: number }[];
}

export interface ItemHitung {
	bahan_id: string;
	qty: number;
}

export type AlasanRusak = 'sisa_tidak_laku' | 'dimakan_karyawan' | 'gosong' | 'basi' | 'jatuh_rusak' | 'lainnya';

export interface Rusak {
	id: string;
	outlet_id: string;
	waktu: string;
	alasan: AlasanRusak;
	catatan: string | null;
	batal_at: string | null;
	batal_alasan: string | null;
	item: ItemHitung[];
}

export interface Transfer {
	id: string;
	dari_outlet_id: string;
	ke_outlet_id: string;
	status: 'dikirim' | 'diterima' | 'dibatalkan';
	catatan: string | null;
	dikirim_at: string;
	diterima_at: string | null;
	batal_alasan: string | null;
	/** Kosong bagi outlet tujuan selama status 'dikirim' (hitung buta). */
	item: ItemHitung[];
}

export interface Opname {
	id: string;
	outlet_id: string;
	status: 'diajukan' | 'disetujui' | 'ditolak';
	dihitung_at: string;
	catatan: string | null;
}

export interface BarisPratinjau {
	bahan_id: string;
	qty_hitung: number;
	qty_sistem: number;
}
