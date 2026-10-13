// Belanja riil: barang yang benar-benar dibeli per outlet (dari Barang masuk) + belanja bahan lain yang dicatat
// di Pengeluaran. Angka yang sama dipakai Laba-rugi sebagai "belanja bahan" outlet itu.
import type { Rentang } from '#lib/dasbor/periode.ts';
import type { Lembar } from '#lib/ekspor/xlsx.ts';
import { tanggalWib } from '#lib/kasir/waktu.ts';
import { supabase } from '#lib/supabase/client.ts';

export interface MasukRiil {
	id: string;
	outlet_id: string;
	tanggal: string;
	waktu: string;
	total: number;
	catatan: string | null;
	item: { satuan_beli_id: string; nama: string; qty: number; harga: number; subtotal: number }[];
}
export interface LainRiil {
	outlet_id: string;
	jumlah: number;
	waktu: string;
	keterangan: string | null;
}

const angka = (v: unknown) => Number(v);

async function semua<T>(buat: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
	const hasil: T[] = [];
	for (let i = 0; ; i += 1000) {
		const { data, error } = await buat(i, i + 999);
		if (error) throw new Error(`Gagal memuat belanja: ${error.message}`);
		hasil.push(...(data ?? []));
		if (!data || data.length < 1000) return hasil;
	}
}

/** Barang masuk (tidak dibatalkan) bertanggal di rentang, dan pengeluaran kategori belanja bahan. */
export async function muatBelanjaRiil(r: Rentang): Promise<{ masuk: MasukRiil[]; lain: LainRiil[] }> {
	const dari = tanggalWib(r.dari);
	const sampai = tanggalWib(r.sampai);
	const [masuk, lain] = await Promise.all([
		semua<MasukRiil>((a, b) =>
			supabase
				.from('barang_masuk')
				.select('id, outlet_id, tanggal, waktu, total, catatan, item:barang_masuk_item(satuan_beli_id, nama, qty, harga, subtotal)')
				.is('batal_at', null)
				.gte('tanggal', dari)
				.lt('tanggal', sampai)
				.order('waktu', { ascending: false })
				.range(a, b)
		),
		semua<LainRiil>((a, b) =>
			supabase
				.from('pengeluaran')
				.select('outlet_id, jumlah, waktu, keterangan, kategori:kategori_id!inner(kode)')
				.eq('kategori.kode', 'belanja_bahan')
				.is('batal_at', null)
				.gte('waktu', r.dari.toISOString())
				.lt('waktu', r.sampai.toISOString())
				.order('waktu', { ascending: false })
				.range(a, b)
		)
	]);
	return {
		masuk: masuk.map((m) => ({ ...m, total: angka(m.total), item: m.item.map((i) => ({ ...i, qty: angka(i.qty), harga: angka(i.harga), subtotal: angka(i.subtotal) })) })),
		lain: lain.map((x) => ({ outlet_id: x.outlet_id, jumlah: angka(x.jumlah), waktu: x.waktu, keterangan: x.keterangan }))
	};
}

export interface BarisRiil {
	satuan_beli_id: string;
	nama: string;
	per_outlet: Record<string, { qty: number; rupiah: number }>;
	qty: number;
	rupiah: number;
	/** Harga rata-rata per satuan beli di periode. */
	hargaRata: number;
}
export interface RingkasRiil {
	barang: BarisRiil[];
	/** Uang keluar untuk barang masuk per outlet. */
	masukOutlet: Record<string, number>;
	/** Belanja bahan lain (Pengeluaran) per outlet. */
	lainOutlet: Record<string, number>;
	totalOutlet: Record<string, number>;
	total: number;
	jumlahNota: Record<string, number>;
}

export function susunRiil(masuk: MasukRiil[], lain: LainRiil[], outletIds: string[]): RingkasRiil {
	const ikut = new Set(outletIds);
	const peta = new Map<string, BarisRiil>();
	const nol = () => Object.fromEntries(outletIds.map((o) => [o, 0])) as Record<string, number>;
	const masukOutlet = nol();
	const lainOutlet = nol();
	const jumlahNota = nol();
	for (const m of masuk) {
		if (!ikut.has(m.outlet_id)) continue;
		jumlahNota[m.outlet_id] += 1;
		for (const i of m.item) {
			let b = peta.get(i.satuan_beli_id);
			if (!b) peta.set(i.satuan_beli_id, (b = { satuan_beli_id: i.satuan_beli_id, nama: i.nama, per_outlet: {}, qty: 0, rupiah: 0, hargaRata: 0 }));
			const p = (b.per_outlet[m.outlet_id] ??= { qty: 0, rupiah: 0 });
			p.qty += i.qty;
			p.rupiah += i.subtotal;
			b.qty += i.qty;
			b.rupiah += i.subtotal;
			masukOutlet[m.outlet_id] += i.subtotal;
		}
	}
	for (const x of lain) if (ikut.has(x.outlet_id)) lainOutlet[x.outlet_id] += x.jumlah;
	const barang = [...peta.values()]
		.map((b) => ({ ...b, hargaRata: b.qty > 0 ? Math.round(b.rupiah / b.qty) : 0 }))
		.sort((a, b) => b.rupiah - a.rupiah || a.nama.localeCompare(b.nama));
	const totalOutlet = Object.fromEntries(outletIds.map((o) => [o, masukOutlet[o] + lainOutlet[o]]));
	return { barang, masukOutlet, lainOutlet, totalOutlet, total: Object.values(totalOutlet).reduce((t, n) => t + n, 0), jumlahNota };
}

export function lembarRiil(s: RingkasRiil, outlet: { id: string; nama: string }[]): Lembar[] {
	return [
		{
			nama: 'Belanja riil',
			kolom: ['Barang', 'Jumlah total', ...outlet.flatMap((o) => [`${o.nama} (jumlah)`, `${o.nama} (Rp)`]), 'Harga rata-rata', 'Total Rp'],
			baris: [
				...s.barang.map((b) => [b.nama, b.qty, ...outlet.flatMap((o) => [b.per_outlet[o.id]?.qty ?? 0, b.per_outlet[o.id]?.rupiah ?? 0]), b.hargaRata, b.rupiah]),
				['Belanja bahan lain (Pengeluaran)', null, ...outlet.flatMap((o) => [null, s.lainOutlet[o.id]]), null, outlet.reduce((t, o) => t + s.lainOutlet[o.id], 0)],
				['Jumlah', null, ...outlet.flatMap((o) => [null, s.totalOutlet[o.id]]), null, s.total]
			]
		}
	];
}
