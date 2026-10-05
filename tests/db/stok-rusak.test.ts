import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { isian, rpc, setujuiStokAwal } from './harness-3b';
import { idOutlet } from './harness-kasir';
import { idSatuan, stokBahan } from './harness-stok';

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
async function rusak(oleh: string, item: [string, number][], extra: Record<string, unknown> = {}) {
	const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), alasan: 'gosong', item: await isian(db, item), ...extra };
	await rpc(db, oleh, 'public.catat_rusak($1::jsonb)', [JSON.stringify(p)]);
	return p.id;
}
const batal = (oleh: string, id: string, alasan = 'salah catat') => rpc(db, oleh, 'public.batal_rusak($1, $2)', [id, alasan]);

describe('catat rusak', () => {
	it('kasir mencatat → stok berkurang langsung (boleh minus), satu baris per bahan', async () => {
		await rusak(kasirBL, [
			['ori_sayap', 3],
			['minyak', 0.5]
		]);
		expect(await stok('ori_sayap')).toBe(-3);
		expect(await stok('minyak')).toBeCloseTo(-0.5, 4);
		const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.gerakan_stok where jenis = 'rusak'`);
		expect(rows[0].n).toBe(2);
	});
	it('id sama dikirim dua kali → sekali', async () => {
		const id = crypto.randomUUID();
		await rusak(kasirBL, [['ori_dada', 1]], { id });
		await rusak(kasirBL, [['ori_dada', 1]], { id });
		expect(await stok('ori_dada')).toBe(-1);
	});
	it('isian salah ditolak: kosong, jumlah 0, alasan lainnya tanpa catatan, outlet lain', async () => {
		await expect(rusak(kasirBL, [])).rejects.toThrow(/minimal satu bahan/);
		await expect(rusak(kasirBL, [['ori_dada', 0]])).rejects.toThrow(/Jumlah stok tidak sah/);
		await expect(rusak(kasirBL, [['ori_dada', 1]], { alasan: 'lainnya' })).rejects.toThrow(/Catatan wajib/);
		await expect(rusak(kasirTK, [['ori_dada', 1]])).rejects.toThrow(/tidak berhak/);
	});
	it('alasan lainnya dengan catatan diterima', async () => {
		await rusak(kasirBL, [['ori_dada', 1]], { alasan: 'lainnya', catatan: 'diminta tetangga' });
		expect(await stok('ori_dada')).toBe(-1);
	});
});

describe('batal rusak', () => {
	it('admin membatalkan → kembali persis; sekali saja; kasir tidak boleh', async () => {
		const id = await rusak(kasirBL, [['ori_sayap', 3]]);
		await expect(batal(kasirBL, id)).rejects.toThrow(/Hanya admin/);
		await batal(adminId, id);
		expect(await stok('ori_sayap')).toBe(0);
		await expect(batal(adminId, id)).rejects.toThrow(/sudah dibatalkan/);
	});
	it('rusak yang terjadi sebelum stok dihitung tidak bisa dibatalkan', async () => {
		const id = await rusak(kasirBL, [['ori_sayap', 3]]);
		await db.query(`update public.rusak set waktu = now() - interval '2 hours' where id = $1`, [id]);
		await db.query(`update public.gerakan_stok set waktu = now() - interval '2 hours' where rusak_id = $1`, [id]);
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_sayap', 10]], 1);
		await expect(batal(adminId, id)).rejects.toThrow(/sebelum stok dihitung/);
		expect(await stok('ori_sayap')).toBe(10);
	});
});

describe('penjaga barang masuk (trigger, mencakup opname)', () => {
	it('barang masuk bertanggal sebelum opname disetujui ditolak', async () => {
		const bl = await idOutlet(db, 'BL');
		await db.query(
			`insert into public.opname (outlet_id, status, dihitung_at, diputus_at) values ($1, 'disetujui', now() - interval '1 hour', now())`,
			[bl]
		);
		const tanggal = (await db.query<{ t: string }>('select (public.tanggal_wib(now()) - 2)::text as t')).rows[0].t;
		const p = { id: crypto.randomUUID(), outlet_id: bl, tanggal, item: [{ satuan_beli_id: await idSatuan(db, 'pack_box'), qty: 1, harga: 1 }] };
		await expect(rpc(db, adminId, 'public.catat_barang_masuk($1::jsonb)', [JSON.stringify(p)])).rejects.toThrow(/sebelum stok dihitung/);
	});
	it('barang masuk hari ini sesudah hitungan tetap boleh', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['box', 5]], 1);
		const tanggal = (await db.query<{ t: string }>('select public.tanggal_wib(now())::text as t')).rows[0].t;
		const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), tanggal, item: [{ satuan_beli_id: await idSatuan(db, 'pack_box'), qty: 1, harga: 1 }] };
		await rpc(db, adminId, 'public.catat_barang_masuk($1::jsonb)', [JSON.stringify(p)]);
		expect(await stok('box')).toBe(105);
	});
});
