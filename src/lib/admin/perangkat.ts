// Admin: perangkat kasir (jam sinkron terakhir) & kejadian antrean yang diabaikan kasir (Tahap 4b).
import { formatAngka } from '#lib/master/rupiah.ts';
import { pesanErrorData } from '#lib/master/pesan.ts';
import { supabase } from '#lib/supabase/client.ts';

export interface Perangkat {
	id: string;
	kode: number;
	outlet_id: string | null;
	terakhir_oleh: string | null;
	terakhir_sinkron: string | null;
	dibuat_at: string;
}

export interface Diabaikan {
	id: string;
	outlet_id: string;
	perangkat_id: string | null;
	jenis: string;
	data: Record<string, unknown>;
	alasan_tolak: string | null;
	alasan: string;
	oleh: string | null;
	dibuat_at: string;
}

type Galat = Parameters<typeof pesanErrorData>[0];
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanErrorData(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}

export async function muatPerangkat(): Promise<Perangkat[]> {
	return periksa(await supabase.from('perangkat').select('id, kode, outlet_id, terakhir_oleh, terakhir_sinkron, dibuat_at').order('kode')) as Perangkat[];
}

export async function muatDiabaikan(): Promise<Diabaikan[]> {
	return periksa(
		await supabase
			.from('kejadian_diabaikan')
			.select('id, outlet_id, perangkat_id, jenis, data, alasan_tolak, alasan, oleh, dibuat_at')
			.order('dibuat_at', { ascending: false })
			.limit(100)
	) as Diabaikan[];
}

export async function muatNamaPengguna(): Promise<Map<string, string>> {
	const rows = periksa(await supabase.from('profiles').select('id, nama_tampilan')) as { id: string; nama_tampilan: string }[];
	return new Map(rows.map((r) => [r.id, r.nama_tampilan]));
}

const BATAS_LAMA_MS = 24 * 3_600_000;

/** 'belum': belum pernah sinkron; 'lama': lebih dari 24 jam; 'baru': dalam 24 jam terakhir. */
export function statusSinkron(terakhir: string | null, sekarang: Date): 'baru' | 'lama' | 'belum' {
	if (!terakhir) return 'belum';
	return sekarang.getTime() - new Date(terakhir).getTime() > BATAS_LAMA_MS ? 'lama' : 'baru';
}

/** Ringkasan isi kejadian untuk admin (nomor, kode struk, total, alasan, jumlah bahan). */
export function ringkasData(jenis: string, data: Record<string, unknown>): string {
	const d = data as { nomor_sementara?: string; kode_struk?: string; total?: number; modal?: number; uang_fisik?: number; alasan?: string; item?: unknown[]; jumlah?: number };
	const bagian: (string | false | undefined)[] = [];
	if (jenis === 'jual') bagian.push(d.nomor_sementara, d.kode_struk && `kode ${d.kode_struk}`, typeof d.total === 'number' && `Rp${formatAngka(d.total)}`);
	else if (jenis === 'buka_shift') bagian.push(`modal Rp${formatAngka(Number(d.modal ?? 0))}`);
	else if (jenis === 'tutup_shift') bagian.push(`uang laci Rp${formatAngka(Number(d.uang_fisik ?? 0))}`);
	else if (jenis === 'pengeluaran' || jenis === 'setoran' || jenis === 'kasbon') bagian.push(`Rp${formatAngka(Number(d.jumlah ?? 0))}`);
	else {
		if (Array.isArray(d.item)) bagian.push(`${d.item.length} bahan`);
		if (d.alasan) bagian.push(`alasan: ${d.alasan}`);
	}
	return bagian.filter(Boolean).join(' · ');
}
