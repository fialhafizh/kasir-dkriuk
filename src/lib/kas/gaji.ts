// Admin gaji (Tahap 5b): karyawan, kehadiran, kasbon, gajian bulanan.
import { supabase } from '#lib/supabase/client.ts';
import { pesanKas } from './pesan.ts';

type Galat = Parameters<typeof pesanKas>[0];
function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanKas(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}

export interface Karyawan {
	id: string;
	outlet_id: string;
	nama: string;
	upah_harian: number;
	aktif: boolean;
}

export interface GajiDibayar {
	id: string;
	hari_masuk: number;
	upah_harian: number;
	penyesuaian: number;
	keterangan: string | null;
	potongan_kasbon: number;
	dibayar: number;
	dibayar_at: string;
}

export interface RekapGaji {
	karyawan_id: string;
	nama: string;
	aktif: boolean;
	upah_harian: number;
	hari_masuk: number;
	sisa_kasbon: number;
	gaji: GajiDibayar | null;
}

export interface Kasbon {
	id: string;
	karyawan_id: string;
	sumber: 'laci' | 'luar';
	jumlah: number;
	waktu: string;
	keterangan: string | null;
	batal_at: string | null;
	batal_alasan: string | null;
}

/** Tanggal-tanggal dalam bulan 'YYYY-MM' (format YYYY-MM-DD). */
export function hariDalamBulan(bulan: string): string[] {
	const [y, m] = bulan.split('-').map(Number);
	const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
	return Array.from({ length: n }, (_, i) => `${bulan}-${String(i + 1).padStart(2, '0')}`);
}

/** Yang dibayar = hari × upah + penyesuaian − potongan kasbon. */
export function hitungDibayar(hari: number, upah: number, penyesuaian: number, potongan: number): number {
	return hari * upah + penyesuaian - potongan;
}

/** Saran potongan kasbon: seluruh sisa kasbon, tetapi tidak membuat gaji minus. */
export function saranPotongan(sisaKasbon: number, kotor: number): number {
	return Math.max(0, Math.min(sisaKasbon, kotor));
}

export async function muatKaryawan(): Promise<Karyawan[]> {
	return periksa(await supabase.from('karyawan').select('id, outlet_id, nama, upah_harian, aktif').order('nama')) as Karyawan[];
}
export async function simpanKaryawan(p: { id?: string; outlet_id?: string; nama: string; upah_harian: number; aktif?: boolean }): Promise<void> {
	periksa(await supabase.rpc('simpan_karyawan', { p }));
}

/** Kehadiran karyawan satu outlet pada bulan 'YYYY-MM' → set "karyawan_id|tanggal". */
export async function muatKehadiran(outletId: string, bulan: string): Promise<Set<string>> {
	const hari = hariDalamBulan(bulan);
	const rows = periksa(
		await supabase
			.from('kehadiran')
			.select('karyawan_id, tanggal, karyawan!inner(outlet_id)')
			.eq('karyawan.outlet_id', outletId)
			.gte('tanggal', hari[0])
			.lte('tanggal', hari.at(-1)!)
	) as { karyawan_id: string; tanggal: string }[];
	return new Set(rows.map((r) => `${r.karyawan_id}|${r.tanggal}`));
}
export async function aturKehadiran(karyawanId: string, tanggal: string, hadir: boolean): Promise<void> {
	periksa(await supabase.rpc('atur_kehadiran', { p_karyawan: karyawanId, p_tanggal: tanggal, p_hadir: hadir }));
}

export async function hitungGaji(outletId: string, bulan: string): Promise<RekapGaji[]> {
	return periksa(await supabase.rpc('hitung_gaji', { p_outlet: outletId, p_bulan: `${bulan}-01` })) as RekapGaji[];
}
export async function bayarGaji(p: {
	id: string;
	karyawan_id: string;
	bulan: string;
	penyesuaian: number;
	keterangan?: string;
	potongan_kasbon: number;
	sumber: 'laci' | 'luar';
	/** Hari masuk yang dilihat admin; server menolak bila sudah berubah. */
	hari_masuk: number;
}): Promise<void> {
	periksa(await supabase.rpc('bayar_gaji', { p: { ...p, bulan: `${p.bulan}-01` } }));
}
export async function batalGaji(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('batal_gaji', { p_id: id, p_alasan: alasan }));
}

export async function muatKasbon(outletId: string, sejak: string): Promise<Kasbon[]> {
	return periksa(
		await supabase
			.from('pengeluaran')
			.select('id, karyawan_id, sumber, jumlah, waktu, keterangan, batal_at, batal_alasan, kategori_pengeluaran!inner(kode)')
			.eq('outlet_id', outletId)
			.eq('kategori_pengeluaran.kode', 'kasbon')
			.gte('waktu', sejak)
			.order('waktu', { ascending: false })
	) as Kasbon[];
}
export async function catatKasbonAdmin(p: { id: string; outlet_id: string; karyawan_id: string; jumlah: number; sumber: 'laci' | 'luar'; keterangan?: string; tanggal?: string }): Promise<void> {
	periksa(await supabase.rpc('catat_kasbon_admin', { p }));
}

export interface KasbonRinci {
	id: string;
	waktu: string;
	jumlah: number;
	sumber: 'laci' | 'luar';
	keterangan: string | null;
	pencatat: string;
	/** bagian yang sudah dipotong gaji (dipotong urut tanggal tertua) */
	dipotong: number;
	status: 'lunas' | 'sebagian' | 'belum';
}

/** Potongan gaji melunasi kasbon urut dari yang paling lama. */
export function statusKasbon<T extends { waktu: string; jumlah: number }>(kasbon: T[], totalPotong: number): (T & Pick<KasbonRinci, 'dipotong' | 'status'>)[] {
	let sisa = Math.max(0, totalPotong);
	return [...kasbon]
		.sort((a, b) => (a.waktu < b.waktu ? -1 : a.waktu > b.waktu ? 1 : 0))
		.map((k) => {
			const dipotong = Math.min(sisa, k.jumlah);
			sisa -= dipotong;
			return { ...k, dipotong, status: dipotong >= k.jumlah ? 'lunas' : dipotong > 0 ? 'sebagian' : 'belum' };
		});
}

/** Semua kasbon (tidak batal) seorang karyawan, dari kasir & admin, dengan status pemotongan. */
export async function muatRincianKasbon(karyawanId: string): Promise<KasbonRinci[]> {
	const [kb, gaji, orang] = await Promise.all([
		supabase
			.from('pengeluaran')
			.select('id, waktu, jumlah, sumber, keterangan, dicatat_oleh, kategori_pengeluaran!inner(kode)')
			.eq('karyawan_id', karyawanId)
			.eq('kategori_pengeluaran.kode', 'kasbon')
			.is('batal_at', null),
		supabase.from('gaji').select('potongan_kasbon').eq('karyawan_id', karyawanId).is('batal_at', null),
		supabase.from('profiles').select('id, nama_tampilan, role')
	]);
	const rows = periksa(kb) as { id: string; waktu: string; jumlah: number; sumber: 'laci' | 'luar'; keterangan: string | null; dicatat_oleh: string | null }[];
	const potong = (periksa(gaji) as { potongan_kasbon: number }[]).reduce((t, g) => t + Number(g.potongan_kasbon), 0);
	const nama = new Map((periksa(orang) as { id: string; nama_tampilan: string; role: string }[]).map((p) => [p.id, `${p.nama_tampilan} (${p.role === 'admin' ? 'admin' : 'kasir'})`]));
	return statusKasbon(
		rows.map((r) => ({ id: r.id, waktu: r.waktu, jumlah: Number(r.jumlah), sumber: r.sumber, keterangan: r.keterangan, pencatat: (r.dicatat_oleh && nama.get(r.dicatat_oleh)) || '-' })),
		potong
	);
}
