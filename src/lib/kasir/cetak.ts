import type { Outlet } from '#lib/types/db.ts';
import type { DataStruk } from './struk.ts';
import type { BarisKeranjang, HasilJual, Metode } from './types.ts';

/** Nomor, waktu, total & kembalian selalu dari server; rincian item dari keranjang yang dikirim. */
export function dataStrukDari(a: {
	outlet: Outlet;
	kasir: string;
	hasil: HasilJual;
	keranjang: BarisKeranjang[];
	metode: Metode;
	diterima: number | null;
	cetakUlang?: boolean;
}): DataStruk {
	const cash = a.metode === 'cash';
	return {
		outlet: { merek: a.outlet.merek, nama: a.outlet.nama, alamat: a.outlet.alamat, telepon: a.outlet.telepon },
		nomor: a.hasil.nomor,
		waktu: a.hasil.waktu,
		kasir: a.kasir,
		item: a.keranjang.map((b) => ({ nama: b.nama, harga: b.harga, qty: b.qty })),
		total: a.hasil.total,
		metode: a.metode,
		diterima: cash ? a.diterima : null,
		kembalian: cash ? a.hasil.kembalian : null,
		cetakUlang: a.cetakUlang
	};
}
