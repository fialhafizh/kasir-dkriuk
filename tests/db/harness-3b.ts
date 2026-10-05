import type { PGlite } from '@electric-sql/pglite';
import { sebagai } from './harness';
import { idOutlet } from './harness-kasir';
import { idBahan } from './harness-stok';

export async function rpc<T>(db: PGlite, oleh: string, sql: string, params: unknown[]): Promise<T> {
	return sebagai(db, oleh, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0].r);
}

export async function isian(db: PGlite, item: [string, number][]): Promise<{ bahan_id: string; qty: number }[]> {
	return Promise.all(item.map(async ([kode, qty]) => ({ bahan_id: await idBahan(db, kode), qty })));
}

/** Kasir mengajukan stok awal, admin langsung menyetujui. mundurJam: geser dihitung_at ke belakang. */
export async function setujuiStokAwal(db: PGlite, kasir: string, admin: string, outletKode: string, item: [string, number][], mundurJam = 0) {
	const id = await rpc<string>(db, kasir, 'public.ajukan_stok_awal($1, $2::jsonb)', [await idOutlet(db, outletKode), JSON.stringify(await isian(db, item))]);
	if (mundurJam) await db.query(`update public.stok_awal set dihitung_at = now() - make_interval(hours => $2::int) where id = $1`, [id, mundurJam]);
	await rpc(db, admin, 'public.putuskan_stok_awal($1, $2, $3::jsonb, $4)', [id, true, null, null]);
	return id;
}
