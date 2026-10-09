// Penyimpanan di perangkat (IndexedDB): salinan data server & antrean kejadian kasir.
import Dexie, { type Table } from 'dexie';

export type JenisKejadian =
	| 'buka_shift'
	| 'jual'
	| 'tutup_shift'
	| 'rusak'
	| 'batal_jual'
	| 'kirim_transfer'
	| 'ubah_transfer'
	| 'batal_transfer'
	| 'terima_transfer'
	| 'opname'
	| 'stok_awal'
	| 'pengeluaran'
	| 'setoran'
	| 'kasbon';

export interface Kejadian {
	urut?: number;
	id: string;
	jenis: JenisKejadian;
	outlet_id: string;
	/** id shift perangkat; kejadian satu shift tertahan bila buka-nya ditolak. */
	shift_id: string | null;
	/** Jam kejadian di perangkat (ISO). */
	waktu: string;
	data: Record<string, unknown>;
	status: 'menunggu' | 'ditolak' | 'terkirim' | 'diabaikan';
	/** Pengguna yang mencatat; dikirim hanya saat pengguna itu yang masuk. */
	user_id?: string | null;
	alasan: string | null;
	percobaan: number;
	hasil: unknown;
	terkirim_at: string | null;
}

export interface Salinan {
	kunci: string;
	nilai: unknown;
	disimpan_at: string;
}

export class DbKasir extends Dexie {
	kejadian!: Table<Kejadian, number>;
	salinan!: Table<Salinan, string>;
	constructor(nama: string) {
		super(nama);
		this.version(1).stores({ kejadian: '++urut, &id, status, jenis, shift_id, outlet_id', salinan: '&kunci' });
	}
}

export function bukaDb(nama = 'dk-kasir'): DbKasir {
	return new DbKasir(nama);
}
