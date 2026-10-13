// Catat belanja riil dalam satu tabel barang × outlet (seperti Rencana belanja). Saat disimpan, tiap outlet yang
// diisi menjadi satu Barang masuk → stok outlet bertambah dan uangnya tercatat sebagai belanja bahan outlet itu.
import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
import { parseQty, parseRupiah } from '#lib/master/rupiah.ts';
import { hargaAwal, periksaBarangMasuk } from '#lib/stok/masuk.ts';
import { satuanDiOutlet, type SatuanOutlet } from '#lib/stok/per-outlet.ts';
import type { KirimBarangMasuk } from '#lib/stok/types.ts';
import { jumlahSel, type Isian, type Rencana } from './belanja.ts';

export interface Sel {
	qty: string;
	harga: string;
}
export type Draf = Record<string, Sel>;
export const kunci = (satuan: string, outlet: string) => `${satuan}|${outlet}`;

// Urutan baris di halaman Belanja riil (permintaan owner 13 Okt 2026): kebutuhan D'Kriuk dulu, lalu Tepung A,
// lalu pack khusus Kertapati; barang lain (beras, minyak, barang baru) di bawah menurut urutan biasa.
const URUTAN = [
	'pack_ayam_ori',
	'pack_ayam_hot',
	'pack_kulit',
	'pack_tepung_dkriuk',
	'karung_tepung_dkriuk',
	'pack_saus_sambal',
	'pack_saus_tomat',
	'pack_plastik_besar',
	'pack_plastik_kecil',
	'pack_kemasan_besar',
	'pack_kemasan_kecil',
	'pack_kertas_nasi',
	'pack_cup_kulit',
	'pack_box',
	'pack_plastik_merah',
	'karung_tepung_a',
	'pack_saus_sambal_25',
	'pack_saus_tomat_25',
	'pack_plastik_kecil_50',
	'pack_kemasan_besar_50'
];
export function urutBelanja(a: Pick<SatuanBeli, 'kode' | 'urutan'>, b: Pick<SatuanBeli, 'kode' | 'urutan'>): number {
	const i = (x: Pick<SatuanBeli, 'kode'>) => (URUTAN.includes(x.kode) ? URUTAN.indexOf(x.kode) : URUTAN.length);
	return i(a) - i(b) || a.urutan - b.urutan;
}

/** Barang aktif beserta outlet yang memakainya (sel outlet lain dikunci). */
export function barisCatat(satuan: SatuanBeli[], pemakai: SatuanOutlet[], outletIds: string[]) {
	return satuan
		.filter((s) => s.aktif)
		.sort(urutBelanja)
		.map((s) => ({ s, outlet: outletIds.filter((o) => satuanDiOutlet(s.id, o, pemakai)) }))
		.filter((x) => x.outlet.length > 0);
}

/** Isi sel; harga diawali harga acuan outlet itu (harga tetap) atau kosong (harga berubah-ubah). */
export function sel(draf: Draf, s: SatuanBeli, outletId: string, hargaBeli: HargaBeli[]): Sel {
	return draf[kunci(s.id, outletId)] ?? { qty: '', harga: hargaAwal(s, hargaBeli, outletId) };
}

const nilaiSel = (x: Sel) => {
	const qty = x.qty.trim() === '' ? 0 : (parseQty(x.qty, 3) ?? 0);
	const harga = x.harga.trim() === '' ? 0 : (parseRupiah(x.harga) ?? 0);
	return { qty, rupiah: Math.round(qty * harga) };
};

/** Jumlah kosong atau nol = barang tidak dibeli untuk outlet itu. */
const kosong = (qty: string) => /^\s*(0+([.,]0*)?)?\s*$/.test(qty);

export interface Jumlah {
	perBaris: Record<string, { qty: number; rupiah: number }>;
	perOutlet: Record<string, number>;
	total: number;
}
export function hitungJumlah(draf: Draf, satuan: SatuanBeli[], pemakai: SatuanOutlet[], outletIds: string[], hargaBeli: HargaBeli[]): Jumlah {
	const perBaris: Jumlah['perBaris'] = {};
	const perOutlet = Object.fromEntries(outletIds.map((o) => [o, 0])) as Record<string, number>;
	for (const { s, outlet } of barisCatat(satuan, pemakai, outletIds)) {
		const b = (perBaris[s.id] = { qty: 0, rupiah: 0 });
		for (const o of outlet) {
			const n = nilaiSel(sel(draf, s, o, hargaBeli));
			b.qty += n.qty;
			b.rupiah += n.rupiah;
			perOutlet[o] += n.rupiah;
		}
	}
	return { perBaris, perOutlet, total: Object.values(perOutlet).reduce((t, n) => t + n, 0) };
}

export interface KirimanOutlet {
	outlet_id: string;
	kirim: KirimBarangMasuk | null;
	/** Pesan per barang yang bermasalah (nama barang → pesan). */
	galat: { nama: string; pesan: string }[];
}

/** Barang masuk per outlet dari sel yang jumlahnya diisi (> 0). Outlet tanpa isian dilewati. */
export function susunKiriman(
	draf: Draf,
	satuan: SatuanBeli[],
	pemakai: SatuanOutlet[],
	outletIds: string[],
	hargaBeli: HargaBeli[],
	tanggal: string,
	idOutlet: (outletId: string) => string,
	catatan?: string
): KirimanOutlet[] {
	const hasil: KirimanOutlet[] = [];
	const baris = barisCatat(satuan, pemakai, outletIds);
	for (const o of outletIds) {
		const isi = baris
			.filter((x) => x.outlet.includes(o))
			.map((x) => ({ s: x.s, c: sel(draf, x.s, o, hargaBeli) }))
			.filter(({ c }) => !kosong(c.qty));
		if (!isi.length) continue;
		const cek = periksaBarangMasuk(
			isi.map(({ s, c }) => ({ satuan_beli_id: s.id, qty: c.qty, harga: c.harga })),
			isi.map(({ s }) => s)
		);
		const galat = cek.galat.map((pesan, i) => ({ nama: isi[i].s.nama, pesan })).filter((g) => g.pesan);
		hasil.push({
			outlet_id: o,
			kirim: galat.length ? null : { id: idOutlet(o), outlet_id: o, tanggal, item: cek.item, ...(catatan ? { catatan } : {}) },
			galat
		});
	}
	return hasil;
}

/** Jumlah dari Rencana belanja (isian admin hari ini, atau saran) sebagai titik awal. */
export function dariRencana(r: Rencana, isian: Isian): Record<string, number> {
	const hasil: Record<string, number> = {};
	for (const b of r.barang) {
		for (const o of r.outlet) {
			if (!b.per_outlet[o.id] && isian[kunci(b.satuan_beli_id, o.id)] === undefined) continue;
			const n = jumlahSel(b, o.id, isian);
			if (n > 0) hasil[kunci(b.satuan_beli_id, o.id)] = n;
		}
	}
	return hasil;
}
