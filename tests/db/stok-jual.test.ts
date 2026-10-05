import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai } from './harness';
import { idMenu, idOutlet, shiftLangsung } from './harness-kasir';
import { stokBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let shiftBL: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	shiftBL = await shiftLangsung(db, 'BL', kasirBL);
});

async function rpc<T>(oleh: string, sql: string, params: unknown[]): Promise<T> {
	return sebagai(db, oleh, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0].r);
}
async function jual(item: [string, number][], id = crypto.randomUUID()): Promise<string> {
	const p = {
		id,
		outlet_id: await idOutlet(db, 'BL'),
		metode: 'qris',
		item: await Promise.all(item.map(async ([kode, qty]) => ({ menu_id: await idMenu(db, kode), qty })))
	};
	await rpc(kasirBL, 'public.catat_penjualan($1::jsonb)', [JSON.stringify(p)]);
	return id;
}
const batal = (oleh: string, id: string) => rpc(oleh, 'public.void_penjualan($1, $2)', [id, 'salah input']);
const stok = (kode: string) => stokBahan(db, 'BL', kode);

describe('potong stok saat jual', () => {
	it('memotong bahan sesuai resep: ayam, kulit + cup, nasi 0,1 kg + kertas, pelengkap', async () => {
		await jual([
			['ori_dada', 2],
			['kulit', 1],
			['nasi', 3],
			['kemasan_kecil', 1]
		]);
		expect(await stok('ori_dada')).toBe(-2);
		expect(await stok('kulit')).toBe(-1);
		expect(await stok('cup_kulit')).toBe(-1);
		expect(await stok('beras')).toBeCloseTo(-0.3, 4);
		expect(await stok('kertas_nasi')).toBe(-3);
		expect(await stok('kemasan_kecil')).toBe(-1);
		expect(await stok('hot_dada')).toBe(0);
	});

	it('satu baris jual per bahan per transaksi; waktu = waktu penjualan; oleh = kasir; outlet benar', async () => {
		const id = await jual([
			['ori_dada', 2],
			['kulit', 1]
		]);
		const { rows } = await db.query<{ n: number; sama_waktu: boolean; oleh: string; outlet: string }>(
			`select count(*)::int as n, bool_and(g.waktu = p.waktu) as sama_waktu, min(g.oleh::text) as oleh, min(o.kode) as outlet
			 from public.gerakan_stok g join public.penjualan p on p.id = g.penjualan_id join public.outlets o on o.id = g.outlet_id
			 where g.penjualan_id = $1 and g.jenis = 'jual'`,
			[id]
		);
		expect(rows[0]).toEqual({ n: 3, sama_waktu: true, oleh: kasirBL, outlet: 'BL' });
	});

	it('kiriman ulang dengan id sama tidak memotong dua kali', async () => {
		const id = crypto.randomUUID();
		await jual([['ori_dada', 1]], id);
		await jual([['ori_dada', 1]], id);
		expect(await stok('ori_dada')).toBe(-1);
	});

	it('bahan catat/analisis tidak pernah dipotong', async () => {
		await jual([
			['ori_dada', 1],
			['nasi', 1]
		]);
		expect(await stok('plastik_merah')).toBe(0);
		expect(await stok('tepung_dkriuk')).toBe(0);
		expect(await stok('minyak')).toBe(0);
	});
});

describe('kembalikan stok saat void', () => {
	it('void mengembalikan persis jumlah yang dipotong walau resep sudah diubah', async () => {
		const id = await jual([['nasi', 1]]);
		await db.query(
			`update public.resep set qty = 0.2
			 where menu_id = (select id from public.menu where kode = 'nasi') and bahan_id = (select id from public.bahan where kode = 'beras')`
		);
		await batal(kasirBL, id);
		expect(await stok('beras')).toBe(0);
		const { rows } = await db.query<{ qty: string }>(`select qty from public.gerakan_stok where penjualan_id = $1 and jenis = 'jual_batal' and bahan_id = (select id from public.bahan where kode = 'beras')`, [id]);
		expect(Number(rows[0].qty)).toBeCloseTo(0.1, 4);
	});

	it('void kedua ditolak dan stok tidak berubah lagi', async () => {
		const id = await jual([['ori_dada', 2]]);
		await batal(kasirBL, id);
		await expect(batal(kasirBL, id)).rejects.toThrow(/sudah dibatalkan/);
		expect(await stok('ori_dada')).toBe(0);
	});

	it('void admin setelah toko ditutup juga mengembalikan stok', async () => {
		const id = await jual([['ori_dada', 1]]);
		await rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [shiftBL, 0, null]);
		await batal(adminId, id);
		expect(await stok('ori_dada')).toBe(0);
	});

	it('penjualan tanpa baris jual (sebelum Tahap 3 terpasang) → void tidak menulis gerakan', async () => {
		const id = await jual([['ori_dada', 1]]);
		await db.query('delete from public.gerakan_stok where penjualan_id = $1', [id]);
		await batal(kasirBL, id);
		const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.gerakan_stok where penjualan_id = $1', [id]);
		expect(rows[0].n).toBe(0);
	});
});
