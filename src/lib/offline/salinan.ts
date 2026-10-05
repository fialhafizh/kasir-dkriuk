import type { DbKasir } from './db.ts';

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
		await simpanSalinan(db, kunci, nilai);
		return { nilai, dariSalinan: false };
	} catch (e) {
		if (!jaringan(e)) throw e;
		const s = await db.salinan.get(kunci);
		if (!s) throw e;
		return { nilai: s.nilai as T, dariSalinan: true };
	}
}
