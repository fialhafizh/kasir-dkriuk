// Panggilan server dasbor (Tahap 7a). Semua hanya admin.
import { pesanKasir } from '#lib/kasir/pesan.ts';
import { supabase } from '#lib/supabase/client.ts';
import type { JenisPanel } from './katalog.ts';
import type { Hasil } from './olah.ts';
import type { Rentang } from './periode.ts';
import type { Dasbor, Panel, SaringanDasbor, Spek } from './spek.ts';

// Pesan resmi fungsi SQL dasbor (migrasi 0029–0031); hanya ini yang diteruskan apa adanya.
const PESAN_DASBOR =
	/^(Hanya admin yang boleh membuka dasbor|Nama dasbor 1–40 karakter|Panel paling banyak 40 per dasbor|Dasbor tidak ditemukan|Judul panel 1–60 karakter|Letak panel tidak sah|Panel milik dasbor lain|Minimal harus ada satu dasbor|Periode dasbor tidak dikenal|Rentang tanggal tidak sah|Saringan dasbor tidak sah|Outlet tidak ditemukan|Spek panel tidak sah|Periode panel tidak dikenal|Jenis kejadian tidak dikenal|Jenis panel tidak dikenal|Sumber data tidak dikenal|Ukuran tidak dikenal untuk sumber ini|Pengelompokan paling banyak 2|Pengelompokan tidak dikenal untuk sumber ini|Satuan waktu tidak dikenal|Pengelompokan tidak cocok dengan jenis tampilan|Saringan panel tidak sah|Urutan panel tidak sah|Batas baris 1–500|Bahan tidak ditemukan)/;

type Galat = { code?: string; message?: string; status?: number; name?: string } | null;

export function pesanDasbor(err: Galat): string | null {
	if (!err) return null;
	const msg = err.message ?? '';
	if ((err.code === '22023' || err.code === '42501') && PESAN_DASBOR.test(msg)) return `${msg}.`;
	return pesanKasir(err);
}
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanDasbor(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}

export async function muatDaftarDasbor(): Promise<Dasbor[]> {
	const rows = periksa(
		await supabase.from('dasbor').select('id, nama, urutan, utama, bawaan, saringan, panel:dasbor_panel(id, judul, jenis, spek, x, y, w, h)').order('urutan').order('nama')
	) as Dasbor[];
	return rows.map((d) => ({ ...d, panel: [...(d.panel ?? [])].sort((a, b) => a.y - b.y || a.x - b.x) }));
}

export async function simpanDasbor(d: { id?: string; nama: string; saringan: SaringanDasbor; panel: Panel[] }): Promise<string> {
	return periksa(await supabase.rpc('simpan_dasbor', { p: d })) as string;
}
export async function hapusDasbor(id: string): Promise<void> {
	periksa(await supabase.rpc('hapus_dasbor', { p_id: id }));
}
export async function jadikanUtama(id: string): Promise<void> {
	periksa(await supabase.rpc('jadikan_utama_dasbor', { p_id: id }));
}
export async function kembalikanBawaan(): Promise<string> {
	return periksa(await supabase.rpc('kembalikan_bawaan_dasbor')) as string;
}

const angka = (v: unknown) => Number(v);

export async function hitungPanel(jenis: JenisPanel, spek: Spek, outlet: string | null, r: Rentang): Promise<Hasil> {
	const h = periksa(
		await supabase.rpc('agregasi_dasbor', {
			p_spek: { ...spek, jenis },
			p_outlet: outlet,
			p_dari: r.dari.toISOString(),
			p_sampai: r.sampai.toISOString()
		})
	) as Hasil;
	return { ...h, baris: h.baris.map((b) => ({ ...b, n: b.n.map(angka) })) };
}

export interface Siklus {
	label: string;
	satuan: string;
	ember: 'jam' | 'hari';
	saldo_awal: number;
	titik: { t: string; akhir: number; terendah: number }[];
	masuk: { waktu: string; jumlah: number }[];
	episode_habis: { habis: string; pulih: string | null }[];
	bertahan_jam: number[];
	jarak_masuk_jam: number | null;
	saldo_sekarang: number;
	pakai_per_hari: number;
	perkiraan_habis_hari: number | null;
}
export async function muatSiklus(outlet: string, kunci: string, r: Rentang): Promise<Siklus> {
	return periksa(
		await supabase.rpc('siklus_stok', { p_outlet: outlet, p_kunci: kunci, p_dari: r.dari.toISOString(), p_sampai: r.sampai.toISOString() })
	) as Siklus;
}

export interface Kejadian {
	waktu: string;
	jenis: string;
	/** kunci urut untuk halaman berikutnya */
	kunci: string;
	outlet_id: string;
	judul: string;
	rincian: string | null;
}
export async function muatRiwayat(
	outlet: string | null,
	r: Rentang,
	jenis: string[] | null,
	sebelum: { waktu: string; kunci: string } | null,
	batas = 50
): Promise<Kejadian[]> {
	return periksa(
		await supabase.rpc('riwayat_kejadian', {
			p_outlet: outlet,
			p_dari: r.dari.toISOString(),
			p_sampai: r.sampai.toISOString(),
			p_jenis: jenis && jenis.length ? jenis : null,
			p_sebelum: sebelum?.waktu ?? null,
			p_sebelum_kunci: sebelum?.kunci ?? null,
			p_batas: batas
		})
	) as Kejadian[];
}
