export type ModeStok = 'otomatis' | 'catat' | 'analisis';
export type KategoriMenu = 'ayam' | 'kulit' | 'nasi' | 'box' | 'pelengkap';

export interface Bahan {
	id: string;
	kode: string;
	nama: string;
	satuan: string;
	mode: ModeStok;
	urutan: number;
	aktif: boolean;
}

export interface SatuanBeli {
	id: string;
	kode: string;
	nama: string;
	ambang: number | null;
	harga_tetap: boolean;
	urutan: number;
	aktif: boolean;
}

export interface BarisIsi {
	bahan_id: string;
	qty: number;
}

export interface IsiSatuanBeli extends BarisIsi {
	satuan_beli_id: string;
}

export interface Menu {
	id: string;
	kode: string;
	nama: string;
	kategori: KategoriMenu;
	varian: 'ori' | 'hot' | null;
	urutan: number;
	aktif: boolean;
}

export interface HargaJual {
	outlet_id: string;
	menu_id: string;
	harga: number;
}

export interface Resep extends BarisIsi {
	menu_id: string;
}

export interface HargaBeli {
	outlet_id: string;
	satuan_beli_id: string;
	harga: number;
	diubah_at: string;
}
