import { supabase } from '#lib/supabase/client.ts';
import type { Outlet } from '#lib/types/db.ts';
import { pesanErrorData } from './pesan.ts';
import type { Bahan, BarisIsi, HargaBeli, HargaJual, IsiSatuanBeli, Menu, Resep, SatuanBeli } from './types.ts';

type Galat = Parameters<typeof pesanErrorData>[0];

function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanErrorData(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}

// PostgREST mengirim kolom numeric sebagai teks; ubah ke number di satu tempat.
const keAngka = (v: unknown): number => Number(v);

export async function muatOutlets(): Promise<Outlet[]> {
	return periksa(await supabase.from('outlets').select('id, kode, nama, merek, alamat, telepon, aktif').order('kode'));
}
export async function muatBahan(): Promise<Bahan[]> {
	return periksa(await supabase.from('bahan').select('id, kode, nama, satuan, mode, urutan, aktif').order('urutan'));
}
export async function muatSatuanBeli(): Promise<SatuanBeli[]> {
	const rows = periksa(await supabase.from('satuan_beli').select('id, kode, nama, ambang, harga_tetap, urutan, aktif').order('urutan'));
	return (rows as SatuanBeli[]).map((r) => ({ ...r, ambang: r.ambang == null ? null : keAngka(r.ambang) }));
}
export async function muatIsiSatuanBeli(): Promise<IsiSatuanBeli[]> {
	const rows = periksa(await supabase.from('satuan_beli_isi').select('satuan_beli_id, bahan_id, qty'));
	return (rows as IsiSatuanBeli[]).map((r) => ({ ...r, qty: keAngka(r.qty) }));
}
export async function muatMenu(): Promise<Menu[]> {
	return periksa(await supabase.from('menu').select('id, kode, nama, kategori, varian, urutan, aktif').order('urutan'));
}
export async function muatHargaJual(): Promise<HargaJual[]> {
	return periksa(await supabase.from('harga_jual').select('outlet_id, menu_id, harga'));
}
export async function muatResep(): Promise<Resep[]> {
	const rows = periksa(await supabase.from('resep').select('menu_id, bahan_id, qty'));
	return (rows as Resep[]).map((r) => ({ ...r, qty: keAngka(r.qty) }));
}
export async function muatHargaBeli(): Promise<HargaBeli[]> {
	return periksa(await supabase.from('harga_beli').select('outlet_id, satuan_beli_id, harga, diubah_at'));
}

export async function simpanAmbang(satuanBeliId: string, ambang: number | null): Promise<void> {
	periksa(await supabase.from('satuan_beli').update({ ambang }).eq('id', satuanBeliId).select('id').single());
}
export async function simpanAktifBahan(bahanId: string, aktif: boolean): Promise<void> {
	periksa(await supabase.from('bahan').update({ aktif }).eq('id', bahanId).select('id').single());
}
export async function simpanIsiSatuanBeli(satuanBeliId: string, isi: BarisIsi[]): Promise<void> {
	periksa(await supabase.rpc('simpan_isi_satuan_beli', { p_satuan: satuanBeliId, p_isi: isi }));
}
export async function simpanHargaJual(outletId: string, menuId: string, harga: number): Promise<void> {
	periksa(
		await supabase.from('harga_jual').upsert({ outlet_id: outletId, menu_id: menuId, harga }).select('menu_id').single()
	);
}
export async function simpanResep(menuId: string, isi: BarisIsi[]): Promise<void> {
	periksa(await supabase.rpc('simpan_resep', { p_menu: menuId, p_isi: isi }));
}
export async function simpanHargaBeli(outletId: string, satuanBeliId: string, harga: number): Promise<void> {
	periksa(
		await supabase
			.from('harga_beli')
			.upsert({ outlet_id: outletId, satuan_beli_id: satuanBeliId, harga, diubah_at: new Date().toISOString() })
			.select('satuan_beli_id')
			.single()
	);
}
