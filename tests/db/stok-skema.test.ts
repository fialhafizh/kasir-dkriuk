import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';
import { idMenu, idOutlet, shiftLangsung } from './harness-kasir';
import { idBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
	await shiftLangsung(db, 'BL', kasirBL);
	await shiftLangsung(db, 'TK', kasirTK);
});

async function jual(oleh: string, outletKode: string, menuKode: string, qty = 1): Promise<void> {
	const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, outletKode), metode: 'qris', item: [{ menu_id: await idMenu(db, menuKode), qty }] };
	await sebagai(db, oleh, () => db.query('select public.catat_penjualan($1::jsonb)', [JSON.stringify(p)]));
}
const sebagaiQuery = <T>(oleh: string, sql: string, params: unknown[] = []) =>
	sebagai(db, oleh, async () => (await db.query<T>(sql, params)).rows);

const TABEL = ['gerakan_stok', 'barang_masuk', 'barang_masuk_item', 'stok_awal', 'stok_awal_item', 'stok_outlet'];

describe('hak akses stok', () => {
	it('pengguna login (admin sekalipun) tidak bisa menulis buku besar langsung', async () => {
		const bl = await idOutlet(db, 'BL');
		const dada = await idBahan(db, 'ori_dada');
		await expect(
			sebagai(db, adminId, () =>
				db.query(`insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu) values ($1, $2, 1, 'awal', now())`, [bl, dada])
			)
		).rejects.toThrow(/permission denied for table gerakan_stok/);
	});

	it('kasir tidak bisa menyisipkan item penjualan langsung (jalur satu-satunya ke trigger potong stok)', async () => {
		await jual(kasirBL, 'BL', 'ori_dada');
		const pid = (await db.query<{ id: string }>('select id from public.penjualan limit 1')).rows[0].id;
		await expect(
			sebagai(db, kasirBL, async () =>
				db.query(`insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty) values ($1, $2, 'x', 1, 1)`, [pid, await idMenu(db, 'kulit')])
			)
		).rejects.toThrow(/permission denied for table penjualan_item/);
	});

	it('kasir hanya membaca gerakan outletnya sendiri', async () => {
		await jual(kasirBL, 'BL', 'ori_dada');
		await jual(kasirTK, 'TK', 'ori_dada');
		const rows = await sebagaiQuery<{ outlet_id: string }>(kasirBL, 'select outlet_id from public.gerakan_stok');
		expect(rows.length).toBeGreaterThan(0);
		expect(new Set(rows.map((r) => r.outlet_id))).toEqual(new Set([await idOutlet(db, 'BL')]));
	});

	it('stok_outlet: kasir melihat outletnya saja, admin ketiga outlet', async () => {
		await jual(kasirBL, 'BL', 'ori_dada', 2);
		const bl = await idOutlet(db, 'BL');
		const dada = await idBahan(db, 'ori_dada');
		const k = await sebagaiQuery<{ outlet_id: string; bahan_id: string; qty: string }>(kasirBL, 'select outlet_id, bahan_id, qty from public.stok_outlet');
		expect(new Set(k.map((r) => r.outlet_id))).toEqual(new Set([bl]));
		expect(Number(k.find((r) => r.bahan_id === dada)!.qty)).toBe(-2);
		const a = await sebagaiQuery<{ outlet_id: string }>(adminId, 'select distinct outlet_id from public.stok_outlet');
		expect(a).toHaveLength(3);
	});

	it('stok_outlet berisi 0 untuk bahan aktif tanpa gerakan dan menyembunyikan bahan nonaktif', async () => {
		await db.query(`update public.bahan set aktif = false where kode = 'plastik_merah'`);
		const aktif = (await db.query<{ n: number }>('select count(*)::int as n from public.bahan where aktif')).rows[0].n;
		const rows = await sebagaiQuery<{ qty: string }>(kasirBL, 'select qty from public.stok_outlet');
		expect(rows).toHaveLength(aktif);
		expect(rows.every((r) => Number(r.qty) === 0)).toBe(true);
	});

	it('kasir tidak bisa membaca barang masuk (berisi harga beli); admin bisa', async () => {
		const bl = await idOutlet(db, 'BL');
		await db.query(`insert into public.barang_masuk (id, outlet_id, tanggal, waktu, total) values (gen_random_uuid(), $1, current_date, now(), 1000)`, [bl]);
		expect(await sebagaiQuery(kasirBL, 'select id from public.barang_masuk')).toHaveLength(0);
		expect(await sebagaiQuery(adminId, 'select id from public.barang_masuk')).toHaveLength(1);
	});

	it.each(TABEL)('anon tidak bisa membaca %s', async (t) => {
		await expect(sebagaiAnon(db, () => db.query(`select * from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for (table|view) ${t}`));
	});
});

describe('aturan buku besar', () => {
	it('baris jual tanpa penjualan ditolak; jumlah 0 ditolak', async () => {
		const bl = await idOutlet(db, 'BL');
		const dada = await idBahan(db, 'ori_dada');
		await expect(
			db.query(`insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu) values ($1, $2, -1, 'jual', now())`, [bl, dada])
		).rejects.toThrow(/gerakan_sumber_jual/);
		await jual(kasirBL, 'BL', 'ori_dada');
		const pid = (await db.query<{ id: string }>('select id from public.penjualan limit 1')).rows[0].id;
		await expect(
			db.query(`insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, penjualan_id) values ($1, $2, 0, 'jual', now(), $3)`, [bl, dada, pid])
		).rejects.toThrow(/gerakan_stok_qty_check/);
	});
});
