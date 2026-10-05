import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';
import { rpc } from './harness-3b';
import { idMenu, idOutlet } from './harness-kasir';
import { stokBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;
const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
});

describe('skema offline', () => {
	it('anon tidak bisa membaca tabel baru; kasir tidak bisa menulis langsung', async () => {
		for (const t of ['perangkat', 'shift_perangkat']) {
			await expect(sebagaiAnon(db, () => db.query(`select * from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for table ${t}`));
			await expect(sebagai(db, kasirBL, () => db.query(`delete from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for table ${t}`));
		}
	});
	it('penjualan bertanda tanpa_stok tidak memotong stok', async () => {
		const bl = await idOutlet(db, 'BL');
		const s = (await db.query<{ id: string }>(`insert into public.shift (outlet_id, dibuka_oleh, modal) values ($1, $2, 0) returning id`, [bl, kasirBL])).rows[0].id;
		const p = crypto.randomUUID();
		await db.query(
			`insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, metode, total, tanpa_stok) values ($1, $2, $3, $4, 'BL-X', now(), 'qris', 1, true)`,
			[p, bl, s, kasirBL]
		);
		await db.query(`insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty) values ($1, $2, 'Dada', 1, 2)`, [p, await idMenu(db, 'ori_dada')]);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(0);
	});
	it('kode struk unik dan berformat 6 karakter', async () => {
		const bl = await idOutlet(db, 'BL');
		const s = (await db.query<{ id: string }>(`insert into public.shift (outlet_id, dibuka_oleh, modal) values ($1, $2, 0) returning id`, [bl, kasirBL])).rows[0].id;
		await expect(
			db.query(`insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, metode, total, kode_struk) values (gen_random_uuid(), $1, $2, $3, 'BL-Y', now(), 'qris', 1, 'abc')`, [bl, s, kasirBL])
		).rejects.toThrow(/penjualan_kode_struk_check/);
	});
});

export { P1, P2, adminId, kasirTK, rpc };
