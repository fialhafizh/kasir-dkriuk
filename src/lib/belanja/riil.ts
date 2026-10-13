// Belanja riil: barang yang benar-benar dibeli per outlet (dari Barang masuk) + belanja bahan lain yang dicatat
// di Pengeluaran + pengeluaran lainnya yang dibagi rata ke semua outlet. Semuanya juga masuk Laba-rugi outlet itu.
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

/** Pengeluaran lainnya yang dibagi rata ke semua outlet (satu catatan = satu bagi_id). */
export interface BagiRiil {
	bagi_id: string;
	waktu: string;
	keterangan: string | null;
	kategori: string;
	total: number;
	per_outlet: Record<string, number>;
}
interface BarisBagi {
	outlet_id: string;
	jumlah: number;
	waktu: string;
	keterangan: string | null;
	bagi_id: string;
	kategori: { nama: string } | null;
}
type Hasil<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const angka = (v: unknown) => Number(v);

export function kelompokBagi(baris: BarisBagi[]): BagiRiil[] {
	const peta = new Map<string, BagiRiil>();
	for (const x of baris) {
		let b = peta.get(x.bagi_id);
		if (!b) peta.set(x.bagi_id, (b = { bagi_id: x.bagi_id, waktu: x.waktu, keterangan: x.keterangan, kategori: x.kategori?.nama ?? '', total: 0, per_outlet: {} }));
		const n = angka(x.jumlah);
		b.total += n;
		b.per_outlet[x.outlet_id] = (b.per_outlet[x.outlet_id] ?? 0) + n;
	}
	return [...peta.values()].sort((a, b) => b.waktu.localeCompare(a.waktu));
}

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
export async function muatBelanjaRiil(r: Rentang): Promise<{ masuk: MasukRiil[]; lain: LainRiil[]; bagi: BagiRiil[] }> {
	const dari = tanggalWib(r.dari);
	const sampai = tanggalWib(r.sampai);
	const [masuk, lain, bagi] = await Promise.all([
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
		),
		// relasi kategori dibaca sebagai objek (bukan larik) — tipe bawaan klien keliru di sini
		semua<BarisBagi>(
			(a, b) =>
				supabase
					.from('pengeluaran')
					.select('outlet_id, jumlah, waktu, keterangan, bagi_id, kategori:kategori_id(nama)')
					.not('bagi_id', 'is', null)
					.is('batal_at', null)
					.gte('waktu', r.dari.toISOString())
					.lt('waktu', r.sampai.toISOString())
					.order('waktu', { ascending: false })
					.range(a, b) as unknown as Hasil<BarisBagi>
		)
	]);
	return {
		masuk: masuk.map((m) => ({ ...m, total: angka(m.total), item: m.item.map((i) => ({ ...i, qty: angka(i.qty), harga: angka(i.harga), subtotal: angka(i.subtotal) })) })),
		lain: lain.map((x) => ({ outlet_id: x.outlet_id, jumlah: angka(x.jumlah), waktu: x.waktu, keterangan: x.keterangan })),
		bagi: kelompokBagi(bagi)
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
	/** Pengeluaran lainnya yang dibagi rata, per outlet. */
	bagiOutlet: Record<string, number>;
	totalOutlet: Record<string, number>;
	total: number;
	jumlahNota: Record<string, number>;
}

export function susunRiil(masuk: MasukRiil[], lain: LainRiil[], outletIds: string[], bagi: BagiRiil[] = []): RingkasRiil {
	const ikut = new Set(outletIds);
	const peta = new Map<string, BarisRiil>();
	const nol = () => Object.fromEntries(outletIds.map((o) => [o, 0])) as Record<string, number>;
	const masukOutlet = nol();
	const lainOutlet = nol();
	const jumlahNota = nol();
	const bagiOutlet = nol();
	for (const b of bagi) for (const o of outletIds) bagiOutlet[o] += b.per_outlet[o] ?? 0;
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
	const totalOutlet = Object.fromEntries(outletIds.map((o) => [o, masukOutlet[o] + lainOutlet[o] + bagiOutlet[o]]));
	return { barang, masukOutlet, lainOutlet, bagiOutlet, totalOutlet, total: Object.values(totalOutlet).reduce((t, n) => t + n, 0), jumlahNota };
}

export function lembarRiil(s: RingkasRiil, outlet: { id: string; nama: string }[]): Lembar[] {
	return [
		{
			nama: 'Belanja riil',
			kolom: ['Barang', 'Jumlah total', ...outlet.flatMap((o) => [`${o.nama} (jumlah)`, `${o.nama} (Rp)`]), 'Harga rata-rata', 'Total Rp'],
			baris: [
				...s.barang.map((b) => [b.nama, b.qty, ...outlet.flatMap((o) => [b.per_outlet[o.id]?.qty ?? 0, b.per_outlet[o.id]?.rupiah ?? 0]), b.hargaRata, b.rupiah]),
				['Belanja bahan lain (Pengeluaran)', null, ...outlet.flatMap((o) => [null, s.lainOutlet[o.id]]), null, outlet.reduce((t, o) => t + s.lainOutlet[o.id], 0)],
				['Pengeluaran lainnya (dibagi rata)', null, ...outlet.flatMap((o) => [null, s.bagiOutlet[o.id]]), null, outlet.reduce((t, o) => t + s.bagiOutlet[o.id], 0)],
				['Jumlah', null, ...outlet.flatMap((o) => [null, s.totalOutlet[o.id]]), null, s.total]
			]
		}
	];
}
