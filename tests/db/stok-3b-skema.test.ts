import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';
import { idOutlet } from './harness-kasir';
import { idBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;
let kasirKP: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
	kasirKP = await buatUser(db, { username: 'kasir.kertapati', role: 'kasir', outlet_kode: 'KP' });
});

const baca = <T>(oleh: string, sql: string, params: unknown[] = []) => sebagai(db, oleh, async () => (await db.query<T>(sql, params)).rows);

async function transferLangsung(status: 'dikirim' | 'diterima'): Promise<string> {
	const id = crypto.randomUUID();
	const [bl, tk] = [await idOutlet(db, 'BL'), await idOutlet(db, 'TK')];
	await db.query(
		`insert into public.transfer (id, dari_outlet_id, ke_outlet_id, status, diterima_at) values ($1, $2, $3, $4::public.status_transfer, case when $4::text = 'diterima' then now() end)`,
		[id, bl, tk, status]
	);
	await db.query('insert into public.transfer_item (transfer_id, bahan_id, qty) values ($1, $2, 18)', [id, await idBahan(db, 'ori_dada')]);
	return id;
}

describe('hitung buta transfer', () => {
	it('outlet tujuan tidak bisa membaca item selama dikirim; pengirim & admin bisa', async () => {
		const id = await transferLangsung('dikirim');
		expect(await baca(kasirTK, 'select * from public.transfer where id = $1', [id])).toHaveLength(1);
		expect(await baca(kasirTK, 'select * from public.transfer_item where transfer_id = $1', [id])).toHaveLength(0);
		expect(await baca(kasirBL, 'select * from public.transfer_item where transfer_id = $1', [id])).toHaveLength(1);
		expect(await baca(adminId, 'select * from public.transfer_item where transfer_id = $1', [id])).toHaveLength(1);
	});
	it('setelah diterima, outlet tujuan bisa membaca item; outlet lain tidak melihat transfer sama sekali', async () => {
		const id = await transferLangsung('diterima');
		expect(await baca(kasirTK, 'select * from public.transfer_item where transfer_id = $1', [id])).toHaveLength(1);
		expect(await baca(kasirKP, 'select * from public.transfer where id = $1', [id])).toHaveLength(0);
	});
});

describe('hak akses tabel 3b', () => {
	it('opname_item (berisi angka sistem) hanya admin; kepala opname terbaca kasir outletnya', async () => {
		const bl = await idOutlet(db, 'BL');
		const op = (await db.query<{ id: string }>(`insert into public.opname (outlet_id) values ($1) returning id`, [bl])).rows[0].id;
		await db.query('insert into public.opname_item (opname_id, bahan_id, qty_hitung) values ($1, $2, 5)', [op, await idBahan(db, 'ori_dada')]);
		expect(await baca(kasirBL, 'select id from public.opname')).toHaveLength(1);
		expect(await baca(kasirTK, 'select id from public.opname')).toHaveLength(0);
		expect(await baca(kasirBL, 'select * from public.opname_item')).toHaveLength(0);
		expect(await baca(adminId, 'select * from public.opname_item')).toHaveLength(1);
	});
	it('rusak terbaca outlet sendiri saja', async () => {
		const bl = await idOutlet(db, 'BL');
		await db.query(`insert into public.rusak (id, outlet_id, alasan) values (gen_random_uuid(), $1, 'gosong')`, [bl]);
		expect(await baca(kasirBL, 'select id from public.rusak')).toHaveLength(1);
		expect(await baca(kasirTK, 'select id from public.rusak')).toHaveLength(0);
	});
	it.each(['rusak', 'rusak_item', 'transfer', 'transfer_item', 'opname', 'opname_item'])('anon tidak bisa membaca %s; login tidak bisa menulis', async (t) => {
		await expect(sebagaiAnon(db, () => db.query(`select * from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for table ${t}`));
		await expect(sebagai(db, adminId, () => db.query(`delete from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for table ${t}`));
	});
});

describe('aturan tabel', () => {
	it('transfer ke outlet yang sama ditolak; rusak lainnya tanpa catatan ditolak; gerakan rusak wajib sumber', async () => {
		const bl = await idOutlet(db, 'BL');
		await expect(db.query(`insert into public.transfer (id, dari_outlet_id, ke_outlet_id) values (gen_random_uuid(), $1, $1)`, [bl])).rejects.toThrow(/transfer_beda_outlet/);
		await expect(db.query(`insert into public.rusak (id, outlet_id, alasan) values (gen_random_uuid(), $1, 'lainnya')`, [bl])).rejects.toThrow(/rusak_lainnya_bercatatan/);
		await expect(
			db.query(`insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu) values ($1, $2, -1, 'rusak', now())`, [bl, await idBahan(db, 'ori_dada')])
		).rejects.toThrow(/gerakan_sumber_rusak/);
	});
});
