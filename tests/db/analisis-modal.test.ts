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
const satuan = (kode: string) => nilai<string>('select id as v from public.satuan_beli where kode = $1', [kode]);
const acuan = async (kode: string, harga: number) =>
	db.query('insert into public.harga_beli (outlet_id, satuan_beli_id, harga) values ($1, $2, $3)', [await idOutlet(db, 'BL'), await satuan(kode), harga]);
/** Barang masuk langsung (superuser) di BL, jam sekarang. */
async function beli(item: [string, number, number][]) {
	const id = crypto.randomUUID();
	const total = item.reduce((t, [, q, h]) => t + q * h, 0);
	await db.query(`insert into public.barang_masuk (id, outlet_id, tanggal, waktu, total) values ($1, $2, current_date, now() - interval '1 hour', $3)`, [
		id,
		await idOutlet(db, 'BL'),
		total
	]);
	for (const [kode, qty, harga] of item)
		await db.query('insert into public.barang_masuk_item (barang_masuk_id, satuan_beli_id, nama, qty, harga) values ($1, $2, $3, $4, $5)', [
			id,
			await satuan(kode),
			kode,
			qty,
			harga
		]);
}
const rentang = async () => [await nilai<string>(`select (now() - interval '1 day')::text as v`), await nilai<string>(`select (now() + interval '1 hour')::text as v`)];
type Modal = { bahan_id: string; nama: string; modal: number | null; sumber: string | null };
const modal = async () => {
	const [d, s] = await rentang();
	const r = await rpc<Modal[]>(db, adminId, 'public.modal_bahan($1, $2, $3)', [await idOutlet(db, 'BL'), d, s]);
	return new Map(r.map((x) => [x.nama, x]));
};

describe('modal bahan', () => {
	it('acuan bila tidak ada pembelian; rata-rata barang masuk periode bila ada', async () => {
		await acuan('beras_kg', 12345);
		await acuan('pack_kertas_nasi', 4321);
		let m = await modal();
		expect(m.get('Beras')).toMatchObject({ modal: 12345, sumber: 'acuan' });
		expect(m.get('Kertas Nasi')).toMatchObject({ modal: 43.21, sumber: 'acuan' });
		await beli([['beras_kg', 2, 5432]]);
		await beli([['beras_kg', 1, 8642]]);
		m = await modal();
		expect(m.get('Beras')).toMatchObject({ modal: (2 * 5432 + 8642) / 3, sumber: 'beli' });
		expect(m.get('Minyak Goreng')?.modal).toBeNull();
	});

	it('pack ayam dibagi sebanding harga jual; jumlah modal semua potongan = harga pack', async () => {
		await acuan('pack_ayam_ori', 77777);
		const m = await modal();
		const dada = m.get('Dada Ori')!.modal!;
		const sayap = m.get('Sayap Ori')!.modal!;
		expect(dada).toBeCloseTo((77777 * 11000) / 91000, 1);
		expect(sayap).toBeCloseTo((77777 * 9000) / 91000, 1);
		const total = 3 * dada + 2 * m.get('Paha Atas Ori')!.modal! + 2 * m.get('Paha Bawah Ori')!.modal! + 2 * sayap;
		expect(total).toBeCloseTo(77777, 0);
	});
});

describe('untung per menu', () => {
	it('modal resep, untung, persen, tanda tipis & penjualan periode', async () => {
		await acuan('pack_ayam_ori', 77777);
		await acuan('beras_kg', 12345);
		await acuan('pack_kertas_nasi', 4321);
		const o = await idOutlet(db, 'BL');
		const shift = await rpc<string>(db, kasirBL, 'public.buka_shift_offline($1::jsonb)', [
			JSON.stringify({ id: crypto.randomUUID(), outlet_id: o, modal: 0, laci_awal: 0, waktu: await nilai<string>(`select (now() - interval '30 minutes')::text as v`) })
		]);
		const nasi = await nilai<string>(`select id as v from public.menu where kode = 'nasi'`);
		await rpc(db, kasirBL, 'public.catat_penjualan_offline($1::jsonb)', [
			JSON.stringify({ id: crypto.randomUUID(), outlet_id: o, shift_id: shift, metode: 'qris', waktu: await nilai<string>(`select (now() - interval '10 minutes')::text as v`), kode_struk: 'ANL001', item: [{ menu_id: nasi, qty: 4 }] })
		]);
		const [d, s] = await rentang();
		const r = await rpc<{ batas_untung: number; menu: { nama: string; outlet_id: string; modal: number; untung: number; persen: number; tipis: boolean; lengkap: boolean; terjual: number; untung_periode: number }[] }>(
			db,
			adminId,
			'public.untung_menu($1, $2, $3)',
			[o, d, s]
		);
		expect(Number(r.batas_untung)).toBe(30);
		const n = r.menu.find((x) => x.nama === 'Nasi')!;
		expect(n).toMatchObject({ modal: 1278, untung: 3722, tipis: false, lengkap: true, terjual: 4 });
		expect(Number(n.persen)).toBe(74.4);
		expect(Number(n.untung_periode)).toBe(Math.round(20000 - 4 * (1234.5 + 43.21)));
		const dada = r.menu.find((x) => x.nama === 'Dada Ori')!;
		expect(dada).toMatchObject({ tipis: true, lengkap: true });
		expect(r.menu.find((x) => x.nama === 'Dada Hot')).toMatchObject({ lengkap: false, modal: null });
		// urut: modal belum lengkap dulu, lalu untung % terkecil
		expect(r.menu.findIndex((x) => x.nama === 'Dada Ori')).toBeLessThan(r.menu.findIndex((x) => x.nama === 'Nasi'));
	});

	it('batas untung diatur admin; kasir ditolak', async () => {
		await rpc(db, adminId, 'public.simpan_batas_untung($1)', [10]);
		expect(Number(await nilai('select batas_untung as v from public.analisis_pengaturan'))).toBe(10);
		await expect(rpc(db, adminId, 'public.simpan_batas_untung($1)', [150])).rejects.toThrow(/Batas untung/);
		const [d, s] = await rentang();
		await expect(rpc(db, kasirBL, 'public.untung_menu($1, $2, $3)', [null, d, s])).rejects.toThrow(/Hanya admin/);
	});
});
