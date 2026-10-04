import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai } from './harness';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin', nama_tampilan: 'Owner' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
});

describe('seed outlet', () => {
	it('berisi tiga outlet dengan merek yang benar', async () => {
		const { rows } = await db.query<{ kode: string; merek: string; nama: string }>(
			'select kode, merek, nama from public.outlets order by kode'
		);
		expect(rows).toEqual([
			{ kode: 'BL', merek: "D'Kriuk", nama: 'Bukit Lama' },
			{ kode: 'KP', merek: "D'Krizzpy", nama: 'Kertapati' },
			{ kode: 'TK', merek: "D'Kriuk", nama: 'Talang Kerangga' }
		]);
	});
});

describe('trigger profil', () => {
	it('membuat profil kasir yang terikat ke outlet', async () => {
		const { rows } = await db.query<{ username: string; role: string; kode: string }>(
			`select p.username, p.role, o.kode from public.profiles p join public.outlets o on o.id = p.outlet_id where p.id = $1`,
			[kasirBL]
		);
		expect(rows).toEqual([{ username: 'kasir.bukitlama', role: 'kasir', kode: 'BL' }]);
	});

	it('nama_tampilan default ke username', async () => {
		const { rows } = await db.query<{ nama_tampilan: string }>('select nama_tampilan from public.profiles where id = $1', [kasirBL]);
		expect(rows[0].nama_tampilan).toBe('kasir.bukitlama');
	});

	it('menolak kasir tanpa outlet', async () => {
		await expect(buatUser(db, { username: 'kasir.tanpaoutlet', role: 'kasir' })).rejects.toThrow();
	});

	it('menolak username dengan huruf besar', async () => {
		await expect(buatUser(db, { username: 'Kasir.Besar', role: 'admin' })).rejects.toThrow();
	});

	it('menolak username yang bukan alamat email sah (titik ganda/di tepi)', async () => {
		await expect(buatUser(db, { username: 'a..b', role: 'admin' })).rejects.toThrow();
		await expect(buatUser(db, { username: '.abc', role: 'admin' })).rejects.toThrow();
		await expect(buatUser(db, { username: 'abc.', role: 'admin' })).rejects.toThrow();
	});

	it('pola username di database sama dengan validasi aplikasi', async () => {
		const { USERNAME_PATTERN } = await import('../../src/lib/auth/username');
		const { rows } = await db.query<{ def: string }>(
			`select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_username_check'`
		);
		expect(rows[0].def).toContain(USERNAME_PATTERN);
	});
});

describe('RLS profiles', () => {
	it('kasir hanya melihat profilnya sendiri', async () => {
		const rows = await sebagai(db, kasirBL, async () => (await db.query<{ id: string }>('select id from public.profiles')).rows);
		expect(rows.map((r) => r.id)).toEqual([kasirBL]);
	});

	it('admin melihat semua profil', async () => {
		const rows = await sebagai(db, adminId, async () => (await db.query('select id from public.profiles')).rows);
		expect(rows).toHaveLength(3);
	});

	it('kasir tidak bisa menaikkan perannya menjadi admin', async () => {
		await sebagai(db, kasirBL, async () => {
			await db.query(`update public.profiles set role = 'admin' where id = $1`, [kasirBL]);
		});
		const { rows } = await db.query<{ role: string }>('select role from public.profiles where id = $1', [kasirBL]);
		expect(rows[0].role).toBe('kasir');
	});

	it('admin bisa menonaktifkan kasir', async () => {
		await sebagai(db, adminId, async () => {
			await db.query('update public.profiles set aktif = false where id = $1', [kasirTK]);
		});
		const { rows } = await db.query<{ aktif: boolean }>('select aktif from public.profiles where id = $1', [kasirTK]);
		expect(rows[0].aktif).toBe(false);
	});
});

describe('RLS outlets', () => {
	it('kasir bisa membaca semua outlet (untuk transfer stok nanti)', async () => {
		const rows = await sebagai(db, kasirBL, async () => (await db.query('select id from public.outlets')).rows);
		expect(rows).toHaveLength(3);
	});

	it('kasir tidak bisa mengubah outlet', async () => {
		await sebagai(db, kasirBL, async () => {
			await db.query(`update public.outlets set nama = 'Diretas' where kode = 'BL'`);
		});
		const { rows } = await db.query<{ nama: string }>(`select nama from public.outlets where kode = 'BL'`);
		expect(rows[0].nama).toBe('Bukit Lama');
	});

	it('admin bisa mengubah outlet', async () => {
		await sebagai(db, adminId, async () => {
			await db.query(`update public.outlets set telepon = '+62 800' where kode = 'KP'`);
		});
		const { rows } = await db.query<{ telepon: string }>(`select telepon from public.outlets where kode = 'KP'`);
		expect(rows[0].telepon).toBe('+62 800');
	});
});

describe('fungsi bantu', () => {
	it('is_admin benar untuk admin aktif, salah untuk kasir', async () => {
		const a = await sebagai(db, adminId, async () => (await db.query<{ v: boolean }>('select public.is_admin() as v')).rows[0].v);
		const k = await sebagai(db, kasirBL, async () => (await db.query<{ v: boolean }>('select public.is_admin() as v')).rows[0].v);
		expect(a).toBe(true);
		expect(k).toBe(false);
	});

	it('is_admin salah bila admin dinonaktifkan', async () => {
		await db.query('update public.profiles set aktif = false where id = $1', [adminId]);
		const a = await sebagai(db, adminId, async () => (await db.query<{ v: boolean }>('select public.is_admin() as v')).rows[0].v);
		expect(a).toBe(false);
	});

	it('my_outlet_id mengembalikan outlet kasir', async () => {
		const id = await sebagai(db, kasirTK, async () => (await db.query<{ v: string }>('select public.my_outlet_id() as v')).rows[0].v);
		const { rows } = await db.query<{ id: string }>(`select id from public.outlets where kode = 'TK'`);
		expect(id).toBe(rows[0].id);
	});
});
