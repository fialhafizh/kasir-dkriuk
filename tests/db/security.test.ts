import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';

// Kasus "tidak boleh": tidak ada kebocoran data dan tidak ada kenaikan hak akses.
let db: PGlite;
let adminId: string;
let kasirBL: string;

async function jumlah(sql: string): Promise<number> {
	const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`);
	return rows[0].n;
}

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
});

describe('pembuatan akun', () => {
	it('peran dari user_metadata (bisa diubah pengguna) diabaikan', async () => {
		const sebelum = await jumlah('auth.users');
		await expect(
			db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
				crypto.randomUUID(),
				'penyusup@test.local',
				JSON.stringify({ username: 'penyusup', role: 'admin' })
			])
		).rejects.toThrow();
		expect(await jumlah('auth.users')).toBe(sebelum);
		expect(await jumlah(`public.profiles where username = 'penyusup'`)).toBe(0);
	});

	it('kode outlet tak dikenal ditolak tanpa meninggalkan akun yatim', async () => {
		const sebelum = await jumlah('auth.users');
		await expect(buatUser(db, { username: 'kasir.xx', role: 'kasir', outlet_kode: 'XX' })).rejects.toThrow();
		expect(await jumlah('auth.users')).toBe(sebelum);
	});
});

describe('pengunjung tanpa login (anon)', () => {
	it('tidak melihat outlet maupun profil', async () => {
		const [o, p] = await sebagaiAnon(db, async () => [
			(await db.query('select 1 from public.outlets')).rows.length,
			(await db.query('select 1 from public.profiles')).rows.length
		]);
		expect(o).toBe(0);
		expect(p).toBe(0);
	});

	it('tidak bisa menambah outlet', async () => {
		await expect(
			sebagaiAnon(db, () =>
				db.query(`insert into public.outlets (kode, nama, merek, alamat, telepon) values ('ZZ','x','x','x','x')`)
			)
		).rejects.toThrow();
	});

	it('tidak bisa memanggil fungsi is_admin', async () => {
		await expect(sebagaiAnon(db, () => db.query('select public.is_admin()'))).rejects.toThrow(/permission denied/);
	});
});

describe('kasir', () => {
	it('tidak bisa menambah profil', async () => {
		await expect(
			sebagai(db, kasirBL, () =>
				db.query(`insert into public.profiles (id, username, nama_tampilan, role) values ($1, 'boneka', 'b', 'admin')`, [
					crypto.randomUUID()
				])
			)
		).rejects.toThrow();
	});

	it('tidak bisa menghapus profil maupun outlet', async () => {
		await sebagai(db, kasirBL, async () => {
			await db.query('delete from public.profiles');
			await db.query('delete from public.outlets');
		});
		expect(await jumlah('public.profiles')).toBe(2);
		expect(await jumlah('public.outlets')).toBe(3);
	});

	it('tidak bisa memindah outlet atau mengaktifkan ulang dirinya', async () => {
		await sebagai(db, kasirBL, () =>
			db.query(`update public.profiles set outlet_id = (select id from public.outlets where kode = 'TK'), aktif = true where id = $1`, [
				kasirBL
			])
		);
		const { rows } = await db.query<{ kode: string }>(
			'select o.kode from public.profiles p join public.outlets o on o.id = p.outlet_id where p.id = $1',
			[kasirBL]
		);
		expect(rows[0].kode).toBe('BL');
	});

	it('tidak bisa memanggil fungsi trigger secara langsung', async () => {
		await expect(sebagai(db, kasirBL, () => db.query('select public.handle_new_user()'))).rejects.toThrow(/permission denied/);
	});

	it('my_outlet_id kosong bila kasir dinonaktifkan', async () => {
		await db.query('update public.profiles set aktif = false where id = $1', [kasirBL]);
		const v = await sebagai(db, kasirBL, async () => (await db.query<{ v: string | null }>('select public.my_outlet_id() as v')).rows[0].v);
		expect(v).toBeNull();
	});
});

describe('struktur aturan akses', () => {
	it('outlet tidak memakai kebijakan FOR ALL yang tumpang tindih dengan SELECT', async () => {
		expect(await jumlah(`pg_policies where tablename = 'outlets' and cmd = 'ALL'`)).toBe(0);
	});

	it('admin tetap bisa menambah dan menghapus outlet', async () => {
		await sebagai(db, adminId, async () => {
			await db.query(`insert into public.outlets (kode, nama, merek, alamat, telepon) values ('ZZ','Uji','x','x','x')`);
			await db.query(`delete from public.outlets where kode = 'ZZ'`);
		});
		expect(await jumlah(`public.outlets where kode = 'ZZ'`)).toBe(0);
	});
});
