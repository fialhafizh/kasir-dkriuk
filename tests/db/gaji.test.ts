import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { rpc } from './harness-3b';
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
});

const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const BL = () => idOutlet(db, 'BL');
const jam = async (mundurMenit: number) => (await db.query<{ w: string }>(`select (now() - make_interval(mins => $1))::text as w`, [mundurMenit])).rows[0].w;
// Bulan lalu (WIB) supaya semua tanggal kehadiran ≤ hari ini.
const bulanLalu = () => nilai<string>(`select (date_trunc('month', public.tanggal_wib(now())) - interval '1 month')::date::text as v`);
const tgl = async (hari: number) => nilai<string>(`select ((date_trunc('month', public.tanggal_wib(now())) - interval '1 month')::date + $1::int - 1)::text as v`, [hari]);

async function karyawan(nama = 'Budi', upah = 70000, outlet?: string) {
	return rpc<string>(db, adminId, 'public.simpan_karyawan($1::jsonb)', [JSON.stringify({ outlet_id: outlet ?? (await BL()), nama, upah_harian: upah })]);
}
const hadir = async (k: string, hari: number, ya = true) => rpc(db, adminId, 'public.atur_kehadiran($1, $2::date, $3)', [k, await tgl(hari), ya]);
async function kasbonLaci(k: string, jumlah: number, oleh = kasirBL, id = crypto.randomUUID()) {
	const p = { id, outlet_id: await BL(), karyawan_id: k, jumlah, waktu: await jam(5) };
	return rpc<string>(db, oleh, 'public.catat_kasbon_offline($1::jsonb)', [JSON.stringify(p)]);
}
async function bayar(k: string, opsi: { potongan?: number; penyesuaian?: number; ket?: string; sumber?: string; id?: string } = {}) {
	const p = {
		id: opsi.id ?? crypto.randomUUID(),
		karyawan_id: k,
		bulan: await bulanLalu(),
		penyesuaian: opsi.penyesuaian ?? 0,
		...(opsi.ket ? { keterangan: opsi.ket } : {}),
		potongan_kasbon: opsi.potongan ?? 0,
		sumber: opsi.sumber ?? 'luar'
	};
	return rpc<{ id: string; dibayar: number; hari_masuk: number }>(db, adminId, 'public.bayar_gaji($1::jsonb)', [JSON.stringify(p)]);
}
const saldo = async () => (await rpc<{ saldo: number }>(db, kasirBL, 'public.saldo_laci($1)', [await BL()])).saldo;
async function buka(laci: number) {
	const p = { id: crypto.randomUUID(), outlet_id: await BL(), modal: laci, laci_awal: laci, waktu: await jam(60) };
	return rpc<string>(db, kasirBL, 'public.buka_shift_offline($1::jsonb)', [JSON.stringify(p)]);
}

describe('karyawan & kehadiran', () => {
	it('admin mengelola; kasir hanya melihat nama karyawan aktif outletnya (tanpa upah)', async () => {
		const k = await karyawan('Budi', 70000);
		await karyawan('Sari', 65000);
		const nonaktif = await karyawan('Lama', 60000);
		await rpc(db, adminId, 'public.simpan_karyawan($1::jsonb)', [JSON.stringify({ id: nonaktif, nama: 'Lama', upah_harian: 60000, aktif: false })]);
		await expect(rpc(db, kasirBL, 'public.simpan_karyawan($1::jsonb)', [JSON.stringify({ outlet_id: await BL(), nama: 'X', upah_harian: 1 })])).rejects.toThrow(/Hanya admin/);
		const daftar = await rpc<{ id: string; nama: string }[]>(db, kasirBL, '(select jsonb_agg(x) from public.karyawan_outlet($1) x)', [await BL()]);
		expect(daftar.map((x) => x.nama)).toEqual(['Budi', 'Sari']);
		expect(Object.keys(daftar[0])).toEqual(['id', 'nama']);
		expect(await rpc<number>(db, kasirBL, '(select count(*)::int from public.karyawan)', [])).toBe(0);
		await expect(rpc(db, kasirTK, '(select count(*) from public.karyawan_outlet($1))', [await BL()])).rejects.toThrow(/tidak berhak/);
		expect(k).toBeTruthy();
	});
	it('kehadiran dicentang/dihapus admin; hari masuk terhitung', async () => {
		const k = await karyawan();
		await hadir(k, 1);
		await hadir(k, 2);
		await hadir(k, 2);
		await hadir(k, 3);
		await hadir(k, 3, false);
		const r = await rpc<{ hari_masuk: number; upah_harian: number }[]>(db, adminId, 'public.hitung_gaji($1, $2::date)', [await BL(), await bulanLalu()]);
		expect(r[0]).toMatchObject({ hari_masuk: 2, upah_harian: 70000 });
		await expect(rpc(db, kasirBL, 'public.atur_kehadiran($1, $2::date, $3)', [k, await tgl(4), true])).rejects.toThrow(/Hanya admin/);
	});
});

describe('kasbon & gaji', () => {
	it('kasbon dari laci mengurangi saldo laci; idempoten; formulir pengeluaran biasa tidak bisa membuat kasbon', async () => {
		await buka(300000);
		const k = await karyawan();
		const id = crypto.randomUUID();
		await kasbonLaci(k, 50000, kasirBL, id);
		await kasbonLaci(k, 50000, kasirBL, id);
		expect(await saldo()).toBe(250000);
		const kasbon = await nilai<string>(`select id as v from public.kategori_pengeluaran where kode = 'kasbon'`);
		await expect(
			rpc(db, kasirBL, 'public.catat_pengeluaran_offline($1::jsonb)', [JSON.stringify({ id: crypto.randomUUID(), outlet_id: await BL(), kategori_id: kasbon, jumlah: 1, waktu: await jam(1) })])
		).rejects.toThrow(/dicatat lewat menu Kasbon/);
		const lain = await karyawan('Tono', 1, await idOutlet(db, 'TK'));
		await expect(kasbonLaci(lain, 1000)).rejects.toThrow(/Karyawan tidak ditemukan/);
	});
	it('gajian: hari × upah + penyesuaian − potongan kasbon; sisa kasbon dibawa; kehadiran terkunci; batal membuka lagi & koreksi laci', async () => {
		await buka(500000);
		const k = await karyawan('Budi', 70000);
		for (const h of [1, 2, 3]) await hadir(k, h);
		await kasbonLaci(k, 100000);
		await expect(bayar(k, { potongan: 150000 })).rejects.toThrow(/melebihi sisa kasbon/);
		await expect(bayar(k, { penyesuaian: 10000 })).rejects.toThrow(/Keterangan penyesuaian wajib/);
		const g = await bayar(k, { potongan: 60000, penyesuaian: 10000, ket: 'bonus rajin', sumber: 'laci' });
		expect(g).toMatchObject({ hari_masuk: 3, dibayar: 3 * 70000 + 10000 - 60000 });
		expect(await saldo()).toBe(500000 - 100000 - 160000);
		const r = await rpc<{ sisa_kasbon: number; gaji: { id: string } | null }[]>(db, adminId, 'public.hitung_gaji($1, $2::date)', [await BL(), await bulanLalu()]);
		expect(r[0].sisa_kasbon).toBe(40000);
		await expect(hadir(k, 4)).rejects.toThrow(/sudah dibayar/);
		await expect(bayar(k)).rejects.toThrow(/sudah dibayar/);
		// Pembayaran gaji hanya bisa dibatalkan dari halaman Gaji; kasbon yang sudah dipotong tidak bisa dibatalkan.
		const peng = await nilai<string>('select pengeluaran_id as v from public.gaji where id = $1', [g.id]);
		await expect(rpc(db, adminId, 'public.batal_pengeluaran($1, $2)', [peng, 'salah'])).rejects.toThrow(/lewat halaman Gaji/);
		const kb = await nilai<string>(`select id as v from public.pengeluaran where karyawan_id = $1 and kategori_id = (select id from public.kategori_pengeluaran where kode = 'kasbon')`, [k]);
		await expect(rpc(db, adminId, 'public.batal_pengeluaran($1, $2)', [kb, 'salah'])).rejects.toThrow(/sudah dipotong dari gaji/);
		await rpc(db, adminId, 'public.batal_gaji($1, $2)', [g.id, 'salah hitung']);
		expect(await saldo()).toBe(500000 - 100000);
		await hadir(k, 4);
		// Kirim ulang id lama tidak membuat gaji baru.
		expect((await bayar(k, { id: g.id })).id).toBe(g.id);
	});
});

async function jualCash(shift: string, porsi: number) {
	const p = { id: crypto.randomUUID(), outlet_id: await BL(), shift_id: shift, metode: 'cash', diterima: porsi * 5000, waktu: await jam(30), kode_struk: 'GAJ001', item: [{ menu_id: await idMenu(db, 'nasi'), qty: porsi }] };
	await rpc(db, kasirBL, 'public.catat_penjualan_offline($1::jsonb)', [JSON.stringify(p)]);
}

describe('laporan keuangan', () => {
	it('laba sederhana: omzet − belanja bahan − gaji − sewa − pengeluaran lain; kasbon & pembayaran gaji bukan biaya ganda', async () => {
		const s = await buka(100000);
		await jualCash(s, 20);
		const o = await BL();
		const hari = await nilai<string>('select public.tanggal_wib(now())::text as v');
		await db.query(`insert into public.barang_masuk (id, outlet_id, tanggal, waktu, total) values (gen_random_uuid(), $1, $2::date, now(), 43210)`, [o, hari]);
		const gas = await nilai<string>(`select id as v from public.kategori_pengeluaran where nama = 'Gas'`);
		await rpc(db, kasirBL, 'public.catat_pengeluaran_offline($1::jsonb)', [JSON.stringify({ id: crypto.randomUUID(), outlet_id: o, kategori_id: gas, jumlah: 6000, waktu: await jam(20) })]);
		const k = await karyawan('Budi', 70000);
		await rpc(db, adminId, 'public.atur_kehadiran($1, $2::date, true)', [k, hari]);
		await kasbonLaci(k, 30000);
		await rpc(db, adminId, 'public.simpan_biaya_tetap($1::jsonb)', [JSON.stringify({ outlet_id: o, nama: 'Sewa', per_tahun: 36500000, mulai: '2026-01-01' })]);
		const r = await rpc<Record<string, number | unknown>>(db, adminId, 'public.laporan_keuangan($1, $2::date, $3::date)', [o, hari, hari]);
		expect(r).toMatchObject({ omzet: 100000, belanja_bahan: 43210, gaji: 70000, sewa: 100000, pengeluaran_lain_total: 6000, laba: 100000 - 43210 - 70000 - 100000 - 6000 });
		expect(r.pengeluaran_lain).toEqual([{ kategori: 'Gas', jumlah: 6000 }]);
		const keluar = r.arus_keluar as { kategori: string; laci: number; luar: number }[];
		expect(keluar.find((x) => x.kategori === 'Kasbon karyawan')).toMatchObject({ laci: 30000, luar: 0 });
		await expect(rpc(db, kasirBL, 'public.laporan_keuangan($1, $2::date, $3::date)', [o, hari, hari])).rejects.toThrow(/Hanya admin/);
	});
	it('sewa mengikuti baris yang berlaku per hari; semua outlet dijumlah', async () => {
		const o = await BL();
		const t = await idOutlet(db, 'TK');
		await rpc(db, adminId, 'public.simpan_biaya_tetap($1::jsonb)', [JSON.stringify({ outlet_id: o, per_tahun: 36500000, mulai: '2026-01-01' })]);
		await rpc(db, adminId, 'public.simpan_biaya_tetap($1::jsonb)', [JSON.stringify({ outlet_id: o, per_tahun: 73000000, mulai: '2026-03-03' })]);
		await rpc(db, adminId, 'public.simpan_biaya_tetap($1::jsonb)', [JSON.stringify({ outlet_id: t, per_tahun: 18250000, mulai: '2026-01-01' })]);
		const bl = await rpc<{ sewa: number }>(db, adminId, 'public.laporan_keuangan($1, $2::date, $3::date)', [o, '2026-03-01', '2026-03-04']);
		expect(bl.sewa).toBe(100000 * 2 + 200000 * 2);
		const semua = await rpc<{ sewa: number }>(db, adminId, 'public.laporan_keuangan($1, $2::date, $3::date)', [null, '2026-03-01', '2026-03-04']);
		expect(semua.sewa).toBe(600000 + 50000 * 4);
	});
	it('gaji: upah dari gaji yang dibayar, penyesuaian masuk bila bulannya di periode', async () => {
		const k = await karyawan('Budi', 70000);
		await hadir(k, 1);
		await hadir(k, 2);
		await bayar(k, { penyesuaian: -5000, ket: 'telat' });
		await rpc(db, adminId, 'public.simpan_karyawan($1::jsonb)', [JSON.stringify({ id: k, nama: 'Budi', upah_harian: 90000 })]);
		const awal = await bulanLalu();
		const akhir = await nilai<string>(`select (date_trunc('month', public.tanggal_wib(now())) - interval '1 day')::date::text as v`);
		const r = await rpc<{ gaji: number }>(db, adminId, 'public.laporan_keuangan($1, $2::date, $3::date)', [await BL(), awal, akhir]);
		expect(r.gaji).toBe(2 * 70000 - 5000);
	});
});
