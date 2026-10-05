import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { isian, rpc, setujuiStokAwal } from './harness-3b';
import { idMenu, idOutlet, shiftLangsung } from './harness-kasir';
import { idBahan, stokBahan } from './harness-stok';

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

const stok = (kode: string) => stokBahan(db, 'BL', kode);
const ajukan = async (oleh: string, item: [string, number][]) =>
	rpc<string>(db, oleh, 'public.ajukan_opname($1, $2::jsonb)', [await idOutlet(db, 'BL'), JSON.stringify(await isian(db, item))]);
const putuskan = (oleh: string, id: string, setuju: boolean, item: unknown = null, catatan: string | null = null) =>
	rpc(db, oleh, 'public.putuskan_opname($1, $2, $3::jsonb, $4)', [id, setuju, item === null ? null : JSON.stringify(item), catatan]);
async function jual(qty: number) {
	const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), metode: 'qris', item: [{ menu_id: await idMenu(db, 'ori_dada'), qty }] };
	await rpc(db, kasirBL, 'public.catat_penjualan($1::jsonb)', [JSON.stringify(p)]);
	return p.id;
}

describe('ajukan opname', () => {
	it('butuh stok awal disetujui', async () => {
		await expect(ajukan(kasirBL, [['ori_dada', 1]])).rejects.toThrow(/butuh stok awal/);
	});
	it('satu ajuan menunggu; ditolak saat ada transfer menunggu (keluar maupun masuk)', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 3);
		const t = { id: crypto.randomUUID(), dari_outlet_id: await idOutlet(db, 'TK'), ke_outlet_id: await idOutlet(db, 'BL'), item: await isian(db, [['box', 1]]) };
		await rpc(db, kasirTK, 'public.kirim_transfer($1::jsonb)', [JSON.stringify(t)]);
		await expect(ajukan(kasirBL, [['ori_dada', 1]])).rejects.toThrow(/Selesaikan kiriman/);
		await rpc(db, kasirTK, 'public.batal_transfer($1, $2)', [t.id, 'tidak jadi']);
		await ajukan(kasirBL, [['ori_dada', 1]]);
		await expect(ajukan(kasirBL, [['ori_dada', 2]])).rejects.toThrow(/masih menunggu/);
	});
	it('kasir outlet lain ditolak', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 3);
		await expect(ajukan(kasirTK, [['ori_dada', 1]])).rejects.toThrow(/tidak berhak/);
	});
});

describe('putuskan opname', () => {
	it('stok = hitungan pada jam dihitung; jual sesudahnya tetap memotong; qty_sistem tersimpan', async () => {
		await shiftLangsung(db, 'BL', kasirBL);
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 20]], 3);
		const sebelum = await jual(2);
		await db.query(`update public.gerakan_stok set waktu = now() - interval '2 hours' where penjualan_id = $1`, [sebelum]);
		const id = await ajukan(kasirBL, [['ori_dada', 15]]);
		await db.query(`update public.opname set dihitung_at = now() - interval '1 hour' where id = $1`, [id]);
		await jual(1);
		const pratinjau = await rpc<unknown>(db, adminId, `(select json_agg(x) from public.pratinjau_opname($1) x)`, [id]);
		expect(pratinjau).toEqual([{ bahan_id: await idBahan(db, 'ori_dada'), qty_hitung: 15, qty_sistem: 18 }]);
		await putuskan(adminId, id, true);
		expect(await stok('ori_dada')).toBe(14);
		const s = (await db.query<{ q: string }>('select qty_sistem as q from public.opname_item where opname_id = $1', [id])).rows[0].q;
		expect(Number(s)).toBe(18);
	});
	it('admin membetulkan angka; tolak dengan alasan; diputuskan dua kali ditolak; kasir tidak boleh', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 20]], 3);
		const id = await ajukan(kasirBL, [['ori_dada', 15]]);
		await expect(putuskan(kasirBL, id, true)).rejects.toThrow(/Hanya admin/);
		await putuskan(adminId, id, true, await isian(db, [['ori_dada', 17]]));
		expect(await stok('ori_dada')).toBe(17);
		await expect(putuskan(adminId, id, true)).rejects.toThrow(/sudah diputuskan/);
		const id2 = await ajukan(kasirBL, [['ori_dada', 1]]);
		await expect(putuskan(adminId, id2, false, null, 'x')).rejects.toThrow(/Alasan penolakan/);
		await putuskan(adminId, id2, false, null, 'hitung ulang');
		expect(await stok('ori_dada')).toBe(17);
	});
	it('opname disetujui menjadi batas "sebelum dihitung" untuk barang masuk', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['box', 0]], 72);
		const id = await ajukan(kasirBL, [['box', 0]]);
		await db.query(`update public.opname set dihitung_at = now() - interval '1 hour' where id = $1`, [id]);
		await putuskan(adminId, id, true);
		const tanggal = (await db.query<{ t: string }>('select (public.tanggal_wib(now()) - 1)::text as t')).rows[0].t;
		const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), tanggal, item: [{ satuan_beli_id: (await db.query<{ id: string }>(`select id from public.satuan_beli where kode = 'pack_box'`)).rows[0].id, qty: 1, harga: 1 }] };
		await expect(rpc(db, adminId, 'public.catat_barang_masuk($1::jsonb)', [JSON.stringify(p)])).rejects.toThrow(/sebelum stok dihitung/);
	});
});

describe('review Tugas 3–4', () => {
	it('selama opname menunggu, catatan rusak dari sebelum hitungan tidak bisa dibatalkan', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 20]], 3);
		const r = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), alasan: 'gosong', item: await isian(db, [['ori_dada', 5]]) };
		await rpc(db, kasirBL, 'public.catat_rusak($1::jsonb)', [JSON.stringify(r)]);
		await ajukan(kasirBL, [['ori_dada', 15]]);
		await expect(rpc(db, adminId, 'public.batal_rusak($1, $2)', [r.id, 'salah catat'])).rejects.toThrow(/sebelum stok dihitung/);
	});
	it('pratinjau opname yang sudah disetujui memakai angka sistem tersimpan', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 20]], 3);
		const id = await ajukan(kasirBL, [['ori_dada', 15]]);
		await putuskan(adminId, id, true);
		const p = await rpc<{ qty_sistem: number }[]>(db, adminId, `(select json_agg(x) from public.pratinjau_opname($1) x)`, [id]);
		expect(p[0].qty_sistem).toBe(20);
	});
	it('kasir tidak bisa melihat pratinjau; kasir nonaktif tidak bisa mengajukan opname', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 20]], 3);
		const id = await ajukan(kasirBL, [['ori_dada', 15]]);
		await expect(rpc(db, kasirBL, `(select json_agg(x) from public.pratinjau_opname($1) x)`, [id])).rejects.toThrow(/Hanya admin/);
		await db.query('update public.profiles set aktif = false where id = $1', [kasirTK]);
		await expect(rpc(db, kasirTK, 'public.ajukan_opname($1, $2::jsonb)', [await idOutlet(db, 'TK'), '[]'])).rejects.toThrow(/tidak berhak/);
	});
});

describe('review akhir 3b', () => {
	it('pesan saat terhalang hitungan yang MENUNGGU menyebut jalan keluarnya', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 20]], 72);
		const r = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), alasan: 'gosong', item: await isian(db, [['ori_dada', 5]]) };
		await rpc(db, kasirBL, 'public.catat_rusak($1::jsonb)', [JSON.stringify(r)]);
		await ajukan(kasirBL, [['ori_dada', 15]]);
		await expect(rpc(db, adminId, 'public.batal_rusak($1, $2)', [r.id, 'salah catat'])).rejects.toThrow(/menunggu persetujuan\. Tolak hitungan itu dulu/);
		const tanggal = (await db.query<{ t: string }>('select (public.tanggal_wib(now()) - 1)::text as t')).rows[0].t;
		const sb = (await db.query<{ id: string }>(`select id from public.satuan_beli where kode = 'pack_box'`)).rows[0].id;
		const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), tanggal, item: [{ satuan_beli_id: sb, qty: 1, harga: 1 }] };
		await expect(rpc(db, adminId, 'public.catat_barang_masuk($1::jsonb)', [JSON.stringify(p)])).rejects.toThrow(/menunggu persetujuan\. Tolak hitungan itu dulu/);
	});
});
