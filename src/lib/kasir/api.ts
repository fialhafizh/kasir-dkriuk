import { pesanKasir } from './pesan.ts';
import { supabase } from '#lib/supabase/client.ts';
import type { HasilJual, MenuJual, Metode, PenjualanRiwayat, Ringkasan, Shift } from './types.ts';

type Galat = Parameters<typeof pesanKasir>[0];
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanKasir(res.error) ?? 'Terjadi kesalahan.');
	return res.data as T;
}

/** Menu aktif beserta harga outlet ini (menu tanpa harga di outlet tidak ditampilkan). */
export async function muatMenuOutlet(outletId: string): Promise<MenuJual[]> {
	const [menu, harga] = await Promise.all([
		supabase.from('menu').select('id, kode, nama, kategori, varian, urutan').eq('aktif', true).order('urutan'),
		supabase.from('harga_jual').select('menu_id, harga').eq('outlet_id', outletId)
	]);
	const peta = new Map(periksa(harga).map((h: { menu_id: string; harga: number }) => [h.menu_id, h.harga]));
	return (periksa(menu) as Omit<MenuJual, 'harga'>[])
		.filter((m) => peta.has(m.id))
		.map((m) => ({ ...m, harga: peta.get(m.id)! }));
}

export async function shiftTerbuka(outletId: string): Promise<Shift | null> {
	return periksa(
		await supabase
			.from('shift')
			.select('id, outlet_id, dibuka_at, modal, ditutup_at')
			.eq('outlet_id', outletId)
			.is('ditutup_at', null)
			.maybeSingle()
	);
}

export async function modalTerakhir(outletId: string): Promise<number> {
	const s = periksa(
		await supabase
			.from('shift')
			.select('modal')
			.eq('outlet_id', outletId)
			.order('dibuka_at', { ascending: false })
			.limit(1)
			.maybeSingle()
	) as { modal: number } | null;
	return s?.modal ?? 0;
}

export async function bukaShift(outletId: string, modal: number): Promise<string> {
	return periksa(await supabase.rpc('buka_shift', { p_outlet: outletId, p_modal: modal })) as string;
}

export async function catatPenjualan(p: {
	id: string;
	outlet_id: string;
	metode: Metode;
	diterima?: number;
	/** Hanya untuk kiriman offline (Tahap 4); saat online jam server yang dipakai. */
	waktu?: string;
	item: { menu_id: string; qty: number }[];
}): Promise<HasilJual> {
	return periksa(await supabase.rpc('catat_penjualan', { p })) as HasilJual;
}

export async function daftarPenjualanShift(shiftId: string): Promise<PenjualanRiwayat[]> {
	return periksa(
		await supabase
			.from('penjualan')
			.select('id, nomor, waktu, metode, total, diterima, kembalian, void_at, void_alasan, item:penjualan_item(nama, harga, qty)')
			.eq('shift_id', shiftId)
			.order('waktu', { ascending: false })
			.order('nama', { referencedTable: 'item' })
	) as PenjualanRiwayat[];
}

export async function voidPenjualan(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('void_penjualan', { p_id: id, p_alasan: alasan }));
}

export async function ringkasanShift(shiftId: string): Promise<Ringkasan> {
	return periksa(await supabase.rpc('ringkasan_shift', { p_shift: shiftId })) as Ringkasan;
}

export async function tutupShift(shiftId: string, uangFisik: number, catatan: string): Promise<Ringkasan> {
	return periksa(await supabase.rpc('tutup_shift', { p_shift: shiftId, p_uang_fisik: uangFisik, p_catatan: catatan })) as Ringkasan;
}
