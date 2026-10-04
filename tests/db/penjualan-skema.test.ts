import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';
import { idMenu, idOutlet, shiftLangsung } from './harness-kasir';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
});

async function penjualanLangsung(outlet: string, shift: string, kasir: string, nomor: string) {
	const o = await idOutlet(db, outlet);
	const id = crypto.randomUUID();
	await db.query(
		`insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, metode, total) values ($1, $2, $3, $4, $5, 'qris', 11000)`,
		[id, o, shift, kasir, nomor]
	);
	await db.query(`insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty) values ($1, $2, 'Dada Ori', 11000, 1)`, [
		id,
		await idMenu(db, 'ori_dada')
	]);
	return id;
}

describe('skema penjualan', () => {
	it('tanggal_wib: 17:30 UTC = keesokan hari di WIB', async () => {
		const { rows } = await db.query<{ d: string }>(`select public.tanggal_wib('2026-10-04 17:30:00+00')::text as d`);
		expect(rows[0].d).toBe('2026-10-05');
	});

	it('hanya satu shift terbuka per outlet', async () => {
		await shiftLangsung(db, 'BL', kasirBL);
		await expect(shiftLangsung(db, 'BL', kasirBL)).rejects.toThrow(/shift_satu_terbuka/);
		await expect(shiftLangsung(db, 'TK', kasirTK)).resolves.toBeTruthy();
	});

	it('subtotal dihitung database', async () => {
		const s = await shiftLangsung(db, 'BL', kasirBL);
		const p = await penjualanLangsung('BL', s, kasirBL, 'BL-261005-001');
		await db.query('update public.penjualan_item set qty = 3 where penjualan_id = $1', [p]);
		const { rows } = await db.query<{ subtotal: number }>('select subtotal from public.penjualan_item where penjualan_id = $1', [p]);
		expect(rows[0].subtotal).toBe(33000);
	});

	it('cash wajib mencatat uang diterima ≥ total', async () => {
		const s = await shiftLangsung(db, 'BL', kasirBL);
		const o = await idOutlet(db, 'BL');
		await expect(
			db.query(
				`insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, metode, total, diterima, kembalian) values ($1, $2, $3, $4, 'BL-X', 'cash', 11000, 10000, 0)`,
				[crypto.randomUUID(), o, s, kasirBL]
			)
		).rejects.toThrow(/penjualan_cash/);
	});
});

describe('RLS baca penjualan', () => {
	it('kasir hanya melihat shift & penjualan outletnya; admin semua', async () => {
		const sBL = await shiftLangsung(db, 'BL', kasirBL);
		const sTK = await shiftLangsung(db, 'TK', kasirTK);
		await penjualanLangsung('BL', sBL, kasirBL, 'BL-261005-001');
		await penjualanLangsung('TK', sTK, kasirTK, 'TK-261005-001');
		const bl = await sebagai(db, kasirBL, async () => [
			(await db.query('select 1 from public.shift')).rows.length,
			(await db.query<{ nomor: string }>('select nomor from public.penjualan')).rows.map((r) => r.nomor),
			(await db.query('select 1 from public.penjualan_item')).rows.length
		]);
		expect(bl).toEqual([1, ['BL-261005-001'], 1]);
		const adm = await sebagai(db, adminId, async () => (await db.query('select 1 from public.penjualan')).rows.length);
		expect(adm).toBe(2);
	});

	it('tidak ada yang bisa menulis langsung (hanya lewat fungsi)', async () => {
		const s = await shiftLangsung(db, 'BL', kasirBL);
		await expect(sebagai(db, kasirBL, () => db.query('update public.shift set modal = 1 where id = $1', [s]))).rejects.toThrow(
			/permission denied/
		);
		await expect(sebagai(db, adminId, () => db.query('delete from public.shift where id = $1', [s]))).rejects.toThrow(/permission denied/);
		await expect(sebagai(db, kasirBL, () => db.query('select 1 from public.nomor_harian'))).rejects.toThrow(/permission denied/);
	});

	it('pengunjung tanpa login tidak punya izin', async () => {
		await expect(sebagaiAnon(db, () => db.query('select 1 from public.penjualan'))).rejects.toThrow(/permission denied/);
	});

	it('menu yang sudah terjual tidak bisa dihapus (riwayat aman)', async () => {
		const s = await shiftLangsung(db, 'BL', kasirBL);
		await penjualanLangsung('BL', s, kasirBL, 'BL-261005-001');
		await expect(db.query(`delete from public.menu where kode = 'ori_dada'`)).rejects.toThrow(/penjualan_item_menu_id_fkey/);
	});
});
