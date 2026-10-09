import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { isian, rpc } from './harness-3b';
import { idMenu, idOutlet } from './harness-kasir';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
	shift = {};
});

type Hasil = { baris: { k: string[]; l: string[]; n: number[] }[]; terpotong: boolean };
const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const sekarang = () => nilai<string>('select (now() - interval \'1 minute\')::text as v');
// WIB "YYYY-MM-DD HH:MI" → timestamptz teks
const wib = (t: string) => nilai<string>(`select ($1::timestamp at time zone 'Asia/Jakarta')::text as v`, [t]);
const harga = async (kode: string) =>
	nilai<number>('select h.harga as v from public.harga_jual h join public.menu m on m.id = h.menu_id join public.outlets o on o.id = h.outlet_id where m.kode = $1 and o.kode = $2', [kode, 'BL']);

let shift: Record<string, string> = {};
async function jual(kasir: string, outlet: string, item: [string, number][], metode = 'cash', pada?: string) {
	const o = await idOutlet(db, outlet);
	shift[outlet] ??= await rpc<string>(db, kasir, 'public.buka_shift_offline($1::jsonb)', [
		JSON.stringify({ id: crypto.randomUUID(), outlet_id: o, modal: 0, laci_awal: 0, waktu: await nilai<string>(`select (now() - interval '2 hours')::text as v`) })
	]);
	const id = crypto.randomUUID();
	const total = (await Promise.all(item.map(async ([k, q]) => (await harga(k)) * q))).reduce((a, b) => a + b, 0);
	await rpc(db, kasir, 'public.catat_penjualan_offline($1::jsonb)', [
		JSON.stringify({
			id,
			outlet_id: o,
			shift_id: shift[outlet],
			metode,
			...(metode === 'cash' ? { diterima: total } : {}),
			waktu: await sekarang(),
			kode_struk: 'DSB001',
			item: await Promise.all(item.map(async ([k, q]) => ({ menu_id: await idMenu(db, k), qty: q })))
		})
	]);
	// Geser jam jual (superuser) untuk menguji pengelompokan waktu.
	if (pada) await db.query('update public.penjualan set waktu = $2 where id = $1', [id, await wib(pada)]);
	return { id, total };
}
const hitung = (spek: object, dari: string, sampai: string, outlet: string | null = null) =>
	rpc<Hasil>(db, adminId, 'public.agregasi_dasbor($1::jsonb, $2, $3, $4)', [JSON.stringify(spek), outlet, dari, sampai]);
const hariIni = async () => {
	const d = await nilai<string>(`select (now() at time zone 'Asia/Jakarta')::date::text as v`);
	return [await wib(`${d} 00:00`), await wib(`${d} 23:59:59`)] as const;
};

describe('agregasi dasbor', () => {
	it('omzet, transaksi, rata-rata hari ini; batal tidak dihitung; saringan outlet', async () => {
		const a = await jual(kasirBL, 'BL', [['nasi', 2]]);
		const b = await jual(kasirBL, 'BL', [['ori_dada', 1]], 'qris');
		const c = await jual(kasirTK, 'TK', [['nasi', 1]]);
		const batal = await jual(kasirBL, 'BL', [['nasi', 5]]);
		await rpc(db, adminId, 'public.void_penjualan($1, $2)', [batal.id, 'salah input']);
		const [dari, sampai] = await hariIni();
		const semua = await hitung({ sumber: 'penjualan', ukuran: ['omzet', 'transaksi', 'rata_rata'] }, dari, sampai);
		const total = a.total + b.total + c.total;
		expect(semua.baris).toEqual([{ k: [], l: [], n: [total, 3, Math.round(total / 3)] }]);
		const bl = await hitung({ sumber: 'penjualan', ukuran: ['omzet'] }, dari, sampai, await idOutlet(db, 'BL'));
		expect(bl.baris[0].n).toEqual([a.total + b.total]);
		const bt = await hitung({ sumber: 'batal', ukuran: ['banyak', 'rupiah'] }, dari, sampai);
		expect(bt.baris[0].n).toEqual([1, batal.total]);
	});

	it('kelompok kanal & outlet dengan label; urutan ukuran turun; batas & terpotong', async () => {
		await jual(kasirBL, 'BL', [['nasi', 3]]);
		await jual(kasirBL, 'BL', [['nasi', 1]], 'gofood');
		await jual(kasirTK, 'TK', [['nasi', 1]], 'qris');
		const [dari, sampai] = await hariIni();
		const r = await hitung(
			{ sumber: 'penjualan', ukuran: ['omzet'], kelompok: [{ kolom: 'kanal' }], urutan: { oleh: 'ukuran', arah: 'turun' }, batas: 2 },
			dari,
			sampai
		);
		expect(r.baris.map((x) => x.l[0])).toEqual(['Tunai', expect.stringMatching(/GoFood|QRIS/)]);
		expect(r.terpotong).toBe(true);
		const o = await hitung({ sumber: 'penjualan', ukuran: ['transaksi'], kelompok: [{ kolom: 'outlet' }] }, dari, sampai);
		expect(o.baris.map((x) => [x.l[0], x.n[0]]).sort()).toEqual([['Bukit Lama', 2], ['Talang Kerangga', 1]]);
	});

	it('item: potong ayam (saringan kategori), varian Ori/Hot, menu', async () => {
		await jual(kasirBL, 'BL', [['ori_dada', 2], ['hot_sayap', 3], ['nasi', 4]]);
		const [dari, sampai] = await hariIni();
		const ayam = await hitung({ sumber: 'item', ukuran: ['jumlah'], saringan: { kategori: ['ayam'] } }, dari, sampai);
		expect(ayam.baris[0].n).toEqual([5]);
		const v = await hitung({ sumber: 'item', ukuran: ['jumlah'], kelompok: [{ kolom: 'varian' }], saringan: { kategori: ['ayam'] } }, dari, sampai);
		expect(v.baris.map((x) => [x.l[0], x.n[0]])).toEqual([
			['Hot', 3],
			['Ori', 2]
		]);
	});

	it('waktu per hari / minggu / bulan menurut WIB (jual 23.30 WIB tetap tanggal itu)', async () => {
		await jual(kasirBL, 'BL', [['nasi', 1]], 'cash', '2026-09-28 23:30');
		await jual(kasirBL, 'BL', [['nasi', 2]], 'cash', '2026-09-30 08:00');
		await jual(kasirBL, 'BL', [['nasi', 3]], 'cash', '2026-10-01 07:00');
		const dari = await wib('2026-09-01 00:00');
		const sampai = await wib('2026-11-01 00:00');
		const hari = await hitung({ sumber: 'item', ukuran: ['jumlah'], kelompok: [{ kolom: 'waktu', satuan: 'hari' }] }, dari, sampai);
		expect(hari.baris.map((x) => [x.l[0], x.n[0]])).toEqual([
			['28/09', 1],
			['30/09', 2],
			['01/10', 3]
		]);
		const minggu = await hitung({ sumber: 'item', ukuran: ['jumlah'], kelompok: [{ kolom: 'waktu', satuan: 'minggu' }] }, dari, sampai);
		expect(minggu.baris.map((x) => [x.l[0], x.n[0]])).toEqual([['Mg 28/09', 6]]);
		const bulan = await hitung({ sumber: 'item', ukuran: ['jumlah'], kelompok: [{ kolom: 'waktu', satuan: 'bulan' }] }, dari, sampai);
		expect(bulan.baris.map((x) => [x.l[0], x.n[0]])).toEqual([
			['Sep 2026', 3],
			['Okt 2026', 3]
		]);
		const jam = await hitung({ sumber: 'penjualan', ukuran: ['transaksi'], kelompok: [{ kolom: 'hari' }, { kolom: 'jam' }] }, dari, sampai);
		expect(jam.baris.map((x) => x.l.join(' '))).toEqual(['Sen 23.00', 'Rab 08.00', 'Kam 07.00']);
	});

	it('terbuang (catatan batal tidak dihitung) & pemakaian bahan dari jualan', async () => {
		await jual(kasirBL, 'BL', [['ori_dada', 2]]);
		const o = await idOutlet(db, 'BL');
		const r = async (n: number) => {
			const id = crypto.randomUUID();
			await rpc(db, kasirBL, 'public.catat_rusak_offline($1::jsonb)', [
				JSON.stringify({ id, outlet_id: o, alasan: 'gosong', waktu: await sekarang(), item: await isian(db, [['ori_dada', n]]) })
			]);
			return id;
		};
		await r(1);
		const batal = await r(4);
		await db.query(`update public.rusak set batal_at = now(), batal_oleh = $2, batal_alasan = 'salah' where id = $1`, [batal, adminId]);
		const [dari, sampai] = await hariIni();
		const t = await hitung({ sumber: 'terbuang', ukuran: ['jumlah'], kelompok: [{ kolom: 'alasan' }, { kolom: 'bahan' }] }, dari, sampai);
		expect(t.baris).toEqual([{ k: ['gosong', expect.any(String)], l: ['Gosong', 'Dada Ori (potong)'], n: [1] }]);
		const p = await hitung({ sumber: 'pemakaian', ukuran: ['jumlah'], kelompok: [{ kolom: 'bahan' }], saringan: { bahan: [t.baris[0].k[1]] } }, dari, sampai);
		expect(p.baris[0].n).toEqual([2]);
	});

	it('spek di luar katalog & rentang tidak sah ditolak; kasir ditolak', async () => {
		const [dari, sampai] = await hariIni();
		await expect(hitung({ sumber: 'profiles', ukuran: ['jumlah'] }, dari, sampai)).rejects.toThrow(/Sumber data tidak dikenal/);
		await expect(hitung({ sumber: 'penjualan', ukuran: ['omzet'], kelompok: [{ kolom: 'p.total; drop table x' }] }, dari, sampai)).rejects.toThrow(
			/Pengelompokan tidak dikenal/
		);
		await expect(hitung({ sumber: 'penjualan', ukuran: ['omzet'], saringan: { kanal: [`') or true --`] } }, dari, sampai)).resolves.toMatchObject({
			baris: [{ n: [0] }]
		});
		await expect(hitung({ sumber: 'penjualan', ukuran: ['omzet'], saringan: { 'x; drop': ['a'] } }, dari, sampai)).rejects.toThrow(/Saringan panel tidak sah/);
		await expect(hitung({ sumber: 'penjualan', ukuran: ['omzet'] }, sampai, dari)).rejects.toThrow(/Rentang tanggal tidak sah/);
		await expect(
			rpc(db, kasirBL, 'public.agregasi_dasbor($1::jsonb, $2, $3, $4)', [JSON.stringify({ sumber: 'penjualan', ukuran: ['omzet'] }), null, dari, sampai])
		).rejects.toThrow(/Hanya admin/);
	});

	it('setoran & tutup toko: selisih', async () => {
		const o = await idOutlet(db, 'BL');
		await jual(kasirBL, 'BL', [['nasi', 2]]);
		await rpc(db, kasirBL, 'public.tutup_shift_offline($1::jsonb)', [JSON.stringify({ id: crypto.randomUUID(), shift_id: shift.BL, uang_fisik: 9000, waktu: await sekarang() })]);
		const sid = crypto.randomUUID();
		await rpc(db, kasirBL, 'public.catat_setoran_offline($1::jsonb)', [JSON.stringify({ id: sid, outlet_id: o, jumlah: 8000, waktu: await sekarang() })]);
		await rpc(db, adminId, 'public.terima_setoran($1, $2, $3)', [sid, 7500, 'kurang']);
		const [dari, sampai] = await hariIni();
		expect((await hitung({ sumber: 'tutup_toko', ukuran: ['selisih', 'banyak'] }, dari, sampai)).baris[0].n).toEqual([9000 - 2 * (await harga('nasi')), 1]);
		expect((await hitung({ sumber: 'setoran', ukuran: ['dicatat', 'diterima', 'selisih'] }, dari, sampai)).baris[0].n).toEqual([8000, 7500, -500]);
	});
});
