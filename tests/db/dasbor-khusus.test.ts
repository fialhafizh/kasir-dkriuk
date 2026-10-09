import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { rpc } from './harness-3b';
import { idMenu, idOutlet } from './harness-kasir';
import { idBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	for (const c of ['jual', 'masuk', 'rusak'])
		await db.query(`alter table public.gerakan_stok drop constraint gerakan_sumber_${c}`);
});

const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const jamLalu = (jam: number) => nilai<string>(`select (now() - make_interval(hours => $1::int))::text as v`, [jam]);
/** Gerakan buku besar langsung (superuser) untuk menguji siklus dengan jam pasti; pemeriksaan sumber gerakan dilepas di DB uji ini. */
async function gerak(kode: string, qty: number, jenis: string, jamMundur: number) {
	await db.query('insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu) values ($1, $2, $3, $4, $5)', [
		await idOutlet(db, 'BL'),
		await idBahan(db, kode),
		qty,
		jenis,
		await jamLalu(jamMundur)
	]);
}

type Siklus = {
	label: string;
	satuan: string;
	titik: unknown[];
	masuk: unknown[];
	episode_habis: { habis: string; pulih: string | null }[];
	bertahan_jam: number[];
	jarak_masuk_jam: number | null;
	saldo_sekarang: number;
	pakai_per_hari: number;
	perkiraan_habis_hari: number | null;
};

describe('siklus stok', () => {
	it('episode habis, lama bertahan, jarak barang masuk, pemakaian & perkiraan habis (bahan tunggal)', async () => {
		await gerak('box', 10, 'masuk', 100);
		await gerak('box', -10, 'jual', 76); // habis 24 jam setelah masuk
		await gerak('box', 20, 'masuk', 52); // pulih
		await gerak('box', -6, 'jual', 30);
		await gerak('box', -1, 'rusak', 10);
		const s = await rpc<Siklus>(db, adminId, 'public.siklus_stok($1, $2, $3, $4)', [
			await idOutlet(db, 'BL'),
			await idBahan(db, 'box'),
			await jamLalu(200),
			await jamLalu(0)
		]);
		expect(s.label).toBe("Box D'Kriuk");
		expect(s.episode_habis).toHaveLength(1);
		expect(s.episode_habis[0].pulih).not.toBeNull();
		expect(s.bertahan_jam).toEqual([24]);
		expect(s.jarak_masuk_jam).toBe(48);
		expect(s.saldo_sekarang).toBe(13);
		expect(s.pakai_per_hari).toBe(2.429); // (10 + 6 + 1) ÷ 7 hari terakhir
		expect(s.perkiraan_habis_hari).toBe(5.4);
		expect(s.masuk).toHaveLength(2);
	});

	it('kelompok pack ayam dalam pack-setara', async () => {
		const pack = await nilai<string>(`select id as v from public.satuan_beli where kode = 'pack_ayam_ori'`);
		for (const [k, n] of [['ori_dada', 6], ['ori_paha_atas', 4], ['ori_paha_bawah', 4], ['ori_sayap', 4]] as const) await gerak(k, n, 'masuk', 5);
		const s = await rpc<Siklus>(db, adminId, 'public.siklus_stok($1, $2, $3, $4)', [await idOutlet(db, 'BL'), pack, await jamLalu(24), await jamLalu(0)]);
		expect(s).toMatchObject({ label: 'Ayam Ori', satuan: 'pack', saldo_sekarang: 2 });
	});

	it('kasir ditolak; kunci tidak dikenal ditolak', async () => {
		const o = await idOutlet(db, 'BL');
		await expect(rpc(db, kasirBL, 'public.siklus_stok($1, $2, $3, $4)', [o, 'x', await jamLalu(24), await jamLalu(0)])).rejects.toThrow(/Hanya admin/);
		await expect(rpc(db, adminId, 'public.siklus_stok($1, $2, $3, $4)', [o, 'x', await jamLalu(24), await jamLalu(0)])).rejects.toThrow(/Bahan tidak ditemukan/);
	});
});

describe('riwayat kejadian', () => {
	it('urut terbaru dulu, berbagai jenis, saringan jenis & muat lebih', async () => {
		const o = await idOutlet(db, 'BL');
		const shift = await rpc<string>(db, kasirBL, 'public.buka_shift_offline($1::jsonb)', [
			JSON.stringify({ id: crypto.randomUUID(), outlet_id: o, modal: 0, laci_awal: 0, waktu: await jamLalu(3) })
		]);
		const jual = crypto.randomUUID();
		await rpc(db, kasirBL, 'public.catat_penjualan_offline($1::jsonb)', [
			JSON.stringify({ id: jual, outlet_id: o, shift_id: shift, metode: 'qris', waktu: await jamLalu(2), kode_struk: 'RWY001', item: [{ menu_id: await idMenu(db, 'nasi'), qty: 1 }] })
		]);
		await rpc(db, adminId, 'public.void_penjualan($1, $2)', [jual, 'pelanggan batal']);
		await rpc(db, kasirBL, 'public.catat_setoran_offline($1::jsonb)', [JSON.stringify({ id: crypto.randomUUID(), outlet_id: o, jumlah: 1000, waktu: await jamLalu(1) })]);
		const r = await rpc<{ jenis: string; judul: string; rincian: string; waktu: string }[]>(db, adminId, 'public.riwayat_kejadian($1, $2, $3, $4, $5, $6)', [
			o,
			await jamLalu(24),
			await jamLalu(-1),
			null,
			null,
			50
		]);
		expect(r.map((x) => x.jenis)).toEqual(['batal', 'setoran', 'jual', 'toko']);
		expect(r[0].rincian).toContain('pelanggan batal');
		const hanyaJual = await rpc<unknown[]>(db, adminId, 'public.riwayat_kejadian($1, $2, $3, $4, $5, $6)', [o, await jamLalu(24), await jamLalu(-1), ['jual'], null, 50]);
		expect(hanyaJual).toHaveLength(1);
		const lebih = await rpc<{ jenis: string }[]>(db, adminId, 'public.riwayat_kejadian($1, $2, $3, $4, $5, $6)', [o, await jamLalu(24), await jamLalu(-1), null, r[1].waktu, 50]);
		expect(lebih.map((x) => x.jenis)).toEqual(['jual', 'toko']);
	});
});
