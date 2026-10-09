// Laporan keuangan (Tahap 5b): laba-rugi sederhana & arus kas; biaya tetap (sewa).
import type { Metode } from '#lib/kasir/types.ts';
import { supabase } from '#lib/supabase/client.ts';
import { hariDalamBulan } from './gaji.ts';
import { pesanKas } from './pesan.ts';

type Galat = Parameters<typeof pesanKas>[0];
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanKas(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}

export interface LaporanKeuangan {
	dari: string;
	sampai: string;
	omzet: number;
	per_metode: Record<Metode, { jumlah: number; total: number }>;
	belanja_bahan: number;
	belanja_bahan_masuk: number;
	belanja_bahan_lain: number;
	gaji: number;
	sewa: number;
	pengeluaran_lain: { kategori: string; jumlah: number }[];
	pengeluaran_lain_total: number;
	laba: number;
	arus_keluar: { kategori: string; laci: number; luar: number }[];
	setoran_diterima: number;
	selisih_setoran: number;
}

export interface BiayaTetap {
	id: string;
	outlet_id: string;
	nama: string;
	per_tahun: number;
	mulai: string;
	aktif: boolean;
	dicatat_at?: string;
}

/** Tanggal pertama & terakhir bulan 'YYYY-MM'. */
export function rentangBulan(bulan: string): { dari: string; sampai: string } {
	const h = hariDalamBulan(bulan);
	return { dari: h[0], sampai: h.at(-1)! };
}

const N = (v: unknown) => Number(v ?? 0);

export async function laporanKeuangan(outletId: string | null, dari: string, sampai: string): Promise<LaporanKeuangan> {
	const r = periksa(await supabase.rpc('laporan_keuangan', { p_outlet: outletId, p_dari: dari, p_sampai: sampai })) as LaporanKeuangan;
	// bigint dari jsonb → number.
	return {
		...r,
		omzet: N(r.omzet),
		belanja_bahan: N(r.belanja_bahan),
		belanja_bahan_masuk: N(r.belanja_bahan_masuk),
		belanja_bahan_lain: N(r.belanja_bahan_lain),
		gaji: N(r.gaji),
		sewa: N(r.sewa),
		pengeluaran_lain: r.pengeluaran_lain.map((x) => ({ ...x, jumlah: N(x.jumlah) })),
		pengeluaran_lain_total: N(r.pengeluaran_lain_total),
		laba: N(r.laba),
		arus_keluar: r.arus_keluar.map((x) => ({ ...x, laci: N(x.laci), luar: N(x.luar) })),
		setoran_diterima: N(r.setoran_diterima),
		selisih_setoran: N(r.selisih_setoran)
	};
}

export async function muatBiayaTetap(): Promise<BiayaTetap[]> {
	return periksa(await supabase.from('biaya_tetap').select('id, outlet_id, nama, per_tahun, mulai, aktif, dicatat_at').order('mulai', { ascending: false })) as BiayaTetap[];
}
export async function simpanBiayaTetap(p: { id?: string; outlet_id?: string; nama?: string; per_tahun?: number; mulai?: string; aktif?: boolean }): Promise<void> {
	periksa(await supabase.rpc('simpan_biaya_tetap', { p }));
}

/** Baris yang berlaku pada tanggal (mulai terakhir ≤ tanggal, aktif) per outlet & nama. */
export function berlakuPada(baris: BiayaTetap[], tanggal: string): BiayaTetap[] {
	const per = new Map<string, BiayaTetap>();
	for (const b of baris) {
		if (!b.aktif || b.mulai > tanggal) continue;
		const k = `${b.outlet_id}|${b.nama}`;
		const lama = per.get(k);
		// Sama dengan server: mulai terbaru, lalu yang dicatat paling akhir.
		if (!lama || b.mulai > lama.mulai || (b.mulai === lama.mulai && (b.dicatat_at ?? '') > (lama.dicatat_at ?? ''))) per.set(k, b);
	}
	return [...per.values()];
}
