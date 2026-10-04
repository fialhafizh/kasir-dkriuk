import type { Outlet } from '#lib/types/db.ts';
import type { DataStruk } from './struk.ts';
import type { BarisKeranjang, HasilJual, Metode, PenjualanRiwayat } from './types.ts';

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

/** Struk dari penjualan yang tersimpan di server (cetak ulang, atau kiriman ulang yang dikembalikan server). */
export function dataStrukRiwayat(outlet: Outlet, kasir: string, p: PenjualanRiwayat, cetakUlang = false): DataStruk {
	return {
		outlet: { merek: outlet.merek, nama: outlet.nama, alamat: outlet.alamat, telepon: outlet.telepon },
		nomor: p.nomor,
		waktu: p.waktu,
		kasir,
		item: p.item.map((i) => ({ nama: i.nama, harga: i.harga, qty: i.qty })),
		total: p.total,
		metode: p.metode,
		diterima: p.diterima,
		kembalian: p.kembalian,
		cetakUlang,
		batal: p.void_at !== null
	};
}

/** Sidik isi transaksi: berubah bila item, metode, atau uang diterima berubah (urutan item diabaikan). */
export function sidikTransaksi(k: BarisKeranjang[], metode: Metode, diterima: number | null): string {
	const item = [...k].sort((a, b) => a.menu_id.localeCompare(b.menu_id)).map((b) => `${b.menu_id}x${b.qty}`);
	return `${item.join(',')}|${metode}|${diterima ?? ''}`;
}
