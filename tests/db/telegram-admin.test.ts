import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai } from './harness';
import { rpc } from './harness-3b';
import { idMenu, idOutlet } from './harness-kasir';

let db: PGlite;
let adminId: string;
let kasirBL: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	await db.query(`update public.telegram_pengaturan set chat_id = -100123, topik = '{"struk":2,"harian":3,"peringatan":4,"kas":5}'`);
});

const AMBIL = `select * from public._tg_ambil('00000000-0000-0000-0000-000000000001', 20)`;
const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const antre = (kunci: string) =>
	nilai<number>(`insert into public.telegram_antrean (kunci, jenis, topik, teks) values ($1, 'struk', 'struk', 'halo') returning id as v`, [kunci]);
const lalu = (menit: number) => nilai<string>(`select (now() - make_interval(mins => $1))::text as v`, [menit]);
// Jam WIB hari ini dalam bentuk timestamptz.
const wib = (hhmm: string) => nilai<string>(`select (((now() at time zone 'Asia/Jakarta')::date + $1::time) at time zone 'Asia/Jakarta')::text as v`, [hhmm]);
const harian = () => db.query<{ teks: string }>(`select teks from public.telegram_antrean where jenis = 'harian'`).then((r) => r.rows);

describe('ringkasan harian', () => {
	// Transaksi 1–2 menit lalu: gagal hanya bila tes dijalankan tepat lewat tengah malam WIB.
	it('sekali per tanggal, hanya setelah jamnya; isi omzet per outlet & menu terlaris', async () => {
		const shift = (await rpc<string>(db, kasirBL, 'public.buka_shift_offline($1::jsonb)', [
			JSON.stringify({ id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), modal: 0, laci_awal: 0, waktu: await lalu(2) })
		])) as string;
		await rpc(db, kasirBL, 'public.catat_penjualan_offline($1::jsonb)', [
			JSON.stringify({
				id: crypto.randomUUID(),
				outlet_id: await idOutlet(db, 'BL'),
				shift_id: shift,
				metode: 'qris',
				waktu: await lalu(1),
				kode_struk: 'HAR001',
				item: [{ menu_id: await idMenu(db, 'nasi'), qty: 3 }]
			})
		]);
		await db.query('select public._tg_tiap_menit($1)', [await wib('21:59')]);
		expect(await harian()).toHaveLength(0);
		await db.query('select public._tg_tiap_menit($1)', [await wib('22:00')]);
		await db.query('select public._tg_tiap_menit($1)', [await wib('23:30')]);
		const h = await harian();
		expect(h).toHaveLength(1);
		expect(h[0].teks).toMatch(/<b>Bukit Lama<\/b> — Rp15\.000 \(1 transaksi\)/);
		expect(h[0].teks).toContain('QRIS Rp15.000');
		expect(h[0].teks).toContain('1. Nasi (3)');
		expect(h[0].teks).toContain('Toko belum ditutup');
		expect(h[0].teks).toContain('Total semua outlet Rp15.000');
	});

	it('jam diatur admin', async () => {
		await rpc(db, adminId, 'public.simpan_telegram($1::jsonb)', [JSON.stringify({ jam_harian: '20:30', batas_pengeluaran: 50000, jenis_mati: [] })]);
		await db.query('select public._tg_tiap_menit($1)', [await wib('20:31')]);
		expect(await harian()).toHaveLength(1);
	});

	it('belum terhubung: tidak ada ringkasan', async () => {
		await db.query('update public.telegram_pengaturan set chat_id = null');
		await db.query('select public._tg_tiap_menit($1)', [await wib('23:00')]);
		expect(await harian()).toHaveLength(0);
	});
});

describe('antrean kirim', () => {
	it('ambil meminjam pesan (tidak terambil dua kali) & urut', async () => {
		const a = await antre('a');
		const b = await antre('b');
		const r = (await db.query<{ id: number; chat_id: number; thread_id: number }>(AMBIL)).rows;
		expect(r.map((x) => Number(x.id))).toEqual([a, b]);
		expect(Number(r[0].thread_id)).toBe(2);
		expect(Number(r[0].chat_id)).toBe(-100123);
		expect((await db.query(AMBIL)).rows).toHaveLength(0);
	});

	it('gagal: dicoba lagi bertahap, berhenti setelah 10 kali; retry_after tidak dihitung; kirim ulang admin', async () => {
		const a = await antre('a');
		await db.query(`select public._tg_hasil($1, false, 'Too Many Requests', 7)`, [a]);
		await db.query('update public.telegram_pengaturan set jeda_sampai = null');
		expect(await nilai<number>('select percobaan as v from public.telegram_antrean where id = $1', [a])).toBe(0);
		await db.query(`select public._tg_hasil($1, false, 'Bad Request')`, [a]);
		expect(await nilai<number>(`select round(extract(epoch from kirim_lagi_at - now()) / 60)::int as v from public.telegram_antrean where id = $1`, [a])).toBe(1);
		for (let i = 0; i < 9; i++) await db.query(`select public._tg_hasil($1, false, 'Bad Request')`, [a]);
		await db.query(`update public.telegram_antrean set kirim_lagi_at = now() - interval '1 second'`);
		expect((await db.query(AMBIL)).rows).toHaveLength(0);
		const st = await rpc<{ gagal: { id: number; galat: string }[]; menunggu: number }>(db, adminId, 'public.telegram_status()', []);
		expect(st.gagal).toHaveLength(1);
		expect(st.gagal[0].galat).toBe('Bad Request');
		expect(st.menunggu).toBe(0);
		expect(await rpc<number>(db, adminId, 'public.kirim_ulang_telegram($1)', [a])).toBe(1);
		expect((await db.query(AMBIL)).rows).toHaveLength(1);
		await db.query('select public._tg_hasil($1, true)', [a]);
		expect(await nilai<boolean>('select terkirim_at is not null as v from public.telegram_antrean where id = $1', [a])).toBe(true);
	});
});

describe('pengirim tunggal & batas kecepatan', () => {
	const ambil = (pengirim: string) => db.query(`select * from public._tg_ambil($1, 20)`, [pengirim]).then((r) => r.rows);
	const A = crypto.randomUUID();
	const B = crypto.randomUUID();
	it('pengirim lain menunggu sampai giliran dilepas; retry_after menjeda semua', async () => {
		await antre('a');
		expect(await ambil(A)).toHaveLength(1);
		await antre('b');
		expect(await ambil(B)).toHaveLength(0);
		expect(await ambil(A)).toHaveLength(1);
		await db.query('select public._tg_selesai($1)', [A]);
		await antre('c');
		const c = (await ambil(B)) as { id: number }[];
		expect(c).toHaveLength(1);
		await db.query(`select public._tg_hasil($1, false, 'Too Many Requests', 30)`, [c[0].id]);
		await db.query('select public._tg_selesai($1)', [B]);
		await antre('d');
		expect(await ambil(A)).toHaveLength(0);
	});
	it('topik dihapus: id dilupakan, pesan berikutnya ke General & status minta hubungkan ulang', async () => {
		await db.query(`select public._tg_topik_hilang('struk')`);
		await antre('a');
		const r = (await ambil(A)) as { topik: string; thread_id: number | null }[];
		expect(r[0]).toMatchObject({ topik: 'struk', thread_id: null });
		expect(await rpc(db, adminId, 'public.telegram_status()', [])).toMatchObject({ topik_lengkap: false });
	});
});

describe('akses', () => {
	it('kasir tidak bisa membaca/mengatur Telegram atau antrean', async () => {
		await antre('a');
		await expect(rpc(db, kasirBL, 'public.telegram_status()', [])).rejects.toThrow(/Hanya admin/);
		await expect(rpc(db, kasirBL, 'public.simpan_telegram($1::jsonb)', [JSON.stringify({ jam_harian: '20:00', batas_pengeluaran: 0 })])).rejects.toThrow(
			/Hanya admin/
		);
		await expect(sebagai(db, kasirBL, () => db.query('select * from public.telegram_antrean'))).rejects.toThrow(/permission denied/);
		await expect(sebagai(db, kasirBL, () => db.query('select * from public.telegram_pengaturan'))).rejects.toThrow(/permission denied/);
		await expect(sebagai(db, kasirBL, () => db.query(AMBIL))).rejects.toThrow(/permission denied/);
		await expect(sebagai(db, adminId, () => db.query('select public._tg_hasil(1, true)'))).rejects.toThrow(/permission denied/);
		await expect(sebagai(db, adminId, () => db.query('select public._tg_kunci_cron()'))).rejects.toThrow(/permission denied/);
		await expect(rpc(db, kasirBL, 'public.kirim_ulang_telegram($1)', [null])).rejects.toThrow(/Hanya admin/);
	});

	it('simpan_telegram memvalidasi isian', async () => {
		const simpan = (p: object) => rpc(db, adminId, 'public.simpan_telegram($1::jsonb)', [JSON.stringify(p)]);
		await expect(simpan({ jam_harian: '25:00', batas_pengeluaran: 0 })).rejects.toThrow(/Jam ringkasan/);
		await expect(simpan({ jam_harian: '22:00', batas_pengeluaran: -1 })).rejects.toThrow(/Batas pengeluaran/);
		await expect(simpan({ jam_harian: '22:00', batas_pengeluaran: 0, jenis_mati: ['hapus'] })).rejects.toThrow(/Jenis pesan/);
		await simpan({ jam_harian: '21:15', batas_pengeluaran: 250000, jenis_mati: ['struk', 'struk'] });
		expect(await rpc(db, adminId, 'public.telegram_status()', [])).toMatchObject({
			jam_harian: '21:15',
			batas_pengeluaran: 250000,
			jenis_mati: ['struk'],
			terhubung: true,
			topik_lengkap: true
		});
	});
});
