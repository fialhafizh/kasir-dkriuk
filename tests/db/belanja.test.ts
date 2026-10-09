import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { rpc } from './harness-3b';
import { idOutlet } from './harness-kasir';
import { idBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	// buku stok diisi langsung (superuser): pemeriksaan sumber gerakan dilepas di DB uji ini
	for (const c of ['jual', 'masuk', 'rusak']) await db.query(`alter table public.gerakan_stok drop constraint gerakan_sumber_${c}`);
});

const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const satuan = (kode: string) => nilai<string>('select id as v from public.satuan_beli where kode = $1', [kode]);
async function gerak(outlet: string, kode: string, qty: number, jenis: string, hariLalu: number) {
	await db.query(`insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu) values ($1, $2, $3, $4, now() - make_interval(days => $5))`, [
		await idOutlet(db, outlet),
		await idBahan(db, kode),
		qty,
		jenis,
		hariLalu
	]);
}
type Rencana = { hari: number; barang: { nama: string; per_outlet: Record<string, { stok: number | null; saran: number; harga: number | null; dari_beli: boolean }> }[] };
const rencana = (hari = 7) => rpc<Rencana>(db, adminId, 'public.rencana_belanja($1)', [hari]);

describe('rencana belanja', () => {
	it('contoh owner: Bukit Lama pakai 80 pack Ori seminggu, sisa 10 → beli 70; habis → kebutuhan penuh', async () => {
		const isi = [['ori_dada', 3], ['ori_paha_atas', 2], ['ori_paha_bawah', 2], ['ori_sayap', 2]] as const;
		// masuk 90 pack 10 hari lalu, terjual 80 pack dalam 7 hari terakhir → sisa 10 pack
		for (const [k, n] of isi) await gerak('BL', k, 90 * n, 'masuk', 10);
		for (const [k, n] of isi) await gerak('BL', k, -80 * n, 'jual', 3);
		// kulit: terjual 4 pack (17 porsi/pack) seminggu, stok habis
		await gerak('BL', 'kulit', 68, 'masuk', 10);
		await gerak('BL', 'kulit', -68, 'jual', 2);
		await db.query('insert into public.harga_beli (outlet_id, satuan_beli_id, harga) values ($1, $2, 43210)', [await idOutlet(db, 'BL'), await satuan('pack_ayam_ori')]);
		const r = await rencana();
		const bl = await idOutlet(db, 'BL');
		const ori = r.barang.find((b) => b.nama.startsWith('Pack Ayam Ori'))!.per_outlet[bl];
		expect(ori).toMatchObject({ saran: 70, harga: 43210, dari_beli: false });
		expect(Number(ori.stok)).toBe(10);
		expect(r.barang.find((b) => b.nama === 'Pack Kulit Mentah')!.per_outlet[bl].saran).toBe(4);
		expect(r.barang.find((b) => b.nama.startsWith('Pack Ayam Hot'))!.per_outlet[bl].saran).toBe(0);
		// 14 hari → 160 − 10 = 150
		expect((await rencana(14)).barang.find((b) => b.nama.startsWith('Pack Ayam Ori'))!.per_outlet[bl].saran).toBe(150);
	});

	it('bahan tidak dipotong otomatis (minyak): dari rata-rata pembelian 28 hari, stok tidak dipakai', async () => {
		const id = crypto.randomUUID();
		const bl = await idOutlet(db, 'BL');
		await db.query(`insert into public.barang_masuk (id, outlet_id, tanggal, waktu, total) values ($1, $2, current_date, now() - interval '5 days', 0)`, [id, bl]);
		await db.query(`insert into public.barang_masuk_item (barang_masuk_id, satuan_beli_id, nama, qty, harga) values ($1, $2, 'Minyak', 40, 4321)`, [id, await satuan('minyak_liter')]);
		const r = await rencana();
		const m = r.barang.find((b) => b.nama.startsWith('Minyak'))!.per_outlet[bl];
		expect(m).toMatchObject({ stok: null, dari_beli: true, saran: 10, harga: 4321 });
	});

	it('hari tidak sah & kasir ditolak', async () => {
		await expect(rencana(0)).rejects.toThrow(/Jumlah hari/);
		await expect(rpc(db, kasirBL, 'public.rencana_belanja($1)', [7])).rejects.toThrow(/Hanya admin/);
	});
});

describe('kirim teks ke Telegram', () => {
	it('masuk antrean topik kas, di-escape; belum terhubung ditolak', async () => {
		await expect(rpc(db, adminId, 'public.kirim_teks_telegram($1, $2)', ['belanja', 'x'])).rejects.toThrow(/belum dihubungkan/);
		await db.query(`update public.telegram_pengaturan set chat_id = -100123`);
		await rpc(db, adminId, 'public.kirim_teks_telegram($1, $2)', ['belanja', 'Ayam <Ori> & Hot: 70']);
		const r = (await db.query<{ topik: string; teks: string }>(`select topik, teks from public.telegram_antrean where jenis = 'belanja'`)).rows;
		expect(r).toEqual([{ topik: 'kas', teks: 'Ayam &lt;Ori&gt; &amp; Hot: 70' }]);
		await expect(rpc(db, adminId, 'public.kirim_teks_telegram($1, $2)', ['struk', 'x'])).rejects.toThrow(/Jenis pesan/);
		await expect(rpc(db, kasirBL, 'public.kirim_teks_telegram($1, $2)', ['belanja', 'x'])).rejects.toThrow(/Hanya admin/);
	});
});
