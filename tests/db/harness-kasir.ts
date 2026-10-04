import type { PGlite } from '@electric-sql/pglite';

export async function idOutlet(db: PGlite, kode: string): Promise<string> {
	return (await db.query<{ id: string }>('select id from public.outlets where kode = $1', [kode])).rows[0].id;
}
export async function idMenu(db: PGlite, kode: string): Promise<string> {
	return (await db.query<{ id: string }>('select id from public.menu where kode = $1', [kode])).rows[0].id;
}
/** Menyiapkan shift terbuka langsung (superuser) untuk tes yang tidak menguji buka_shift. */
export async function shiftLangsung(db: PGlite, outletKode: string, olehId: string, modal = 0): Promise<string> {
	const o = await idOutlet(db, outletKode);
	return (
		await db.query<{ id: string }>('insert into public.shift (outlet_id, dibuka_oleh, modal) values ($1, $2, $3) returning id', [o, olehId, modal])
	).rows[0].id;
}
