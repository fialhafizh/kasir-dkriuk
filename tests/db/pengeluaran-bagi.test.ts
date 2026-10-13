import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { rpc } from './harness-3b';
import { idOutlet } from './harness-kasir';

let db: PGlite;
let adminId: string;
let kasirBL: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
});

const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const lain = () => nilai<string>(`select id as v from public.kategori_pengeluaran where nama = 'Lain-lain admin'`);
const bagi = async (jumlah: number, ket = 'Iklan bersama', id = crypto.randomUUID(), oleh = adminId) => {
	await rpc(db, oleh, 'public.catat_pengeluaran_bagi($1::jsonb)', [JSON.stringify({ id, jumlah, keterangan: ket, kategori_id: await lain() })]);
	return id;
};
const perOutlet = async (id: string) =>
	(
		await db.query<{ kode: string; jumlah: number; sumber: string; batal: boolean }>(
			`select o.kode, p.jumlah, p.sumber, p.batal_at is not null as batal from public.pengeluaran p join public.outlets o on o.id = p.outlet_id where p.bagi_id = $1 order by o.kode`,
			[id]
		)
	).rows;

describe('pengeluaran lainnya dibagi tiga outlet', () => {
	it('nominal dibagi rata ke 3 outlet, sisa rupiah ke outlet pertama; dibayar di luar laci; masuk laba-rugi', async () => {
		const id = await bagi(77777);
		expect(await perOutlet(id)).toEqual([
			{ kode: 'BL', jumlah: 25926, sumber: 'luar', batal: false },
			{ kode: 'KP', jumlah: 25926, sumber: 'luar', batal: false },
			{ kode: 'TK', jumlah: 25925, sumber: 'luar', batal: false }
		]);
		const hari = await nilai<string>(`select public.tanggal_wib(now())::text as v`);
		const r = await rpc<{ pengeluaran_lain_total: number }>(db, adminId, 'public.laporan_keuangan($1, $2::date, $3::date)', [await idOutlet(db, 'KP'), hari, hari]);
		expect(r.pengeluaran_lain_total).toBe(25926);
	});

	it('kirim ulang id yang sama tidak menggandakan; kasir ditolak; keterangan wajib', async () => {
		const id = await bagi(43210);
		await bagi(43210, 'Iklan bersama', id);
		expect(await perOutlet(id)).toHaveLength(3);
		await expect(bagi(43210, 'Iklan', crypto.randomUUID(), kasirBL)).rejects.toThrow(/admin/i);
		await expect(bagi(43210, '  ')).rejects.toThrow(/Keterangan wajib/);
	});

	it('batal sekaligus ketiganya; satu bagian tidak bisa dibatalkan sendiri', async () => {
		const id = await bagi(12345);
		const satu = await nilai<string>('select id as v from public.pengeluaran where bagi_id = $1 limit 1', [id]);
		await expect(rpc(db, adminId, 'public.batal_pengeluaran($1, $2)', [satu, 'salah catat'])).rejects.toThrow(/Belanja riil/);
		await rpc(db, adminId, 'public.batal_pengeluaran_bagi($1, $2)', [id, 'salah catat']);
		expect((await perOutlet(id)).every((x) => x.batal)).toBe(true);
		await expect(rpc(db, adminId, 'public.batal_pengeluaran_bagi($1, $2)', [id, 'salah catat'])).rejects.toThrow(/sudah dibatalkan/);
	});
});
