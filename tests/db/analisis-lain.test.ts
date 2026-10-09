import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { isian, rpc } from './harness-3b';
import { idMenu, idOutlet } from './harness-kasir';
import { idBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
});

const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const jamLalu = (j: number) => nilai<string>(`select (now() - make_interval(hours => $1::int))::text as v`, [j]);
const satuan = (kode: string) => nilai<string>('select id as v from public.satuan_beli where kode = $1', [kode]);
const BL = () => idOutlet(db, 'BL');
async function beli(kode: string, qty: number, harga: number, jam: number) {
	const id = crypto.randomUUID();
	await db.query('insert into public.barang_masuk (id, outlet_id, tanggal, waktu, total) values ($1, $2, current_date, $3, $4)', [id, await BL(), await jamLalu(jam), qty * harga]);
	await db.query('insert into public.barang_masuk_item (barang_masuk_id, satuan_beli_id, nama, qty, harga) values ($1, $2, $3, $4, $5)', [id, await satuan(kode), kode, qty, harga]);
}
let shift = '';
async function jual(kode: string, qty: number, jam: number) {
	const o = await BL();
	shift ||= await rpc<string>(db, kasirBL, 'public.buka_shift_offline($1::jsonb)', [
		JSON.stringify({ id: crypto.randomUUID(), outlet_id: o, modal: 0, laci_awal: 0, waktu: await jamLalu(100) })
	]);
	const id = crypto.randomUUID();
	await rpc(db, kasirBL, 'public.catat_penjualan_offline($1::jsonb)', [
		JSON.stringify({ id, outlet_id: o, shift_id: shift, metode: 'qris', waktu: await jamLalu(1), kode_struk: 'ANL002', item: [{ menu_id: await idMenu(db, kode), qty }] })
	]);
	await db.query('update public.penjualan set waktu = $2 where id = $1', [id, await jamLalu(jam)]);
}
const rentang = async () => [await jamLalu(150), await jamLalu(-1)];

describe('susut & terbuang', () => {
	beforeEach(() => {
		shift = '';
	});
	it('nilai rupiah = jumlah × modal; catatan batal tidak dihitung', async () => {
		await db.query('insert into public.harga_beli (outlet_id, satuan_beli_id, harga) values ($1, $2, 4321)', [await BL(), await satuan('pack_box')]);
		const o = await BL();
		// opname disetujui: box kurang 5 pcs
		const op = crypto.randomUUID();
		await db.query(`insert into public.opname (id, outlet_id, status, dihitung_at, diputus_at) values ($1, $2, 'disetujui', $3, now())`, [op, o, await jamLalu(5)]);
		await db.query(`insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, opname_id) values ($1, $2, -5, 'opname', $3, $4)`, [o, await idBahan(db, 'box'), await jamLalu(5), op]);
		const r1 = crypto.randomUUID();
		const r2 = crypto.randomUUID();
		for (const [id, n] of [[r1, 3], [r2, 7]] as const)
			await rpc(db, kasirBL, 'public.catat_rusak_offline($1::jsonb)', [
				JSON.stringify({ id, outlet_id: o, alasan: 'jatuh_rusak', waktu: await jamLalu(2), item: await isian(db, [['box', n]]) })
			]);
		await db.query(`update public.rusak set batal_at = now(), batal_oleh = $2, batal_alasan = 'salah' where id = $1`, [r2, adminId]);
		const [d, s] = await rentang();
		const r = await rpc<{ susut: { nama: string; jumlah: number; nilai: number }[]; susut_total: number; terbuang: { label_alasan: string; nilai: number }[]; terbuang_total: number }>(
			db,
			adminId,
			'public.susut_terbuang($1, $2, $3)',
			[o, d, s]
		);
		expect(r.susut[0]).toMatchObject({ nama: "Box D'Kriuk" });
		expect(Number(r.susut[0].jumlah)).toBe(-5);
		expect(Number(r.susut_total)).toBe(Math.round(-5 * 43.21));
		expect(r.terbuang).toHaveLength(1);
		expect(r.terbuang[0].label_alasan).toBe('Jatuh/rusak');
		expect(Number(r.terbuang_total)).toBe(Math.round(3 * 43.21));
	});
});

describe('minyak & tepung', () => {
	beforeEach(() => {
		shift = '';
	});
	it('potong per liter & biaya per potong antar pembelian; rasio tepung', async () => {
		await beli('minyak_liter', 10, 1111, 48);
		await jual('ori_dada', 30, 40);
		await jual('kulit', 10, 30);
		await beli('minyak_liter', 5, 1111, 24);
		await jual('ori_sayap', 5, 10);
		await beli('karung_tepung_dkriuk', 1, 98765, 47);
		await beli('karung_tepung_a', 1, 54321, 47);
		const [d, s] = await rentang();
		const r = await rpc<
			{ bahan: { kode: string; pembelian: { potong: number; potong_per_satuan: number; biaya_per_potong: number; berjalan: boolean }[]; potong_per_satuan: number }[]; tepung: { kg_dkriuk: number; kg_a: number; persen_dkriuk: number; menyimpang: boolean; potong: number } }[]
		>(db, adminId, 'public.minyak_tepung($1, $2, $3)', [await BL(), d, s]);
		const minyak = r[0].bahan.find((b) => b.kode === 'minyak')!;
		expect(minyak.pembelian.map((p) => [p.potong, Number(p.potong_per_satuan), p.berjalan])).toEqual([
			[40, 4, false],
			[5, 1, true]
		]);
		expect(Number(minyak.pembelian[0].biaya_per_potong)).toBe(Math.round(11110 / 40));
		expect(Number(minyak.potong_per_satuan)).toBe(4);
		expect(r[0].tepung).toMatchObject({ potong: 45, menyimpang: false });
		expect(Number(r[0].tepung.kg_dkriuk)).toBe(19.5);
		expect(Number(r[0].tepung.persen_dkriuk)).toBe(43.8);
	});
});

describe('proyeksi', () => {
	beforeEach(() => {
		shift = '';
	});
	it('dari laba riil hari yang sudah selesai (1 s.d. kemarin) ÷ hari selesai × hari sebulan; hari ini ikut di angka sejauh ini', async () => {
		await jual('nasi', 3, 0);
		const p = await rpc<{ hari_berjalan: number; hari_selesai: number; hari_sebulan: number; omzet: number; proyeksi_omzet: number | null }>(
			db,
			adminId,
			'public.proyeksi_bulan($1)',
			[null]
		);
		expect(p.hari_selesai).toBe(p.hari_berjalan - 1);
		expect(Number(p.omzet)).toBeGreaterThan(0);
		// jualan hari ini tidak ikut dasar proyeksi
		if (p.hari_selesai === 0) expect(p.proyeksi_omzet).toBeNull();
		else expect(Number(p.proyeksi_omzet)).toBe(0);
		await expect(rpc(db, kasirBL, 'public.proyeksi_bulan($1)', [null])).rejects.toThrow(/Hanya admin/);
	});
});
