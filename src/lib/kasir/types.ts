import type { KategoriMenu } from '#lib/master/types.ts';

export type Metode = 'cash' | 'qris' | 'gofood' | 'grabfood' | 'shopeefood';

export interface MenuJual {
	id: string;
	kode: string;
	nama: string;
	kategori: KategoriMenu;
	varian: 'ori' | 'hot' | null;
	urutan: number;
	harga: number;
}

export interface BarisKeranjang {
	menu_id: string;
	nama: string;
	harga: number;
	qty: number;
}

export interface Shift {
	id: string;
	outlet_id: string;
	dibuka_at: string;
	modal: number;
	ditutup_at: string | null;
}

export interface PenjualanRiwayat {
	id: string;
	nomor: string;
	waktu: string;
	metode: Metode;
	total: number;
	diterima: number | null;
	kembalian: number | null;
	void_at: string | null;
	void_alasan: string | null;
	item: { nama: string; harga: number; qty: number }[];
}

export interface Ringkasan {
	shift_id: string;
	outlet_id: string;
	modal: number;
	dibuka_at: string;
	ditutup_at: string | null;
	jumlah_transaksi: number;
	jumlah_void: number;
	total: number;
	per_metode: Record<Metode, { jumlah: number; total: number }>;
	cash_seharusnya: number;
	uang_fisik: number | null;
	selisih: number | null;
}

export interface HasilJual {
	id: string;
	nomor: string;
	total: number;
	kembalian: number | null;
	waktu: string;
	ulang: boolean;
}
