import type { PGlite } from '@electric-sql/pglite';

export async function idBahan(db: PGlite, kode: string): Promise<string> {
	return (await db.query<{ id: string }>('select id from public.bahan where kode = $1', [kode])).rows[0].id;
}
export async function idSatuan(db: PGlite, kode: string): Promise<string> {
	return (await db.query<{ id: string }>('select id from public.satuan_beli where kode = $1', [kode])).rows[0].id;
}
/** Stok satu bahan di satu outlet langsung dari buku besar (superuser, tanpa RLS). */
export async function stokBahan(db: PGlite, outletKode: string, bahanKode: string): Promise<number> {
	const r = await db.query<{ qty: string | null }>(
		`select sum(g.qty) as qty from public.gerakan_stok g
		 join public.outlets o on o.id = g.outlet_id join public.bahan b on b.id = g.bahan_id
		 where o.kode = $1 and b.kode = $2`,
		[outletKode, bahanKode]
	);
	return Number(r.rows[0].qty ?? 0);
}
