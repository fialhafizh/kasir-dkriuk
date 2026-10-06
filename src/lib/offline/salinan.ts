import type { DbKasir, Salinan } from './db.ts';

export async function simpanSalinan(db: DbKasir, kunci: string, nilai: unknown, disimpanAt = new Date().toISOString()): Promise<void> {
	await db.salinan.put({ kunci, nilai, disimpan_at: disimpanAt });
}

export async function bacaSalinan<T>(db: DbKasir, kunci: string): Promise<T | null> {
	return ((await db.salinan.get(kunci))?.nilai as T | undefined) ?? null;
}

/**
 * Ambil dari server dan simpan; bila jaringan putus pakai salinan terakhir. disimpanAt = jam data itu
 * diambil dari server (awal permintaan), untuk menentukan kejadian antrean mana yang belum tercermin.
 */
export async function denganSalinan<T>(
	db: DbKasir,
	kunci: string,
	ambil: () => Promise<T>,
	jaringan: (e: unknown) => boolean
): Promise<{ nilai: T; dariSalinan: boolean; disimpanAt: string }> {
	const mulai = new Date().toISOString();
	try {
		const nilai = await ambil();
		try {
			await simpanSalinan(db, kunci, nilai, mulai);
		} catch {
			// Penyimpanan perangkat tidak tersedia (mis. diblokir browser): tetap pakai data server.
		}
		return { nilai, dariSalinan: false, disimpanAt: mulai };
	} catch (e) {
		if (!jaringan(e)) throw e;
		let s: Salinan | undefined;
		try {
			s = await db.salinan.get(kunci);
		} catch {
			s = undefined;
		}
		if (!s) throw e;
		return { nilai: s.nilai as T, dariSalinan: true, disimpanAt: s.disimpan_at };
	}
}
