import type { JenisKejadian } from './db.ts';

/** Nama kejadian antrean untuk kasir & admin. */
export const LABEL_KEJADIAN: Record<JenisKejadian, string> = {
	buka_shift: 'Buka toko',
	jual: 'Jualan',
	tutup_shift: 'Tutup toko',
	rusak: 'Rusak/sisa',
	batal_jual: 'Batal transaksi',
	kirim_transfer: 'Kirim ke outlet lain',
	ubah_transfer: 'Ubah kiriman',
	batal_transfer: 'Batal kiriman',
	terima_transfer: 'Terima kiriman',
	opname: 'Opname',
	stok_awal: 'Stok awal'
};

/** Label untuk jenis yang mungkin tidak dikenal (data dari server). */
export function labelKejadian(jenis: string): string {
	return (LABEL_KEJADIAN as Record<string, string>)[jenis] ?? jenis;
}
