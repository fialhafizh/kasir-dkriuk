// ±1 tahun data 3 outlet (±100 transaksi/hari/outlet) di PGlite; mengukur waktu laporan utama.
// PGlite jauh lebih lambat dari Postgres server, jadi batas di sini longgar; angka dicetak untuk dibandingkan antar versi.
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from '../db/harness';
import { rpc } from '../db/harness-3b';
import { idOutlet } from '../db/harness-kasir';

const HARI = 365;
const PER_HARI = 100;
let db: PGlite;
let admin: string;
let bl: string;

beforeAll(async () => {
	db = await freshDb();
	admin = await buatUser(db, { username: 'admin', role: 'admin' });
	const kasir = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	bl = await idOutlet(db, 'BL');
	const mulai = Date.now();
	// satu shift tertutup per outlet per hari
	await db.query(`
		insert into public.shift (id, outlet_id, dibuka_oleh, dibuka_at, ditutup_at, ditutup_oleh, uang_fisik, modal)
		select gen_random_uuid(), o.id, $1, now() - make_interval(days => d, hours => 10), now() - make_interval(days => d, hours => 1), $1, 0, 0
		from public.outlets o cross join generate_series(1, ${HARI}) d`, [kasir]);
	await db.query(`
		insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, dicatat_at, metode, total, diterima, kembalian)
		select gen_random_uuid(), s.outlet_id, s.id, $1, 'B' || left(md5(s.id::text || n), 12),
		       s.dibuka_at + make_interval(mins => n * 5), s.dibuka_at + make_interval(mins => n * 5),
		       (array['cash','qris','gofood','grabfood','shopeefood'])[1 + n % 5]::public.metode_bayar, 20000,
		       case when n % 5 = 0 then 20000 end, case when n % 5 = 0 then 0 end
		from public.shift s cross join generate_series(1, ${PER_HARI}) n`, [kasir]);
	await db.query(`
		insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty)
		select p.id, m.id, m.nama, 10000, 1 + (abs(hashtext(p.id::text)) % 2)
		from public.penjualan p cross join lateral (
			select id, nama from public.menu where kategori in ('ayam', 'nasi') order by abs(hashtext(p.id::text || id::text)) limit 2) m`);
	const n = (await db.query<{ n: number }>('select count(*)::int as n from public.penjualan')).rows[0].n;
	console.log(`data uji: ${n} transaksi, ${(await db.query<{ n: number }>('select count(*)::int as n from public.gerakan_stok')).rows[0].n} gerakan stok, ${((Date.now() - mulai) / 1000).toFixed(0)} dtk`);
});

async function waktu<T>(nama: string, fn: () => Promise<T>, batasMs: number): Promise<T> {
	const t = performance.now();
	const h = await fn();
	const ms = performance.now() - t;
	console.log(`${nama.padEnd(46)} ${ms.toFixed(0).padStart(6)} ms`);
	expect(ms, nama).toBeLessThan(batasMs);
	return h;
}
const r = (hari: number) => [new Date(Date.now() - hari * 86_400_000).toISOString(), new Date().toISOString()];

describe('beban ±1 tahun', () => {
	it('laporan utama tetap cepat', async () => {
		const [d30, s] = r(30);
		const [d365] = r(365);
		await waktu('dasbor: omzet per hari × outlet (30 hari)', () =>
			rpc(db, admin, 'public.agregasi_dasbor($1::jsonb, $2, $3, $4)', [JSON.stringify({ jenis: 'garis', sumber: 'penjualan', ukuran: ['omzet'], kelompok: [{ kolom: 'waktu', satuan: 'hari' }, { kolom: 'outlet' }] }), null, d30, s]), 20_000);
		await waktu('dasbor: omzet per bulan (365 hari)', () =>
			rpc(db, admin, 'public.agregasi_dasbor($1::jsonb, $2, $3, $4)', [JSON.stringify({ jenis: 'batang', sumber: 'penjualan', ukuran: ['omzet', 'transaksi'], kelompok: [{ kolom: 'waktu', satuan: 'bulan' }] }), null, d365, s]), 30_000);
		await waktu('dasbor: menu terlaris (30 hari)', () =>
			rpc(db, admin, 'public.agregasi_dasbor($1::jsonb, $2, $3, $4)', [JSON.stringify({ jenis: 'batang', sumber: 'item', ukuran: ['jumlah'], kelompok: [{ kolom: 'menu' }], batas: 10, urutan: { oleh: 'ukuran', arah: 'turun' } }), null, d30, s]), 20_000);
		await waktu('dasbor: jam ramai hari × jam (30 hari)', () =>
			rpc(db, admin, 'public.agregasi_dasbor($1::jsonb, $2, $3, $4)', [JSON.stringify({ jenis: 'peta_panas', sumber: 'penjualan', ukuran: ['transaksi'], kelompok: [{ kolom: 'hari' }, { kolom: 'jam' }] }), null, d30, s]), 20_000);
		await waktu('riwayat kejadian (50 terbaru, 30 hari)', () =>
			rpc(db, admin, 'public.riwayat_kejadian($1, $2, $3, $4, $5, $6, $7)', [null, d30, s, null, null, null, 50]), 20_000);
		const pack = (await db.query<{ id: string }>(`select id from public.satuan_beli where kode = 'pack_ayam_ori'`)).rows[0].id;
		await waktu('siklus stok Ayam Ori (30 hari)', () => rpc(db, admin, 'public.siklus_stok($1, $2, $3, $4)', [bl, pack, d30, s]), 20_000);
		await waktu('untung per menu (30 hari)', () => rpc(db, admin, 'public.untung_menu($1, $2, $3)', [null, d30, s]), 20_000);
		await waktu('rencana belanja (7 hari)', () => rpc(db, admin, 'public.rencana_belanja($1)', [7]), 30_000);
		await waktu('laporan keuangan semua outlet (1 bulan)', () => rpc(db, admin, 'public.laporan_keuangan($1, $2, $3)', [null, d30.slice(0, 10), s.slice(0, 10)]), 20_000);
	});
});
