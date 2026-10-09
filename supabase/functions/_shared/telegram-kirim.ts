// Putaran kirim antrean Telegram (tanpa Deno/Supabase agar bisa diuji; dependensi disuntikkan).
import type { HasilKirim } from './telegram.ts';

export interface PesanAntre {
	id: number;
	chat_id: number;
	topik: string;
	thread_id: number | null;
	teks: string;
}

export interface DepKirim {
	/** Ambil & pinjam pesan; kosong bila pengirim lain sedang jalan / masa jeda. */
	ambil(): Promise<PesanAntre[]>;
	hasil(id: number, h: HasilKirim): Promise<void>;
	topikHilang(topik: string): Promise<void>;
	selesai(): Promise<void>;
	kirim(p: PesanAntre): Promise<HasilKirim>;
	tunggu(ms: number): Promise<void>;
	sekarang(): number;
}

/** Batas satu pemanggilan (jauh di bawah masa pinjam 2 menit & batas waktu Edge Function). */
export const BATAS_MS = 45_000;
/** Jeda antar pesan: Telegram mengizinkan ±20 pesan/menit per grup. */
export const JEDA_MS = 3_000;

export const topikTerhapus = (galat: string) => /thread not found|TOPIC_DELETED|TOPIC_CLOSED/i.test(galat);

export async function kirimAntrean(d: DepKirim): Promise<{ terkirim: number; gagal: number }> {
	const mulai = d.sekarang();
	let terkirim = 0;
	let gagal = 0;
	try {
		while (d.sekarang() - mulai < BATAS_MS) {
			const daftar = await d.ambil();
			if (!daftar.length) break;
			for (const p of daftar) {
				// Waktu habis: sisa pinjaman diambil lagi oleh pemanggilan berikutnya setelah masa pinjam.
				if (d.sekarang() - mulai >= BATAS_MS) return { terkirim, gagal };
				const h = await d.kirim(p);
				await d.hasil(p.id, h);
				if (h.ok) terkirim++;
				else {
					gagal++;
					if (topikTerhapus(h.galat)) await d.topikHilang(p.topik);
					if (h.tundaDetik) return { terkirim, gagal };
				}
				await d.tunggu(JEDA_MS);
			}
		}
		return { terkirim, gagal };
	} finally {
		await d.selesai();
	}
}
