import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai } from './harness';
import { rpc } from './harness-3b';

let db: PGlite;
let adminId: string;
let kasirBL: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
});

const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const simpan = (p: object) => rpc<string>(db, adminId, 'public.simpan_dasbor($1::jsonb)', [JSON.stringify(p)]);
const panelAngka = (judul = 'Omzet', extra: object = {}) => ({
	judul,
	jenis: 'angka',
	x: 0,
	y: 0,
	w: 3,
	h: 2,
	spek: { sumber: 'penjualan', ukuran: ['omzet'] },
	...extra
});

describe('kelola dasbor', () => {
	it('dasbor bawaan Ringkasan dibuat migrasi: utama, 16 panel', async () => {
		expect(await nilai<string>('select nama as v from public.dasbor where bawaan and utama')).toBe('Ringkasan');
		expect(await nilai<number>('select count(*)::int as v from public.dasbor_panel')).toBe(16);
	});

	it('simpan dasbor baru beserta panel; ubah: panel yang tidak dikirim dihapus', async () => {
		const id = await simpan({ nama: 'Harian', saringan: { outlet_id: null, periode: '7_hari' }, panel: [panelAngka('A'), panelAngka('B', { x: 3 })] });
		expect(await nilai<number>('select count(*)::int as v from public.dasbor_panel where dasbor_id = $1', [id])).toBe(2);
		const pid = await nilai<string>(`select id as v from public.dasbor_panel where dasbor_id = $1 and judul = 'A'`, [id]);
		await simpan({ id, nama: 'Harian 2', saringan: { periode: 'bulan_ini' }, panel: [{ ...panelAngka('A baru'), id: pid }] });
		const rows = (await db.query<{ id: string; judul: string }>('select id, judul from public.dasbor_panel where dasbor_id = $1', [id])).rows;
		expect(rows).toEqual([{ id: pid, judul: 'A baru' }]);
		expect(await nilai<string>(`select saringan ->> 'periode' as v from public.dasbor where id = $1`, [id])).toBe('bulan_ini');
	});

	it('simpan atomik: satu panel tidak sah → tidak ada yang tersimpan', async () => {
		const id = await simpan({ nama: 'X', panel: [panelAngka('A')] });
		await expect(
			simpan({ id, nama: 'Y', panel: [panelAngka('B'), panelAngka('C', { spek: { sumber: 'penjualan', ukuran: ['hapus_semua'] } })] })
		).rejects.toThrow(/Ukuran tidak dikenal/);
		expect(await nilai<string>('select nama as v from public.dasbor where id = $1', [id])).toBe('X');
		expect(await nilai<string>('select judul as v from public.dasbor_panel where dasbor_id = $1', [id])).toBe('A');
	});

	it('letak panel di luar kisi ditolak; panel dasbor lain tidak bisa dicuri', async () => {
		await expect(simpan({ nama: 'X', panel: [panelAngka('A', { x: 10, w: 4 })] })).rejects.toThrow(/Letak panel tidak sah/);
		const lain = await nilai<string>('select id as v from public.dasbor_panel limit 1');
		await expect(simpan({ nama: 'X', panel: [{ ...panelAngka('A'), id: lain }] })).rejects.toThrow(/Panel milik dasbor lain/);
	});

	it('tepat satu utama; hapus utama memindahkan utama; dasbor terakhir tidak bisa dihapus', async () => {
		const awal = await nilai<string>('select id as v from public.dasbor where utama');
		const baru = await simpan({ nama: 'Baru', panel: [] });
		await rpc(db, adminId, 'public.jadikan_utama_dasbor($1)', [baru]);
		expect(await nilai<string>('select id as v from public.dasbor where utama')).toBe(baru);
		await rpc(db, adminId, 'public.hapus_dasbor($1)', [baru]);
		expect(await nilai<string>('select id as v from public.dasbor where utama')).toBe(awal);
		await expect(rpc(db, adminId, 'public.hapus_dasbor($1)', [awal])).rejects.toThrow(/Minimal harus ada satu dasbor/);
	});

	it('kembalikan bawaan: isi Ringkasan kembali ke awal', async () => {
		const id = await nilai<string>('select id as v from public.dasbor where bawaan');
		await simpan({ id, nama: 'Dirusak', panel: [panelAngka('Sisa satu')] });
		expect(await rpc<string>(db, adminId, 'public.kembalikan_bawaan_dasbor()', [])).toBe(id);
		expect(await nilai<number>('select count(*)::int as v from public.dasbor_panel where dasbor_id = $1', [id])).toBe(16);
		expect(await nilai<string>('select nama as v from public.dasbor where id = $1', [id])).toBe('Ringkasan');
	});

	it('kasir tidak bisa membaca atau mengubah dasbor', async () => {
		expect((await sebagai(db, kasirBL, () => db.query('select * from public.dasbor'))).rows).toHaveLength(0);
		await expect(rpc(db, kasirBL, 'public.simpan_dasbor($1::jsonb)', [JSON.stringify({ nama: 'X', panel: [] })])).rejects.toThrow(/Hanya admin/);
		await expect(rpc(db, kasirBL, 'public.kembalikan_bawaan_dasbor()', [])).rejects.toThrow(/Hanya admin/);
	});
});
