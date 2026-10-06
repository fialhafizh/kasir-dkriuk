// Kas (Tahap 5a) via Supabase. Penulisan kasir lewat antrean; pembacaan mengikuti RLS.
import { supabase } from '#lib/supabase/client.ts';
import type { LaciServer } from '#lib/offline/proyeksi-laci.ts';
import { pesanKas } from './pesan.ts';

type Galat = Parameters<typeof pesanKas>[0];
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanKas(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}

export interface Kategori {
	id: string;
	nama: string;
	untuk_kasir: boolean;
	wajib_keterangan: boolean;
	aktif: boolean;
	urutan: number;
}

export interface Pengeluaran {
	id: string;
	outlet_id: string;
	sumber: 'laci' | 'luar';
	kategori_id: string;
	jumlah: number;
	waktu: string;
	keterangan: string | null;
	batal_at: string | null;
	batal_alasan: string | null;
}

export interface Setoran {
	id: string;
	outlet_id: string;
	jumlah: number;
	waktu: string;
	catatan: string | null;
	dicatat_oleh: string | null;
	diterima_at: string | null;
	jumlah_diterima: number | null;
	catatan_terima: string | null;
	batal_at: string | null;
	batal_alasan: string | null;
}

export async function muatSaldoLaci(outletId: string): Promise<LaciServer> {
	return periksa(await supabase.rpc('saldo_laci', { p_outlet: outletId })) as LaciServer;
}

export async function muatKategori(): Promise<Kategori[]> {
	return periksa(await supabase.from('kategori_pengeluaran').select('id, nama, untuk_kasir, wajib_keterangan, aktif, urutan').order('urutan').order('nama')) as Kategori[];
}

const KOLOM_PENGELUARAN = 'id, outlet_id, sumber, kategori_id, jumlah, waktu, keterangan, batal_at, batal_alasan';
const KOLOM_SETORAN = 'id, outlet_id, jumlah, waktu, catatan, dicatat_oleh, diterima_at, jumlah_diterima, catatan_terima, batal_at, batal_alasan';

/** Pengeluaran (opsional per outlet) dalam rentang jam [dari, sampai). */
export async function muatPengeluaran(a: { outletId?: string; dari: string; sampai: string }): Promise<Pengeluaran[]> {
	let q = supabase.from('pengeluaran').select(KOLOM_PENGELUARAN).gte('waktu', a.dari).lt('waktu', a.sampai).order('waktu', { ascending: false }).limit(500);
	if (a.outletId) q = q.eq('outlet_id', a.outletId);
	return periksa(await q) as Pengeluaran[];
}

/** Setoran terbaru (opsional per outlet / hanya yang belum diterima). */
export async function muatSetoran(a: { outletId?: string; belumDiterima?: boolean; batas?: number } = {}): Promise<Setoran[]> {
	let q = supabase.from('setoran').select(KOLOM_SETORAN).order('waktu', { ascending: false }).limit(a.batas ?? 50);
	if (a.outletId) q = q.eq('outlet_id', a.outletId);
	if (a.belumDiterima) q = q.is('diterima_at', null).is('batal_at', null);
	return periksa(await q) as Setoran[];
}
