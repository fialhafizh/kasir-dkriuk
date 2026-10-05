import type { DbKasir, Salinan } from './db.ts';

export async function simpanSalinan(db: DbKasir, kunci: string, nilai: unknown): Promise<void> {
	await db.salinan.put({ kunci, nilai, disimpan_at: new Date().toISOString() });
}

export async function bacaSalinan<T>(db: DbKasir, kunci: string): Promise<T | null> {
	return ((await db.salinan.get(kunci))?.nilai as T | undefined) ?? null;
}

/** Ambil dari server dan simpan; bila jaringan putus pakai salinan terakhir. */
export async function denganSalinan<T>(
	db: DbKasir,
	kunci: string,
	ambil: () => Promise<T>,
	jaringan: (e: unknown) => boolean
): Promise<{ nilai: T; dariSalinan: boolean }> {
	try {
		const nilai = await ambil();
		try {
			await simpanSalinan(db, kunci, nilai);
		} catch {
			// Penyimpanan perangkat tidak tersedia (mis. diblokir browser): tetap pakai data server.
		}
		return { nilai, dariSalinan: false };
	} catch (e) {
		if (!jaringan(e)) throw e;
		let s: Salinan | undefined;
		try {
			s = await db.salinan.get(kunci);
		} catch {
			s = undefined;
		}
		if (!s) throw e;
		return { nilai: s.nilai as T, dariSalinan: true };
	}
}
