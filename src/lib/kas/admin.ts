// Admin keuangan (Tahap 5a): kas harian, setoran, pengeluaran, penjualan per tanggal.
import type { Metode, PenjualanRiwayat } from '#lib/kasir/types.ts';
import { supabase } from '#lib/supabase/client.ts';
import { pesanKas } from './pesan.ts';

type Galat = Parameters<typeof pesanKas>[0];
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanKas(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}

export interface HariKas {
	tanggal: string;
	per_metode: Record<Metode, { jumlah: number; total: number }>;
	total: number;
	jumlah_batal: number;
	pengeluaran_laci: { kategori: string; jumlah: number }[];
	pengeluaran_luar: { kategori: string; jumlah: number }[];
	belanja_bahan: number;
	setoran: number;
	saldo_awal: number;
	saldo_akhir: number;
	selisih: number;
}

/** Awal hari WIB (ISO) untuk tanggal 'YYYY-MM-DD'. */
export const awalHariWib = (tanggal: string) => `${tanggal}T00:00:00+07:00`;

/** Tanggal WIB n hari sebelum `tanggal` (format YYYY-MM-DD). */
export function mundurHari(tanggal: string, n: number): string {
	const d = new Date(`${tanggal}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().slice(0, 10);
}

export async function kasHarian(outletId: string, dari: string, sampai: string): Promise<HariKas[]> {
	const rows = periksa(await supabase.rpc('kas_harian', { p_outlet: outletId, p_dari: dari, p_sampai: sampai })) as HariKas[];
	// bigint dari jsonb sudah angka; pastikan tipe number.
	return rows.map((h) => ({
		...h,
		total: Number(h.total),
		belanja_bahan: Number(h.belanja_bahan),
		setoran: Number(h.setoran),
		saldo_awal: Number(h.saldo_awal),
		saldo_akhir: Number(h.saldo_akhir),
		selisih: Number(h.selisih)
	}));
}

export interface RingkasRentang {
	total: number;
	perMetode: Record<string, number>;
	pengeluaranLaci: number;
	pengeluaranLuar: number;
	belanjaBahan: number;
	setoran: number;
	selisih: number;
	saldoAkhir: number;
}

/** Jumlah untuk seluruh rentang (saldo akhir = hari terakhir). */
export function ringkasRentang(hari: HariKas[]): RingkasRentang {
	const r: RingkasRentang = { total: 0, perMetode: {}, pengeluaranLaci: 0, pengeluaranLuar: 0, belanjaBahan: 0, setoran: 0, selisih: 0, saldoAkhir: 0 };
	for (const h of hari) {
		r.total += h.total;
		for (const [m, v] of Object.entries(h.per_metode)) r.perMetode[m] = (r.perMetode[m] ?? 0) + Number(v.total);
		r.pengeluaranLaci += h.pengeluaran_laci.reduce((a, x) => a + Number(x.jumlah), 0);
		r.pengeluaranLuar += h.pengeluaran_luar.reduce((a, x) => a + Number(x.jumlah), 0);
		r.belanjaBahan += h.belanja_bahan;
		r.setoran += h.setoran;
		r.selisih += h.selisih;
	}
	r.saldoAkhir = hari.at(-1)?.saldo_akhir ?? 0;
	return r;
}

export async function terimaSetoran(id: string, jumlah: number, catatan: string | null): Promise<void> {
	periksa(await supabase.rpc('terima_setoran', { p_id: id, p_jumlah: jumlah, p_catatan: catatan }));
}
export async function batalSetoran(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('batal_setoran', { p_id: id, p_alasan: alasan }));
}
export async function catatPengeluaranAdmin(p: { id: string; outlet_id: string; sumber: 'laci' | 'luar'; kategori_id: string; jumlah: number; keterangan?: string; tanggal?: string }): Promise<void> {
	periksa(await supabase.rpc('catat_pengeluaran_admin', { p }));
}
export async function batalPengeluaran(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('batal_pengeluaran', { p_id: id, p_alasan: alasan }));
}
export async function simpanKategori(p: { id?: string; nama: string; untuk_kasir?: boolean; wajib_keterangan?: boolean; aktif?: boolean }): Promise<void> {
	periksa(await supabase.rpc('simpan_kategori', { p }));
}

export interface BelanjaBahan {
	id: string;
	outlet_id: string;
	tanggal: string;
	total: number;
	catatan: string | null;
	batal_at: string | null;
}

/** Barang masuk (belanja bahan) per tanggal [dari, sampai]. */
export async function muatBelanjaBahan(outletId: string | undefined, dari: string, sampai: string): Promise<BelanjaBahan[]> {
	let q = supabase.from('barang_masuk').select('id, outlet_id, tanggal, total, catatan, batal_at').gte('tanggal', dari).lte('tanggal', sampai).order('tanggal', { ascending: false });
	if (outletId) q = q.eq('outlet_id', outletId);
	return (periksa(await q) as BelanjaBahan[]).map((b) => ({ ...b, total: Number(b.total) }));
}

export type PenjualanAdmin = PenjualanRiwayat & { shift_id: string; void_koreksi: boolean };

/** Penjualan satu outlet pada satu tanggal WIB. */
export async function muatPenjualanTanggal(outletId: string, tanggal: string): Promise<PenjualanAdmin[]> {
	return periksa(
		await supabase
			.from('penjualan')
			.select('id, shift_id, nomor, waktu, metode, total, diterima, kembalian, void_at, void_alasan, void_koreksi, kode_struk, nomor_sementara, dicatat_at, perangkat_id, item:penjualan_item(nama, harga, qty)')
			.eq('outlet_id', outletId)
			.gte('waktu', awalHariWib(tanggal))
			.lt('waktu', awalHariWib(mundurHari(tanggal, -1)))
			.order('waktu', { ascending: false })
	) as PenjualanAdmin[];
}
