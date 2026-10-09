// Admin → Telegram (Tahap 6): status & pengaturan notifikasi, hubungkan grup, pesan uji.
import { bacaGalatFungsi } from '#lib/akun/galat.ts';
import { pesanKasir } from '#lib/kasir/pesan.ts';
import { supabase } from '#lib/supabase/client.ts';

// Pesan resmi fungsi SQL Telegram (migrasi 0028); hanya ini yang diteruskan apa adanya.
const PESAN_TELEGRAM = /^(Hanya admin yang boleh mengatur Telegram|Jam ringkasan harian tidak valid|Batas pengeluaran tidak valid|Jenis pesan tidak dikenal)/;

type Galat = { code?: string; message?: string; status?: number; name?: string } | null;

export function pesanTelegram(err: Galat): string | null {
	if (!err) return null;
	const msg = err.message ?? '';
	if ((err.code === '22023' || err.code === '42501') && PESAN_TELEGRAM.test(msg)) return `${msg}.`;
	return pesanKasir(err);
}

function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanTelegram(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}

/** Jenis pesan yang bisa dimatikan, dikelompokkan per topik grup. */
export const KELOMPOK_JENIS: { topik: string; jenis: { kunci: string; label: string }[] }[] = [
	{ topik: '🧾 Struk', jenis: [{ kunci: 'struk', label: 'Struk setiap transaksi' }] },
	{
		topik: '🏪 Tutup toko & harian',
		jenis: [
			{ kunci: 'tutup', label: 'Ringkasan tutup toko' },
			{ kunci: 'harian', label: 'Ringkasan harian semua outlet' }
		]
	},
	{
		topik: '⚠️ Peringatan',
		jenis: [
			{ kunci: 'batal', label: 'Batal transaksi' },
			{ kunci: 'selisih_kas', label: 'Selisih kas saat tutup toko' },
			{ kunci: 'selisih_setoran', label: 'Selisih setoran' },
			{ kunci: 'stok', label: 'Stok menipis / minus' },
			{ kunci: 'opname', label: 'Opname & stok awal menunggu persetujuan' },
			{ kunci: 'ditolak', label: 'Data kasir ditolak server' },
			{ kunci: 'diabaikan', label: 'Data diabaikan kasir' }
		]
	},
	{
		topik: '💰 Kas',
		jenis: [
			{ kunci: 'setoran', label: 'Setoran dicatat & diterima' },
			{ kunci: 'kasbon', label: 'Kasbon' },
			{ kunci: 'pengeluaran', label: 'Pengeluaran laci di atas batas' }
		]
	}
];

export interface PesanGagal {
	id: number;
	jenis: string;
	dibuat_at: string;
	galat: string | null;
	cuplikan: string;
}

export interface StatusTelegram {
	terhubung: boolean;
	chat_judul: string | null;
	topik_lengkap: boolean;
	jam_harian: string;
	batas_pengeluaran: number;
	jenis_mati: string[];
	harian_terakhir: string | null;
	menunggu: number;
	terkirim_terakhir: string | null;
	gagal: PesanGagal[];
}

export interface PengaturanTelegram {
	jam_harian: string;
	batas_pengeluaran: number;
	jenis_mati: string[];
}

/** Teks HTML Telegram → teks biasa untuk cuplikan di layar admin. */
export function teksPolos(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&');
}

export async function muatStatus(): Promise<StatusTelegram> {
	return periksa(await supabase.rpc('telegram_status')) as StatusTelegram;
}
export async function simpanPengaturan(p: PengaturanTelegram): Promise<void> {
	periksa(await supabase.rpc('simpan_telegram', { p }));
}
export async function kirimUlang(id: number | null): Promise<number> {
	return periksa(await supabase.rpc('kirim_ulang_telegram', { p_id: id })) as number;
}

async function panggil<T>(body: object): Promise<T> {
	const { data, error } = await supabase.functions.invoke('telegram', { body });
	if (!error) return data as T;
	throw new Error(await bacaGalatFungsi(error));
}
export type HasilHubungkan = { ok: true; judul: string } | { ok: false; pilih: { chat_id: number; judul: string }[] };
export function hubungkanGrup(chatId?: number): Promise<HasilHubungkan> {
	return panggil({ aksi: 'hubungkan', ...(chatId !== undefined ? { chat_id: chatId } : {}) });
}
export function kirimUji(): Promise<{ ok: boolean; hasil: { topik: string; ok: boolean; galat?: string }[] }> {
	return panggil({ aksi: 'uji' });
}
