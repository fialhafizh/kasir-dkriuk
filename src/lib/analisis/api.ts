// Analisis kebocoran (Tahap 7b) — semua PERKIRAAN; laba riil ada di Laba-rugi. Admin saja.
import { pesanDasbor } from '#lib/dasbor/api.ts';
import type { Rentang } from '#lib/dasbor/periode.ts';
import { supabase } from '#lib/supabase/client.ts';

// Pesan resmi migrasi 0032–0033 (selain pesan dasbor yang dipakai bersama).
const PESAN_ANALISIS = /^(Batas untung 0–100 persen)/;
type Galat = { code?: string; message?: string; status?: number; name?: string } | null;

export function pesanAnalisis(err: Galat): string | null {
	if (err && err.code === '22023' && PESAN_ANALISIS.test(err.message ?? '')) return `${err.message}.`;
	return pesanDasbor(err);
}
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanAnalisis(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const rentangRpc = (r: Rentang) => ({ p_dari: r.dari.toISOString(), p_sampai: r.sampai.toISOString() });

export interface UntungMenu {
	outlet_id: string;
	menu_id: string;
	nama: string;
	kategori: string;
	harga: number;
	modal: number | null;
	lengkap: boolean;
	untung: number | null;
	persen: number | null;
	tipis: boolean;
	terjual: number;
	omzet: number;
	untung_periode: number | null;
}
export async function muatUntungMenu(outlet: string | null, r: Rentang): Promise<{ batas: number; menu: UntungMenu[] }> {
	const h = periksa(await supabase.rpc('untung_menu', { p_outlet: outlet, ...rentangRpc(r) })) as { batas_untung: number; menu: UntungMenu[] };
	return {
		batas: Number(h.batas_untung),
		menu: h.menu.map((m) => ({ ...m, modal: n(m.modal), untung: n(m.untung), persen: n(m.persen), terjual: Number(m.terjual), omzet: Number(m.omzet), untung_periode: n(m.untung_periode) }))
	};
}
export async function simpanBatasUntung(batas: number): Promise<void> {
	periksa(await supabase.rpc('simpan_batas_untung', { p_batas: batas }));
}

export interface Susut {
	outlet_id: string;
	bahan_id: string;
	nama: string;
	satuan: string;
	jumlah: number;
	nilai: number | null;
	opname: number;
}
export interface Buang {
	outlet_id: string;
	label_alasan: string;
	nama: string;
	satuan: string;
	jumlah: number;
	nilai: number | null;
}
export async function muatSusutTerbuang(outlet: string | null, r: Rentang): Promise<{ susut: Susut[]; susutTotal: number; terbuang: Buang[]; terbuangTotal: number }> {
	const h = periksa(await supabase.rpc('susut_terbuang', { p_outlet: outlet, ...rentangRpc(r) })) as {
		susut: Susut[];
		susut_total: number;
		terbuang: Buang[];
		terbuang_total: number;
	};
	return {
		susut: h.susut.map((s) => ({ ...s, jumlah: Number(s.jumlah), nilai: n(s.nilai) })),
		susutTotal: Number(h.susut_total),
		terbuang: h.terbuang.map((t) => ({ ...t, jumlah: Number(t.jumlah), nilai: n(t.nilai) })),
		terbuangTotal: Number(h.terbuang_total)
	};
}

export interface Pembelian {
	waktu: string;
	jumlah: number;
	rupiah: number;
	berjalan: boolean;
	potong: number;
	potong_per_satuan: number | null;
	biaya_per_potong: number | null;
}
export interface MinyakTepung {
	outlet_id: string;
	nama: string;
	bahan: { kode: string; nama: string; satuan: string; pembelian: Pembelian[]; potong_per_satuan: number | null; biaya_per_potong: number | null }[];
	tepung: { kg_dkriuk: number; kg_a: number; persen_dkriuk: number | null; menyimpang: boolean; biaya: number; potong: number; modal_per_potong: number | null };
}
export async function muatMinyakTepung(outlet: string | null, r: Rentang): Promise<MinyakTepung[]> {
	const h = periksa(await supabase.rpc('minyak_tepung', { p_outlet: outlet, ...rentangRpc(r) })) as MinyakTepung[];
	return h.map((o) => ({
		...o,
		bahan: o.bahan.map((b) => ({
			...b,
			potong_per_satuan: n(b.potong_per_satuan),
			biaya_per_potong: n(b.biaya_per_potong),
			pembelian: b.pembelian.map((p) => ({ ...p, jumlah: Number(p.jumlah), rupiah: Number(p.rupiah), potong: Number(p.potong), potong_per_satuan: n(p.potong_per_satuan), biaya_per_potong: n(p.biaya_per_potong) }))
		})),
		tepung: { ...o.tepung, kg_dkriuk: Number(o.tepung.kg_dkriuk), kg_a: Number(o.tepung.kg_a), persen_dkriuk: n(o.tepung.persen_dkriuk), biaya: Number(o.tepung.biaya), potong: Number(o.tepung.potong), modal_per_potong: n(o.tepung.modal_per_potong) }
	}));
}

export interface Proyeksi {
	bulan: string;
	hari_berjalan: number;
	hari_selesai: number;
	hari_sebulan: number;
	omzet: number;
	laba: number;
	/** null pada tanggal 1 (belum ada hari yang selesai) */
	proyeksi_omzet: number | null;
	proyeksi_laba: number | null;
	bulan_lalu_omzet: number;
	bulan_lalu_laba: number;
}
export async function muatProyeksi(outlet: string | null): Promise<Proyeksi> {
	const h = periksa(await supabase.rpc('proyeksi_bulan', { p_outlet: outlet })) as Record<string, unknown>;
	return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, k === 'bulan' || v === null ? v : Number(v)])) as unknown as Proyeksi;
}

/** Tanda untung: tipis (di bawah batas), rugi (minus), belum lengkap (ada bahan tanpa harga). */
export function tandaUntung(m: Pick<UntungMenu, 'lengkap' | 'untung' | 'tipis'>): 'belum' | 'rugi' | 'tipis' | 'sehat' {
	if (!m.lengkap || m.untung === null) return 'belum';
	if (m.untung < 0) return 'rugi';
	return m.tipis ? 'tipis' : 'sehat';
}
