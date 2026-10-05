import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { isian, rpc } from './harness-3b';
import { idOutlet } from './harness-kasir';
import { stokBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;
let kasirKP: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
	kasirKP = await buatUser(db, { username: 'kasir.kertapati', role: 'kasir', outlet_kode: 'KP' });
});

async function kirim(item: [string, number][], extra: Record<string, unknown> = {}) {
	const p = { id: crypto.randomUUID(), dari_outlet_id: await idOutlet(db, 'BL'), ke_outlet_id: await idOutlet(db, 'TK'), item: await isian(db, item), ...extra };
	await rpc(db, kasirBL, 'public.kirim_transfer($1::jsonb)', [JSON.stringify(p)]);
	return p.id;
}
const terima = async (oleh: string, id: string, item: [string, number][]) =>
	rpc(db, oleh, 'public.terima_transfer($1, $2::jsonb)', [id, JSON.stringify(await isian(db, item))]);
const ubah = async (oleh: string, id: string, item: [string, number][]) =>
	rpc(db, oleh, 'public.ubah_transfer($1, $2::jsonb, $3)', [id, JSON.stringify(await isian(db, item)), null]);
const batal = (oleh: string, id: string, alasan = 'tidak jadi') => rpc(db, oleh, 'public.batal_transfer($1, $2)', [id, alasan]);
const status = async (id: string) => (await db.query<{ s: string }>('select status::text as s from public.transfer where id = $1', [id])).rows[0].s;

describe('kirim & terima', () => {
	it('jumlah cocok → BL berkurang, TK bertambah, sekali saja', async () => {
		const id = await kirim([
			['ori_dada', 6],
			['kemasan_kecil', 50]
		]);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(0);
		await terima(kasirTK, id, [
			['kemasan_kecil', 50],
			['ori_dada', 6]
		]);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(-6);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(6);
		expect(await stokBahan(db, 'TK', 'kemasan_kecil')).toBe(50);
		expect(await status(id)).toBe('diterima');
		await expect(terima(kasirTK, id, [['ori_dada', 6], ['kemasan_kecil', 50]])).rejects.toThrow(/sudah diterima/);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(6);
	});

	it.each([
		['jumlah beda', [['ori_dada', 5]]],
		['bahan kurang', [['ori_dada', 6]]],
		['bahan lebih', [['ori_dada', 6], ['kemasan_kecil', 50], ['box', 1]]]
	] as [string, [string, number][]][])('%s → ditolak dengan pesan, stok tidak berubah', async (_, diterima) => {
		const id = await kirim([
			['ori_dada', 6],
			['kemasan_kecil', 50]
		]);
		await expect(terima(kasirTK, id, diterima)).rejects.toThrow(/Ada perbedaan jumlah\. Silakan hubungi outlet pengirim \(Bukit Lama\)/);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(0);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(0);
		expect(await status(id)).toBe('dikirim');
	});

	it('yang boleh menerima hanya outlet tujuan (atau admin)', async () => {
		const id = await kirim([['ori_dada', 6]]);
		await expect(terima(kasirBL, id, [['ori_dada', 6]])).rejects.toThrow(/Transfer tidak ditemukan/);
		await expect(terima(kasirKP, id, [['ori_dada', 6]])).rejects.toThrow(/Transfer tidak ditemukan/);
		await terima(adminId, id, [['ori_dada', 6]]);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(6);
	});

	it('kirim: id sama sekali saja; ke outlet sendiri, kosong, dan atas nama outlet lain ditolak', async () => {
		const id = crypto.randomUUID();
		await kirim([['ori_dada', 1]], { id });
		await kirim([['ori_dada', 1]], { id });
		expect((await db.query<{ n: number }>('select count(*)::int as n from public.transfer')).rows[0].n).toBe(1);
		await expect(kirim([['ori_dada', 1]], { ke_outlet_id: await idOutlet(db, 'BL') })).rejects.toThrow(/harus berbeda/);
		await expect(kirim([])).rejects.toThrow(/minimal satu bahan/);
		await expect(kirim([['ori_dada', 1]], { dari_outlet_id: await idOutlet(db, 'KP') })).rejects.toThrow(/tidak berhak/);
	});
});

describe('ubah & batal oleh pengirim', () => {
	it('pengirim mengubah jumlah → penerima mengonfirmasi angka baru', async () => {
		const id = await kirim([['ori_dada', 6]]);
		await expect(terima(kasirTK, id, [['ori_dada', 3]])).rejects.toThrow(/perbedaan/);
		await ubah(kasirBL, id, [['ori_dada', 3]]);
		await terima(kasirTK, id, [['ori_dada', 3]]);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(3);
	});
	it('penerima tidak bisa mengubah/membatalkan; setelah diterima tidak bisa diubah/dibatalkan', async () => {
		const id = await kirim([['ori_dada', 6]]);
		await expect(ubah(kasirTK, id, [['ori_dada', 1]])).rejects.toThrow(/Transfer tidak ditemukan/);
		await expect(batal(kasirTK, id)).rejects.toThrow(/Transfer tidak ditemukan/);
		await terima(kasirTK, id, [['ori_dada', 6]]);
		await expect(ubah(kasirBL, id, [['ori_dada', 1]])).rejects.toThrow(/sudah diterima atau dibatalkan/);
		await expect(batal(kasirBL, id)).rejects.toThrow(/sudah diterima atau dibatalkan/);
	});
	it('dibatalkan (pengirim atau admin) → tidak bisa diterima, stok tidak berubah', async () => {
		const id = await kirim([['ori_dada', 6]]);
		await expect(batal(kasirBL, id, 'x')).rejects.toThrow(/Alasan/);
		await batal(adminId, id);
		await expect(terima(kasirTK, id, [['ori_dada', 6]])).rejects.toThrow(/sudah dibatalkan/);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(0);
	});
});
