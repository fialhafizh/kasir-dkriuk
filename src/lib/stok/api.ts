import { muatBahan, muatIsiSatuanBeli, muatSatuanBeli } from '#lib/master/api.ts';
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import { supabase } from '#lib/supabase/client.ts';
import { pesanStok } from './pesan.ts';
import type { BarangMasuk, Gerakan, ItemHitung, KirimBarangMasuk, StokAwal } from './types.ts';

type Galat = Parameters<typeof pesanStok>[0];

function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanStok(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}
// PostgREST mengirim numeric sebagai teks.
const angka = (v: unknown): number => Number(v);

export interface DataStok {
	bahan: Bahan[];
	satuan: SatuanBeli[];
	isi: IsiSatuanBeli[];
}
export interface StokRow {
	outlet_id: string;
	bahan_id: string;
	qty: number;
}

export async function muatDataStok(): Promise<DataStok> {
	const [bahan, satuan, isi] = await Promise.all([muatBahan(), muatSatuanBeli(), muatIsiSatuanBeli()]);
	return { bahan, satuan, isi };
}

export async function muatStok(outletId?: string): Promise<StokRow[]> {
	let q = supabase.from('stok_outlet').select('outlet_id, bahan_id, qty');
	if (outletId) q = q.eq('outlet_id', outletId);
	return (periksa(await q) as StokRow[]).map((r) => ({ ...r, qty: angka(r.qty) }));
}

export function petaStok(rows: StokRow[], outletId: string): Map<string, number> {
	return new Map(rows.filter((r) => r.outlet_id === outletId).map((r) => [r.bahan_id, r.qty]));
}

export async function muatGerakan(outletId: string, bahanIds: string[], batas = 100): Promise<Gerakan[]> {
	const rows = periksa(
		await supabase
			.from('gerakan_stok')
			.select('id, bahan_id, qty, jenis, waktu, penjualan(nomor)')
			.eq('outlet_id', outletId)
			.in('bahan_id', bahanIds)
			.order('waktu', { ascending: false })
			.order('id', { ascending: false })
			.limit(batas)
	) as unknown as (Omit<Gerakan, 'nomor'> & { penjualan: { nomor: string } | null })[];
	return rows.map(({ penjualan, ...g }) => ({ ...g, qty: angka(g.qty), nomor: penjualan?.nomor ?? null }));
}

export async function muatStokAwal(outletId?: string): Promise<StokAwal[]> {
	let q = supabase
		.from('stok_awal')
		.select('id, outlet_id, status, dihitung_at, catatan, item:stok_awal_item(bahan_id, qty_hitung)')
		.order('dihitung_at', { ascending: false });
	if (outletId) q = q.eq('outlet_id', outletId);
	return (periksa(await q) as StokAwal[]).map((s) => ({ ...s, item: s.item.map((i) => ({ ...i, qty_hitung: angka(i.qty_hitung) })) }));
}

export async function ajukanStokAwal(outletId: string, item: ItemHitung[]): Promise<string> {
	return periksa(await supabase.rpc('ajukan_stok_awal', { p_outlet: outletId, p_item: item })) as string;
}

export async function putuskanStokAwal(id: string, setuju: boolean, item: ItemHitung[] | null, catatan: string | null): Promise<void> {
	periksa(await supabase.rpc('putuskan_stok_awal', { p_id: id, p_setuju: setuju, p_item: item, p_catatan: catatan }));
}

export async function muatBarangMasuk(outletId: string): Promise<BarangMasuk[]> {
	const rows = periksa(
		await supabase
			.from('barang_masuk')
			.select('id, outlet_id, tanggal, waktu, total, catatan, batal_at, batal_alasan, item:barang_masuk_item(satuan_beli_id, nama, qty, harga, subtotal)')
			.eq('outlet_id', outletId)
			.order('waktu', { ascending: false })
			.limit(50)
	) as BarangMasuk[];
	return rows.map((b) => ({
		...b,
		total: angka(b.total),
		item: b.item.map((i) => ({ ...i, qty: angka(i.qty), subtotal: angka(i.subtotal) }))
	}));
}

export async function catatBarangMasuk(p: KirimBarangMasuk): Promise<string> {
	return periksa(await supabase.rpc('catat_barang_masuk', { p })) as string;
}

export async function batalBarangMasuk(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('batal_barang_masuk', { p_id: id, p_alasan: alasan }));
}
