import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';
import { idOutlet } from './harness-kasir';

// Tahap 8: pemeriksaan menyeluruh hak akses atas SEMUA tabel & fungsi di skema public.
let db: PGlite;
let kasirBL: string;

beforeAll(async () => {
	db = await freshDb();
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	await buatUser(db, { username: 'admin', role: 'admin' });
	// data contoh di tabel khusus admin (superuser)
	const bl = await idOutlet(db, 'BL');
	await db.query(`insert into public.harga_beli (outlet_id, satuan_beli_id, harga) select $1, id, 4321 from public.satuan_beli limit 1`, [bl]);
	await db.query(`insert into public.karyawan (outlet_id, nama, upah_harian) values ($1, 'Uji', 4321)`, [bl]);
	await db.query(`update public.telegram_pengaturan set chat_id = -1`);
});

const tabel = async () => (await db.query<{ t: string }>(`select tablename as t from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.t);
async function baris(fn: (f: () => Promise<unknown>) => Promise<unknown>, t: string): Promise<number | 'ditolak'> {
	try {
		return (await fn(() => db.query(`select count(*)::int as n from public.${t}`)) as { rows: { n: number }[] }).rows[0].n;
	} catch {
		return 'ditolak';
	}
}

describe('keamanan menyeluruh', () => {
	it('pengunjung tanpa login tidak bisa membaca satu tabel pun', async () => {
		for (const t of await tabel()) expect([t, await baris((f) => sebagaiAnon(db, f), t)]).toEqual([t, expect.toSatisfy((v) => v === 'ditolak' || v === 0)]);
	});

	it('kasir tidak bisa membaca data khusus admin (harga beli, gaji, karyawan, pengaturan, dasbor, Telegram, perangkat)', async () => {
		const khususAdmin = ['harga_beli', 'karyawan', 'kehadiran', 'gaji', 'biaya_tetap', 'dasbor', 'dasbor_panel', 'analisis_pengaturan', 'telegram_pengaturan',
			'telegram_antrean', 'telegram_status_stok', 'kejadian_diabaikan', 'perangkat'];
		const ada = await tabel();
		for (const t of khususAdmin) {
			expect(ada, t).toContain(t);
			expect([t, await baris((f) => sebagai(db, kasirBL, f), t)]).toEqual([t, expect.toSatisfy((v) => v === 'ditolak' || v === 0)]);
		}
	});

	it('kasir tidak bisa mengubah tabel mana pun secara langsung (admin lewat aturan akses, sisanya lewat fungsi)', async () => {
		for (const t of await tabel()) {
			const tulis = (await db.query<{ ok: boolean }>(`select has_table_privilege('authenticated', 'public.' || $1, 'INSERT,UPDATE,DELETE') as ok`, [t])).rows[0].ok;
			if (!tulis) continue;
			// tabel yang boleh ditulis langsung wajib RLS; kasir mencoba menghapus semua baris → tidak ada yang terhapus
			const rls = (await db.query<{ ok: boolean }>(`select relrowsecurity as ok from pg_class where oid = ('public.' || $1)::regclass`, [t])).rows[0].ok;
			expect([t, rls]).toEqual([t, true]);
			const sebelum = (await db.query<{ n: number }>(`select count(*)::int as n from public.${t}`)).rows[0].n;
			try {
				await sebagai(db, kasirBL, () => db.query(`delete from public.${t}`));
			} catch {
				// ditolak: baik
			}
			expect([t, (await db.query<{ n: number }>(`select count(*)::int as n from public.${t}`)).rows[0].n]).toEqual([t, sebelum]);
		}
	});

	it('semua tabel public memakai aturan baris (RLS)', async () => {
		const tanpa = (await db.query<{ t: string }>(`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`)).rows.map((r) => r.t);
		expect(tanpa).toEqual([]);
	});

	it('tidak ada aturan akses untuk pengunjung tanpa login', async () => {
		const p = (await db.query<{ p: string }>(`select tablename || '.' || policyname as p from pg_policies
			where schemaname = 'public' and (roles && array['anon', 'public']::name[]) order by 1`)).rows.map((r) => r.p);
		expect(p).toEqual([]);
	});

	it('setiap aturan tulis langsung (insert/update/delete) hanya untuk admin', async () => {
		const p = (await db.query<{ p: string; q: string | null; c: string | null }>(`select tablename || '.' || policyname as p, qual as q, with_check as c from pg_policies
			where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')`)).rows;
		for (const x of p) expect([x.p, `${x.q ?? ''} ${x.c ?? ''}`.includes('is_admin')]).toEqual([x.p, true]);
	});

	it('tabel khusus admin: aturan bacanya hanya untuk admin', async () => {
		const khususAdmin = ['harga_beli', 'karyawan', 'kehadiran', 'gaji', 'biaya_tetap', 'dasbor', 'dasbor_panel', 'analisis_pengaturan', 'kejadian_diabaikan', 'perangkat'];
		const p = (await db.query<{ t: string; q: string | null }>(`select tablename as t, qual as q from pg_policies where schemaname = 'public' and cmd in ('SELECT', 'ALL') and tablename = any($1)`, [khususAdmin])).rows;
		for (const x of p) expect([x.t, (x.q ?? '').includes('is_admin') && !(x.q ?? '').includes('my_outlet_id')]).toEqual([x.t, true]);
	});

	it('pengunjung tanpa login tidak bisa menjalankan fungsi apa pun di skema public', async () => {
		const bisa = (
			await db.query<{ f: string }>(`
				select p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
				  -- fungsi pemicu & bantu tanpa security definer berjalan dengan hak pemanggil (tidak bisa membuka data)
				  and (p.prosecdef or p.proname not like '\_%') order by 1`)
		).rows.map((r) => r.f);
		// hanya fungsi bantu yang tidak membuka data; daftar ini harus ditinjau bila berubah
		expect(bisa.filter((f) => !['is_admin', 'my_outlet_id', 'tanggal_wib'].includes(f))).toEqual([]);
	});

	it('semua fungsi security definer di public mengunci search_path', async () => {
		const longgar = (
			await db.query<{ f: string }>(`
				select p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
				where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text like '%search_path=%', false) order by 1`)
		).rows.map((r) => r.f);
		expect(longgar).toEqual([]);
	});
});
