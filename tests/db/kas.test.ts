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

const jam = async (mundurMenit: number) => (await db.query<{ w: string }>(`select (now() - make_interval(mins => $1))::text as w`, [mundurMenit])).rows[0].w;
const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const BL = () => idOutlet(db, 'BL');
const kategori = (nama: string) => nilai<string>('select id as v from public.kategori_pengeluaran where nama = $1', [nama]);

async function buka(mundur: number, laciAwal?: number, oleh = kasirBL) {
	const p = { id: crypto.randomUUID(), outlet_id: await BL(), modal: laciAwal ?? 0, ...(laciAwal !== undefined ? { laci_awal: laciAwal } : {}), waktu: await jam(mundur) };
	return rpc<string>(db, oleh, 'public.buka_shift_offline($1::jsonb)', [JSON.stringify(p)]);
}
/** Jual cash: nasi (Rp5.000/porsi) sebanyak `porsi`. */
async function jual(shift: string, mundur: number, porsi: number) {
	const p = {
		id: crypto.randomUUID(),
		outlet_id: await BL(),
		shift_id: shift,
		metode: 'cash',
		diterima: porsi * 5000,
		waktu: await jam(mundur),
		kode_struk: 'KAS001',
		item: [{ menu_id: await idMenu(db, 'nasi'), qty: porsi }]
	};
	await rpc(db, kasirBL, 'public.catat_penjualan_offline($1::jsonb)', [JSON.stringify(p)]);
	return p.id;
}
async function tutup(shift: string, mundur: number, uang: number) {
	const p = { id: crypto.randomUUID(), shift_id: shift, uang_fisik: uang, waktu: await jam(mundur) };
	return rpc<{ selisih: number; cash_seharusnya: number }>(db, kasirBL, 'public.tutup_shift_offline($1::jsonb)', [JSON.stringify(p)]);
}
async function pengeluaran(mundur: number, jumlah: number, nama = 'Gas', ket?: string, oleh = kasirBL, id = crypto.randomUUID()) {
	const p = { id, outlet_id: await BL(), kategori_id: await kategori(nama), jumlah, ...(ket ? { keterangan: ket } : {}), waktu: await jam(mundur) };
	return rpc<string>(db, oleh, 'public.catat_pengeluaran_offline($1::jsonb)', [JSON.stringify(p)]);
}
async function setor(mundur: number, jumlah: number, id = crypto.randomUUID()) {
	const p = { id, outlet_id: await BL(), jumlah, waktu: await jam(mundur) };
	return rpc<string>(db, kasirBL, 'public.catat_setoran_offline($1::jsonb)', [JSON.stringify(p)]);
}
const saldo = async (oleh = kasirBL) => (await rpc<{ saldo: number }>(db, oleh, 'public.saldo_laci($1)', [await BL()])).saldo;
const ringkasan = (shift: string) => rpc<{ selisih: number; cash_seharusnya: number; modal: number; pengeluaran_laci: number; setoran: number }>(db, kasirBL, 'public.ringkasan_shift($1)', [shift]);

describe('buku kas laci', () => {
	it('contoh owner: uang laci menumpuk lintas shift, pengeluaran, setoran, modal = saldo', async () => {
		const s1 = await buka(600, 100000);
		await jual(s1, 590, 160);
		expect(await tutup(s1, 540, 900000)).toMatchObject({ cash_seharusnya: 900000, selisih: 0 });
		const s2 = await buka(480);
		expect((await ringkasan(s2)).modal).toBe(900000);
		await jual(s2, 470, 120);
		await tutup(s2, 420, 1500000);
		const s3 = await buka(360);
		await jual(s3, 350, 240);
		await pengeluaran(330, 100000);
		const r3 = await tutup(s3, 300, 2600000);
		expect(r3).toMatchObject({ cash_seharusnya: 2600000, selisih: 0 });
		expect(await saldo()).toBe(2600000);
		// Setoran diambil malam setelah toko tutup.
		await setor(240, 2500000);
		expect(await saldo()).toBe(100000);
		const s4 = await buka(60);
		expect(await ringkasan(s4)).toMatchObject({ modal: 100000, cash_seharusnya: 100000 });
		expect((await ringkasan(s3)).pengeluaran_laci).toBe(100000);
	});
	it('penjualan offline berjam sebelum tutup yang tiba sesudahnya: selisih shift itu terkoreksi, saldo sekarang tetap', async () => {
		const s = await buka(180, 100000);
		// Uang di laci sudah termasuk penjualan yang belum terkirim.
		expect(await tutup(s, 60, 105000)).toMatchObject({ selisih: 5000 });
		await jual(s, 120, 1);
		expect((await ringkasan(s)).selisih).toBe(0);
		expect(await saldo()).toBe(105000);
	});
	it('perangkat kedua yang membuka bersamaan tidak membuat uang laci awal ganda', async () => {
		await buka(120, 100000);
		await buka(110, 70000);
		expect(await nilai<number>('select count(*)::int as v from public.laci_awal')).toBe(1);
		expect(await saldo()).toBe(100000);
	});
	it('outlet nonaktif tidak bisa buka toko; kasir outlet lain tidak bisa membaca saldo', async () => {
		await expect(rpc(db, kasirTK, 'public.saldo_laci($1)', [await BL()])).rejects.toThrow(/tidak berhak/);
		await db.query(`update public.outlets set aktif = false where kode = 'BL'`);
		await expect(buka(60, 100000)).rejects.toThrow(/Outlet ini nonaktif/);
	});
});

describe('pengeluaran', () => {
	it('mengurangi laci; kategori admin ditolak untuk kasir; Lain-lain wajib keterangan; kirim ulang sekali', async () => {
		await buka(120, 100000);
		await expect(pengeluaran(60, 5000, 'Belanja bahan')).rejects.toThrow(/Kategori pengeluaran tidak dikenal/);
		await expect(pengeluaran(60, 5000, 'Lain-lain')).rejects.toThrow(/Keterangan wajib/);
		const id = crypto.randomUUID();
		await pengeluaran(60, 7000, 'Lain-lain', 'beli sabun', kasirBL, id);
		await pengeluaran(60, 7000, 'Lain-lain', 'beli sabun', kasirBL, id);
		expect(await saldo()).toBe(93000);
		await expect(rpc(db, kasirTK, 'public.catat_pengeluaran_offline($1::jsonb)', [
			JSON.stringify({ id: crypto.randomUUID(), outlet_id: await BL(), kategori_id: await kategori('Gas'), jumlah: 1, waktu: await jam(1) })
		])).rejects.toThrow(/tidak berhak/);
	});
	it('batal admin = koreksi: selisih shift lama terkoreksi, saldo sesudah hitungan tetap', async () => {
		const s = await buka(180, 100000);
		const id = await pengeluaran(150, 10000);
		// Tercatat dua kali padahal uang tidak keluar: laci dihitung 100.000 → lebih 10.000.
		expect(await tutup(s, 60, 100000)).toMatchObject({ selisih: 10000 });
		await expect(rpc(db, kasirBL, 'public.batal_pengeluaran($1, $2)', [id, 'dobel'])).rejects.toThrow(/Hanya admin/);
		await rpc(db, adminId, 'public.batal_pengeluaran($1, $2)', [id, 'tercatat dobel']);
		expect((await ringkasan(s)).selisih).toBe(0);
		expect(await saldo()).toBe(100000);
	});
	it('pengeluaran admin dari luar laci tidak mengubah saldo; kasir tidak melihatnya', async () => {
		await buka(120, 100000);
		const p = { id: crypto.randomUUID(), outlet_id: await BL(), sumber: 'luar', kategori_id: await kategori('Perbaikan & peralatan'), jumlah: 45000, tanggal: await nilai<string>(`select public.tanggal_wib(now())::text as v`) };
		await rpc(db, adminId, 'public.catat_pengeluaran_admin($1::jsonb)', [JSON.stringify(p)]);
		expect(await saldo()).toBe(100000);
		const n = await rpc<number>(db, kasirBL, '(select count(*)::int from public.pengeluaran)', []);
		expect(n).toBe(0);
	});
});

describe('setoran', () => {
	it('owner menerima; jumlah beda wajib catatan; yang sudah diterima tidak bisa dibatalkan; kirim ulang sekali', async () => {
		await buka(120, 300000);
		const id = crypto.randomUUID();
		await setor(60, 200000, id);
		await setor(60, 200000, id);
		expect(await saldo()).toBe(100000);
		await expect(rpc(db, adminId, 'public.terima_setoran($1, $2, $3)', [id, 190000, null])).rejects.toThrow(/Catatan wajib/);
		await rpc(db, adminId, 'public.terima_setoran($1, $2, $3)', [id, 190000, 'kurang selembar']);
		expect(await nilai<number>('select jumlah_diterima as v from public.setoran where id = $1', [id])).toBe(190000);
		await expect(rpc(db, adminId, 'public.batal_setoran($1, $2)', [id, 'salah'])).rejects.toThrow(/sudah diterima tidak bisa dibatalkan/);
		expect(await saldo()).toBe(100000);
	});
	it('batal setoran (tidak jadi diserahkan) → uang kembali di saldo', async () => {
		await buka(120, 300000);
		const id = await setor(60, 200000);
		await rpc(db, adminId, 'public.batal_setoran($1, $2)', [id, 'tidak jadi diambil']);
		expect(await saldo()).toBe(300000);
	});
});

describe('batal admin & kas harian', () => {
	it('batal penjualan shift tertutup oleh admin = koreksi; batal kasir saat buka = uang keluar laci', async () => {
		const s = await buka(180, 100000);
		const fiktif = await jual(s, 150, 1);
		const asli = await jual(s, 140, 2);
		await rpc(db, kasirBL, 'public.void_penjualan_offline($1::jsonb)', [JSON.stringify({ penjualan_id: asli, alasan: 'pembeli batal', waktu: await jam(130) })]);
		expect(await saldo()).toBe(105000);
		// Penjualan "fiktif" ternyata dobel: laci dihitung 100.000 → kurang 5.000.
		expect(await tutup(s, 60, 100000)).toMatchObject({ selisih: -5000 });
		await rpc(db, adminId, 'public.void_penjualan($1, $2)', [fiktif, 'transaksi dobel']);
		expect((await ringkasan(s)).selisih).toBe(0);
		expect(await saldo()).toBe(100000);
	});
	it('kas harian: per kanal, pengeluaran, setoran, saldo awal/akhir, belanja bahan & koreksi batal', async () => {
		const s = await buka(10, 100000);
		await jual(s, 9, 3);
		await pengeluaran(8, 4000);
		await setor(7, 50000);
		const o = await BL();
		await db.query(`insert into public.barang_masuk (id, outlet_id, tanggal, waktu, total) values (gen_random_uuid(), $1, public.tanggal_wib(now()), now(), 77000)`, [o]);
		await db.query(
			`insert into public.barang_masuk (id, outlet_id, tanggal, waktu, total, batal_at, batal_alasan) values (gen_random_uuid(), $1, public.tanggal_wib(now()) - 3, now() - interval '3 days', 21000, now(), 'salah')`,
			[o]
		);
		const hari = await nilai<string>('select public.tanggal_wib(now())::text as v');
		await expect(rpc(db, kasirBL, 'public.kas_harian($1, $2, $3)', [o, hari, hari])).rejects.toThrow(/Hanya admin/);
		const [h] = await rpc<Record<string, unknown>[]>(db, adminId, 'public.kas_harian($1, $2, $3)', [o, hari, hari]);
		expect(h).toMatchObject({
			total: 15000,
			setoran: 50000,
			belanja_bahan: 77000 - 21000,
			saldo_akhir: 100000 + 15000 - 4000 - 50000,
			pengeluaran_laci: [{ kategori: 'Gas', jumlah: 4000 }]
		});
		expect((h.per_metode as Record<string, { total: number }>).cash.total).toBe(15000);
		await expect(rpc(db, adminId, 'public.kas_harian($1, $2, $3)', [o, '2026-01-01', '2026-12-31'])).rejects.toThrow(/paling lama 62 hari/);
	});
});
