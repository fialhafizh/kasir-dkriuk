import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai } from './harness';
import { idMenu, idOutlet, shiftLangsung } from './harness-kasir';
import { idBahan, idSatuan, stokBahan } from './harness-stok';

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

async function rpc<T>(oleh: string, sql: string, params: unknown[]): Promise<T> {
	return sebagai(db, oleh, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0].r);
}
const hariIni = async (geser = 0) =>
	(await db.query<{ t: string }>('select (public.tanggal_wib(now()) + $1::int)::text as t', [geser])).rows[0].t;
async function kiriman(item: [string, number, number][], extra: Record<string, unknown> = {}) {
	return {
		id: crypto.randomUUID(),
		outlet_id: await idOutlet(db, 'BL'),
		tanggal: await hariIni(),
		item: await Promise.all(item.map(async ([kode, qty, harga]) => ({ satuan_beli_id: await idSatuan(db, kode), qty, harga }))),
		...extra
	};
}
const masuk = (oleh: string, p: object) => rpc<string>(oleh, 'public.catat_barang_masuk($1::jsonb)', [JSON.stringify(p)]);
const batalMasuk = (oleh: string, id: string, alasan = 'salah input') => rpc(oleh, 'public.batal_barang_masuk($1, $2)', [id, alasan]);
const stok = (kode: string, outlet = 'BL') => stokBahan(db, outlet, kode);

describe('barang masuk', () => {
	it('memecah isi pack ke bahan dan menyimpan total & nama barang', async () => {
		const p = await kiriman([
			['pack_ayam_ori', 2, 40000],
			['beras_kg', 1.5, 15000]
		]);
		await masuk(adminId, p);
		expect(await stok('ori_dada')).toBe(6);
		expect(await stok('ori_paha_atas')).toBe(4);
		expect(await stok('ori_paha_bawah')).toBe(4);
		expect(await stok('ori_sayap')).toBe(4);
		expect(await stok('beras')).toBeCloseTo(1.5, 4);
		const bm = (await db.query<{ total: string; n: number }>('select total, (select count(*)::int from public.barang_masuk_item where barang_masuk_id = $1) as n from public.barang_masuk where id = $1', [p.id])).rows[0];
		expect(Number(bm.total)).toBe(2 * 40000 + 22500);
		expect(bm.n).toBe(2);
	});

	it('id sama dikirim dua kali → tercatat sekali', async () => {
		const p = await kiriman([['pack_kemasan_kecil', 1, 30000]]);
		await masuk(adminId, p);
		await masuk(adminId, p);
		expect(await stok('kemasan_kecil')).toBe(100);
	});

	it('kasir tidak boleh mencatat barang masuk', async () => {
		await expect(masuk(kasirBL, await kiriman([['pack_kemasan_kecil', 1, 30000]]))).rejects.toThrow(/Hanya admin/);
	});

	it('tanggal: 3 hari lalu boleh (waktu ikut tanggal itu); 8 hari lalu & besok ditolak', async () => {
		const p = await kiriman([['pack_kemasan_kecil', 1, 30000]], { tanggal: await hariIni(-3) });
		await masuk(adminId, p);
		const t = (await db.query<{ t: string }>('select public.tanggal_wib(waktu)::text as t from public.barang_masuk where id = $1', [p.id])).rows[0].t;
		expect(t).toBe(await hariIni(-3));
		await expect(masuk(adminId, await kiriman([['pack_kemasan_kecil', 1, 1]], { tanggal: await hariIni(-8) }))).rejects.toThrow(/7 hari/);
		await expect(masuk(adminId, await kiriman([['pack_kemasan_kecil', 1, 1]], { tanggal: await hariIni(1) }))).rejects.toThrow(/7 hari/);
	});

	it('isian salah ditolak: barang ganda, jumlah 0, harga negatif, harga berubah-ubah 0, kosong', async () => {
		await expect(masuk(adminId, await kiriman([['pack_box', 1, 1], ['pack_box', 2, 1]]))).rejects.toThrow(/dua kali/);
		await expect(masuk(adminId, await kiriman([['pack_box', 0, 1]]))).rejects.toThrow(/Jumlah barang tidak sah/);
		await expect(masuk(adminId, await kiriman([['pack_box', 1, -5]]))).rejects.toThrow(/Harga barang tidak sah/);
		await expect(masuk(adminId, await kiriman([['beras_kg', 10, 0]]))).rejects.toThrow(/wajib diisi/);
		await expect(masuk(adminId, await kiriman([]))).rejects.toThrow(/minimal satu barang/);
	});

	it('barang harga tetap boleh berharga 0 (mis. bonus dari stokis)', async () => {
		await masuk(adminId, await kiriman([['pack_box', 1, 0]]));
		expect(await stok('box')).toBe(100);
	});

	it('batal membalik persis, sekali saja, dengan alasan; kasir tidak boleh', async () => {
		const p = await kiriman([['pack_ayam_ori', 1, 40000]]);
		await masuk(adminId, p);
		await expect(batalMasuk(kasirBL, p.id)).rejects.toThrow(/Hanya admin/);
		await expect(batalMasuk(adminId, p.id, 'x')).rejects.toThrow(/Alasan/);
		await batalMasuk(adminId, p.id);
		expect(await stok('ori_dada')).toBe(0);
		await expect(batalMasuk(adminId, p.id)).rejects.toThrow(/sudah dibatalkan/);
		expect(await stok('ori_dada')).toBe(0);
	});
});

describe('stok awal', () => {
	const ajukan = async (oleh: string, outlet: string, item: [string, number][]) =>
		rpc<string>(oleh, 'public.ajukan_stok_awal($1, $2::jsonb)', [
			await idOutlet(db, outlet),
			JSON.stringify(await Promise.all(item.map(async ([kode, qty]) => ({ bahan_id: await idBahan(db, kode), qty }))))
		]);
	const putuskan = (oleh: string, id: string, setuju: boolean, item: unknown = null, catatan: string | null = null) =>
		rpc(oleh, 'public.putuskan_stok_awal($1, $2, $3::jsonb, $4)', [id, setuju, item === null ? null : JSON.stringify(item), catatan]);

	it('kasir mengajukan, admin menyetujui → stok = hitungan; bahan yang tidak diisi tidak berubah', async () => {
		const id = await ajukan(kasirBL, 'BL', [
			['ori_dada', 12],
			['beras', 7.5]
		]);
		await putuskan(adminId, id, true);
		expect(await stok('ori_dada')).toBe(12);
		expect(await stok('beras')).toBeCloseTo(7.5, 4);
		expect(await stok('ori_sayap')).toBe(0);
	});

	it('hitungan berlaku saat dihitung: jual sebelum hitung diabaikan, jual sesudah tetap memotong', async () => {
		const shift = await shiftLangsung(db, 'BL', kasirBL);
		void shift;
		const jual = async (qty: number) => {
			const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), metode: 'qris', item: [{ menu_id: await idMenu(db, 'ori_dada'), qty }] };
			await rpc(kasirBL, 'public.catat_penjualan($1::jsonb)', [JSON.stringify(p)]);
			return p.id;
		};
		const sebelum = await jual(2);
		await db.query(`update public.gerakan_stok set waktu = now() - interval '2 hours' where penjualan_id = $1`, [sebelum]);
		const id = await ajukan(kasirBL, 'BL', [['ori_dada', 10]]);
		await db.query(`update public.stok_awal set dihitung_at = now() - interval '1 hour' where id = $1`, [id]);
		await jual(1);
		await putuskan(adminId, id, true);
		expect(await stok('ori_dada')).toBe(9);
	});

	it('admin boleh membetulkan angka saat menyetujui', async () => {
		const id = await ajukan(kasirBL, 'BL', [['ori_dada', 12]]);
		await putuskan(adminId, id, true, [{ bahan_id: await idBahan(db, 'ori_dada'), qty: 20 }]);
		expect(await stok('ori_dada')).toBe(20);
	});

	it('satu ajuan menunggu per outlet; setelah disetujui tidak bisa mengajukan lagi', async () => {
		const id = await ajukan(kasirBL, 'BL', [['ori_dada', 1]]);
		await expect(ajukan(kasirBL, 'BL', [['ori_dada', 2]])).rejects.toThrow(/menunggu persetujuan/);
		await putuskan(adminId, id, true);
		await expect(ajukan(kasirBL, 'BL', [['ori_dada', 2]])).rejects.toThrow(/sudah disetujui/);
		await expect(putuskan(adminId, id, true)).rejects.toThrow(/sudah diputuskan/);
	});

	it('ditolak dengan alasan → kasir bisa mengajukan ulang; stok tidak berubah', async () => {
		const id = await ajukan(kasirBL, 'BL', [['ori_dada', 50]]);
		await expect(putuskan(adminId, id, false, null, 'x')).rejects.toThrow(/Alasan penolakan/);
		await putuskan(adminId, id, false, null, 'hitung ulang dada');
		expect(await stok('ori_dada')).toBe(0);
		await ajukan(kasirBL, 'BL', [['ori_dada', 5]]);
	});

	it('hak: kasir outlet lain ditolak, kasir tidak bisa memutuskan, kasir nonaktif ditolak', async () => {
		await expect(ajukan(kasirTK, 'BL', [['ori_dada', 1]])).rejects.toThrow(/tidak berhak/);
		const id = await ajukan(kasirBL, 'BL', [['ori_dada', 1]]);
		await expect(putuskan(kasirBL, id, true)).rejects.toThrow(/Hanya admin/);
		await db.query('update public.profiles set aktif = false where id = $1', [kasirTK]);
		await expect(ajukan(kasirTK, 'TK', [['ori_dada', 1]])).rejects.toThrow(/tidak berhak/);
	});

	it('isian salah ditolak: kosong, bahan ganda, jumlah negatif, bahan tidak dikenal', async () => {
		await expect(ajukan(kasirBL, 'BL', [])).rejects.toThrow(/minimal satu bahan/);
		await expect(ajukan(kasirBL, 'BL', [['ori_dada', 1], ['ori_dada', 2]])).rejects.toThrow(/dua kali/);
		await expect(ajukan(kasirBL, 'BL', [['ori_dada', -1]])).rejects.toThrow(/Jumlah stok tidak sah/);
		await expect(
			rpc(kasirBL, 'public.ajukan_stok_awal($1, $2::jsonb)', [await idOutlet(db, 'BL'), JSON.stringify([{ bahan_id: crypto.randomUUID(), qty: 1 }])])
		).rejects.toThrow(/tidak dikenal/);
	});
});
