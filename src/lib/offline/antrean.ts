// Antrean kejadian kasir: dikirim berurutan, persis sekali (server idempoten per id).
import type { DbKasir, Kejadian } from './db.ts';

export class GalatKirim extends Error {
	constructor(
		pesan: string,
		/** true: jaringan/sesi bermasalah → berhenti & coba lagi nanti. false: ditolak server. */
		readonly jaringan: boolean
	) {
		super(pesan);
	}
}

export interface Pengirim {
	kirim(k: Kejadian): Promise<unknown>;
}

const TERTAHAN = 'Menunggu: buka toko untuk shift ini ditolak. Selesaikan itu dulu.';
const TERTAHAN_JUAL = 'Menunggu: transaksi yang dibatalkan ditolak server. Selesaikan transaksinya dulu.';

/** Batal atas transaksi yang ditolak server tidak dikirim (server belum punya transaksinya). */
async function jualDitolak(db: DbKasir, k: Kejadian): Promise<boolean> {
	if (k.jenis !== 'batal_jual') return false;
	const j = await db.kejadian.where('id').equals(String(k.data.penjualan_id ?? '')).first();
	return j?.jenis === 'jual' && j.status === 'ditolak';
}

export async function tambahKejadian(
	db: DbKasir,
	k: Pick<Kejadian, 'id' | 'jenis' | 'outlet_id' | 'shift_id' | 'waktu' | 'data'> & { user_id?: string | null }
): Promise<void> {
	// Id yang sama sudah ada (mis. Bayar diulang setelah galat): sudah tercatat, bukan galat.
	if (await db.kejadian.where('id').equals(k.id).count()) return;
	await db.kejadian.add({ ...k, status: 'menunggu', alasan: null, percobaan: 0, hasil: null, terkirim_at: null });
}

async function bukaDitolak(db: DbKasir, shiftId: string | null): Promise<boolean> {
	if (!shiftId) return false;
	return (await db.kejadian.where('shift_id').equals(shiftId).filter((x) => x.jenis === 'buka_shift' && x.status === 'ditolak').count()) > 0;
}

/** userId: bila diisi, hanya kejadian milik pengguna itu (atau tanpa pemilik) yang dikirim. */
export async function kirimAntrean(
	db: DbKasir,
	pengirim: Pengirim,
	userId?: string | null
): Promise<{ terkirim: number; ditolak: number; berhenti: 'selesai' | 'jaringan' }> {
	let terkirim = 0;
	let ditolak = 0;
	for (;;) {
		const k = (await db.kejadian.where('status').equals('menunggu').sortBy('urut')).find(
			(x) => !userId || !x.user_id || x.user_id === userId
		);
		if (!k) return { terkirim, ditolak, berhenti: 'selesai' };
		if (k.jenis !== 'buka_shift' && (await bukaDitolak(db, k.shift_id))) {
			await db.kejadian.update(k.urut!, { status: 'ditolak', alasan: TERTAHAN });
			ditolak++;
			continue;
		}
		if (await jualDitolak(db, k)) {
			await db.kejadian.update(k.urut!, { status: 'ditolak', alasan: TERTAHAN_JUAL });
			ditolak++;
			continue;
		}
		try {
			const hasil = await pengirim.kirim(k);
			await db.kejadian.update(k.urut!, { status: 'terkirim', hasil, terkirim_at: new Date().toISOString(), alasan: null });
			terkirim++;
		} catch (e) {
			const g = e instanceof GalatKirim ? e : new GalatKirim((e as Error)?.message ?? 'Galat', true);
			if (g.jaringan) {
				await db.kejadian.update(k.urut!, { percobaan: k.percobaan + 1 });
				return { terkirim, ditolak, berhenti: 'jaringan' };
			}
			await db.kejadian.update(k.urut!, { status: 'ditolak', alasan: g.message, percobaan: k.percobaan + 1 });
			ditolak++;
			if (k.jenis === 'buka_shift' && k.shift_id) {
				await db.kejadian
					.where('shift_id')
					.equals(k.shift_id)
					.filter((x) => x.status === 'menunggu')
					.modify({ status: 'ditolak', alasan: TERTAHAN });
			}
		}
	}
}

/** Kejadian ditolak dikirim ulang; bila buka toko, kejadian yang tertahan karenanya ikut dilepas. */
export async function cobaLagi(db: DbKasir, id: string): Promise<void> {
	const k = await db.kejadian.where('id').equals(id).first();
	if (!k || k.status !== 'ditolak') return;
	await db.kejadian.update(k.urut!, { status: 'menunggu', alasan: null });
	if (k.jenis === 'jual') {
		await db.kejadian
			.where('jenis')
			.equals('batal_jual')
			.filter((x) => x.status === 'ditolak' && x.alasan === TERTAHAN_JUAL && x.data.penjualan_id === k.id)
			.modify({ status: 'menunggu', alasan: null });
	}
	if (k.jenis === 'buka_shift' && k.shift_id) {
		await db.kejadian
			.where('shift_id')
			.equals(k.shift_id)
			.filter((x) => x.status === 'ditolak' && x.alasan === TERTAHAN)
			.modify({ status: 'menunggu', alasan: null });
	}
}

/** Kejadian ditolak yang diabaikan kasir (dengan alasan); dikembalikan untuk dilaporkan ke server. */
export async function abaikan(db: DbKasir, id: string, alasan: string): Promise<Kejadian | null> {
	const k = await db.kejadian.where('id').equals(id).first();
	if (!k || k.status !== 'ditolak') return null;
	await db.kejadian.update(k.urut!, { status: 'diabaikan', alasan: `${k.alasan ?? ''} | Diabaikan: ${alasan}` });
	return { ...k, status: 'diabaikan' };
}

/** userId diisi: hanya kejadian akun itu (atau tanpa pemilik) — milik akun lain tidak dikirim olehnya. */
export async function hitungAntrean(db: DbKasir, userId?: string | null): Promise<{ menunggu: number; ditolak: number }> {
	const milik = (k: Kejadian) => userId === undefined || !k.user_id || k.user_id === userId;
	return {
		menunggu: await db.kejadian.where('status').equals('menunggu').filter(milik).count(),
		ditolak: await db.kejadian.where('status').equals('ditolak').filter(milik).count()
	};
}

/** Ubah data kejadian yang belum terkirim (mis. menambah nomor sementara). */
export async function ubahDataMenunggu(db: DbKasir, id: string, patch: Record<string, unknown>): Promise<boolean> {
	const k = await db.kejadian.where('id').equals(id).first();
	if (!k || k.status !== 'menunggu') return false;
	await db.kejadian.update(k.urut!, { data: { ...k.data, ...patch } });
	return true;
}

/**
 * Hapus kejadian terkirim yang lama. Kejadian shift yang belum punya tutup toko di perangkat ini disimpan
 * (shift yang belum ditutup lintas hari tetap bisa ditampilkan/diringkas dari antrean). `sebelum` biasanya 3 hari lalu.
 */
export async function bersihkanTerkirim(db: DbKasir, sebelum: Date): Promise<void> {
	const semua = await db.kejadian.toArray();
	const ditutup = new Set<string>();
	for (const k of semua) {
		// Hanya tutup yang benar-benar sampai di server (yang menunggu/diabaikan belum menutup shift).
		if (k.jenis !== 'tutup_shift' || !k.shift_id || k.status !== 'terkirim') continue;
		ditutup.add(k.shift_id);
		// Shift gabungan: id perangkat & id server berarti shift yang sama.
		for (const b of semua) {
			if (b.jenis === 'buka_shift' && typeof b.hasil === 'string' && (b.shift_id === k.shift_id || b.hasil === k.shift_id)) {
				ditutup.add(b.shift_id!);
				ditutup.add(b.hasil);
			}
		}
	}
	await db.kejadian
		.where('status')
		.equals('terkirim')
		// Batas mutlak 14 hari: shift yang ditutup perangkat lain (tanpa tutup di sini) tidak menumpuk selamanya.
		.filter((x) => {
			if (!x.terkirim_at || new Date(x.terkirim_at) >= sebelum) return false;
			return !x.shift_id || ditutup.has(x.shift_id) || new Date(x.terkirim_at).getTime() < sebelum.getTime() - 11 * 86_400_000;
		})
		.delete();
}

/** Kejadian belum terkirim/ditolak milik akun lain di perangkat ini (tidak akan dikirim atas nama akun ini). */
export async function hitungMilikLain(db: DbKasir, userId: string | null): Promise<number> {
	return db.kejadian.filter((k) => (k.status === 'menunggu' || k.status === 'ditolak') && !!k.user_id && k.user_id !== userId).count();
}
