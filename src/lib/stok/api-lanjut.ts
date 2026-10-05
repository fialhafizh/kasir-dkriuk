// Rusak, transfer, opname (Tahap 3b) via Supabase. Penulisan lewat RPC; pembacaan mengikuti RLS.
import { supabase } from '#lib/supabase/client.ts';
import { pesanStok } from './pesan.ts';
import type { AlasanRusak, BarisPratinjau, ItemHitung, Opname, Rusak, Transfer } from './types.ts';

type Galat = Parameters<typeof pesanStok>[0];
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanStok(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}
const angka = (v: unknown): number => Number(v);
const item = (xs: { bahan_id: string; qty: unknown }[] | null): ItemHitung[] => (xs ?? []).map((i) => ({ bahan_id: i.bahan_id, qty: angka(i.qty) }));

export async function catatRusak(p: { id: string; outlet_id: string; alasan: AlasanRusak; catatan?: string; item: ItemHitung[] }): Promise<void> {
	periksa(await supabase.rpc('catat_rusak', { p }));
}
export async function batalRusak(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('batal_rusak', { p_id: id, p_alasan: alasan }));
}
export async function muatRusak(outletId: string): Promise<Rusak[]> {
	const rows = periksa(
		await supabase
			.from('rusak')
			.select('id, outlet_id, waktu, alasan, catatan, batal_at, batal_alasan, item:rusak_item(bahan_id, qty)')
			.eq('outlet_id', outletId)
			.order('waktu', { ascending: false })
			.limit(100)
	) as (Omit<Rusak, 'item'> & { item: { bahan_id: string; qty: unknown }[] })[];
	return rows.map((r) => ({ ...r, item: item(r.item) }));
}

export async function kirimTransfer(p: { id: string; dari_outlet_id: string; ke_outlet_id: string; catatan?: string; item: ItemHitung[] }): Promise<void> {
	periksa(await supabase.rpc('kirim_transfer', { p }));
}
export async function ubahTransfer(id: string, it: ItemHitung[], catatan: string | null): Promise<void> {
	periksa(await supabase.rpc('ubah_transfer', { p_id: id, p_item: it, p_catatan: catatan }));
}
export async function batalTransfer(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('batal_transfer', { p_id: id, p_alasan: alasan }));
}
export async function terimaTransfer(id: string, it: ItemHitung[]): Promise<void> {
	periksa(await supabase.rpc('terima_transfer', { p_id: id, p_item: it }));
}
/** Semua transfer yang terlihat (admin: semua; kasir: dari/ke outletnya). */
export async function muatTransfer(outletId?: string): Promise<Transfer[]> {
	let q = supabase
		.from('transfer')
		.select('id, dari_outlet_id, ke_outlet_id, status, catatan, dikirim_at, diterima_at, batal_alasan, item:transfer_item(bahan_id, qty)')
		.order('dikirim_at', { ascending: false })
		.limit(100);
	if (outletId) q = q.or(`dari_outlet_id.eq.${outletId},ke_outlet_id.eq.${outletId}`);
	const rows = periksa(await q) as (Omit<Transfer, 'item'> & { item: { bahan_id: string; qty: unknown }[] })[];
	return rows.map((t) => ({ ...t, item: item(t.item) }));
}

export async function ajukanOpname(outletId: string, it: ItemHitung[]): Promise<string> {
	return periksa(await supabase.rpc('ajukan_opname', { p_outlet: outletId, p_item: it })) as string;
}
export async function muatOpname(outletId?: string): Promise<Opname[]> {
	let q = supabase.from('opname').select('id, outlet_id, status, dihitung_at, catatan').order('dihitung_at', { ascending: false }).limit(20);
	if (outletId) q = q.eq('outlet_id', outletId);
	return periksa(await q) as Opname[];
}
export async function pratinjauOpname(id: string): Promise<BarisPratinjau[]> {
	const rows = periksa(await supabase.rpc('pratinjau_opname', { p_id: id })) as { bahan_id: string; qty_hitung: unknown; qty_sistem: unknown }[];
	return rows.map((r) => ({ bahan_id: r.bahan_id, qty_hitung: angka(r.qty_hitung), qty_sistem: angka(r.qty_sistem) }));
}
export async function putuskanOpname(id: string, setuju: boolean, it: ItemHitung[] | null, catatan: string | null): Promise<void> {
	periksa(await supabase.rpc('putuskan_opname', { p_id: id, p_setuju: setuju, p_item: it, p_catatan: catatan }));
}
