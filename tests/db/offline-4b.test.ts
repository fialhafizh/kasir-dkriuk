import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { isian, rpc, setujuiStokAwal } from './harness-3b';
import { idMenu, idOutlet } from './harness-kasir';
import { stokBahan } from './harness-stok';

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

const jam = async (waktu: string) => (await db.query<{ w: string }>(`select (${waktu})::text as w`)).rows[0].w;
const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;

async function buka(waktu: string, modal = 100000) {
	const id = crypto.randomUUID();
	return rpc<string>(db, kasirBL, 'public.buka_shift_offline($1::jsonb)', [JSON.stringify({ id, outlet_id: await idOutlet(db, 'BL'), modal, waktu: await jam(waktu) })]);
}
async function tutup(shiftId: string, waktu: string) {
	const p = { id: crypto.randomUUID(), shift_id: shiftId, uang_fisik: 100000, waktu: await jam(waktu) };
	return rpc(db, kasirBL, 'public.tutup_shift_offline($1::jsonb)', [JSON.stringify(p)]);
}
async function jual(shiftId: string, waktu: string) {
	const p = {
		id: crypto.randomUUID(),
		outlet_id: await idOutlet(db, 'BL'),
		shift_id: shiftId,
		metode: 'qris',
		waktu: await jam(waktu),
		kode_struk: 'ABC123',
		item: [{ menu_id: await idMenu(db, 'ori_dada'), qty: 1 }]
	};
	await rpc(db, kasirBL, 'public.catat_penjualan_offline($1::jsonb)', [JSON.stringify(p)]);
	return p.id;
}
async function batal(oleh: string, penjualanId: string, waktu = 'now()', alasan = 'salah input') {
	return rpc<{ sudah_dibatalkan: boolean; nomor: string }>(db, oleh, 'public.void_penjualan_offline($1::jsonb)', [
		JSON.stringify({ penjualan_id: penjualanId, alasan, waktu: await jam(waktu) })
	]);
}
const jumlahBatalStok = (id: string) => nilai<number>(`select count(*)::int as v from public.gerakan_stok where penjualan_id = $1 and jenis = 'jual_batal'`, [id]);

describe('batal transaksi offline', () => {
	it('memakai jam perangkat, mengembalikan stok; kirim ulang sukses tanpa menggandakan', async () => {
		const s = await buka("now() - interval '3 hours'");
		const p = await jual(s, "now() - interval '2 hours'");
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(-1);
		expect(await batal(kasirBL, p, "now() - interval '1 hour'")).toMatchObject({ sudah_dibatalkan: false });
		expect(await batal(kasirBL, p)).toMatchObject({ sudah_dibatalkan: true });
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(0);
		expect(await jumlahBatalStok(p)).toBe(1);
		expect(await nilai<boolean>(`select void_at < now() - interval '50 minutes' as v from public.penjualan where id = $1`, [p])).toBe(true);
	});
	it('alasan wajib; kasir outlet lain tidak bisa', async () => {
		const s = await buka("now() - interval '2 hours'");
		const p = await jual(s, "now() - interval '1 hour'");
		await expect(batal(kasirBL, p, 'now()', 'x')).rejects.toThrow(/Alasan pembatalan wajib/);
		await expect(batal(kasirTK, p)).rejects.toThrow(/Penjualan tidak ditemukan/);
	});
	it('jam batal sebelum hitungan yang disetujui → tanpa efek stok', async () => {
		const s = await buka("now() - interval '3 hours'");
		const p = await jual(s, "now() - interval '170 minutes'");
		// Batal terjadi offline 160 menit lalu; stok awal dihitung 120 menit lalu & disetujui sebelum batal tiba.
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 2);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(10);
		await batal(kasirBL, p, "now() - interval '160 minutes'");
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(10);
		expect(await nilai<boolean>('select void_tanpa_stok as v from public.penjualan where id = $1', [p])).toBe(true);
	});
	it('jam batal sesudah hitungan disetujui → stok kembali (penjualan sebelum hitungan, aturan 3b)', async () => {
		const s = await buka("now() - interval '3 hours'");
		const p = await jual(s, "now() - interval '170 minutes'");
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 2);
		await batal(kasirBL, p, "now() - interval '1 hour'");
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(11);
	});
	it('tiba setelah tutup: jam batal sebelum tutup diterima & ditandai; sesudah tutup hanya admin', async () => {
		const s = await buka("now() - interval '3 hours'");
		const a = await jual(s, "now() - interval '150 minutes'");
		const b = await jual(s, "now() - interval '140 minutes'");
		await tutup(s, "now() - interval '1 hour'");
		await batal(kasirBL, a, "now() - interval '2 hours'");
		const r = await rpc<{ batal_setelah_tutup: number; jumlah_void: number }>(db, kasirBL, 'public.ringkasan_shift($1)', [s]);
		expect(r).toMatchObject({ batal_setelah_tutup: 1, jumlah_void: 1 });
		await expect(batal(kasirBL, b, "now() - interval '30 minutes'")).rejects.toThrow(/hanya bisa dibatalkan admin/);
		await batal(adminId, b, "now() - interval '30 minutes'");
	});
	it('jam batal lebih awal dari jam jual → memakai jam jual', async () => {
		const s = await buka("now() - interval '3 hours'");
		const p = await jual(s, "now() - interval '1 hour'");
		await batal(kasirBL, p, "now() - interval '2 hours'");
		expect(await nilai<boolean>('select void_at = waktu as v from public.penjualan where id = $1', [p])).toBe(true);
	});
});

async function kirimOffline(item: [string, number][], waktu = 'now()', id = crypto.randomUUID()) {
	const p = { id, outlet_id: await idOutlet(db, 'BL'), dari_outlet_id: await idOutlet(db, 'BL'), ke_outlet_id: await idOutlet(db, 'TK'), item: await isian(db, item), waktu: await jam(waktu) };
	return rpc<string>(db, kasirBL, 'public.kirim_transfer_offline($1::jsonb)', [JSON.stringify(p)]);
}
async function terimaOffline(oleh: string, id: string, item: [string, number][], waktu = 'now()') {
	const p = { transfer_id: id, outlet_id: await idOutlet(db, 'TK'), item: await isian(db, item), waktu: await jam(waktu) };
	return rpc(db, oleh, 'public.terima_transfer_offline($1::jsonb)', [JSON.stringify(p)]);
}
const batalTransfer = (oleh: string, id: string) => rpc(db, oleh, 'public.batal_transfer_offline($1::jsonb)', [JSON.stringify({ transfer_id: id, alasan: 'tidak jadi' })]);

describe('transfer offline', () => {
	it('kirim memakai jam perangkat; kirim ulang tidak menggandakan', async () => {
		const id = crypto.randomUUID();
		await kirimOffline([['ori_dada', 4]], "now() - interval '2 hours'", id);
		await kirimOffline([['ori_dada', 4]], 'now()', id);
		expect(await nilai<number>('select count(*)::int as v from public.transfer')).toBe(1);
		expect(await nilai<boolean>(`select dikirim_at < now() - interval '90 minutes' as v from public.transfer where id = $1`, [id])).toBe(true);
	});
	it('batal dua kali sukses; outlet tujuan tidak bisa membatalkan', async () => {
		const id = await kirimOffline([['ori_dada', 4]]);
		await expect(batalTransfer(kasirTK, id)).rejects.toThrow(/Transfer tidak ditemukan/);
		await batalTransfer(kasirBL, id);
		await batalTransfer(kasirBL, id);
		expect(await nilai<string>('select status::text as v from public.transfer where id = $1', [id])).toBe('dibatalkan');
	});
	it('terima: stok pindah pada jam terima perangkat (tidak sebelum jam kirim); dua kali aman; jumlah beda ditolak', async () => {
		const id = await kirimOffline([['ori_dada', 4]], "now() - interval '3 hours'");
		await expect(terimaOffline(kasirTK, id, [['ori_dada', 3]])).rejects.toThrow(/Ada perbedaan jumlah/);
		await terimaOffline(kasirTK, id, [['ori_dada', 4]], "now() - interval '2 hours'");
		await terimaOffline(kasirTK, id, [['ori_dada', 4]]);
		expect(await stokBahan(db, 'TK', 'ori_dada')).toBe(4);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(-4);
		expect(await nilai<number>(`select count(*)::int as v from public.gerakan_stok where transfer_id = $1 and waktu < now() - interval '90 minutes'`, [id])).toBe(2);
		const id2 = await kirimOffline([['ori_dada', 1]], "now() - interval '1 hour'");
		await terimaOffline(kasirTK, id2, [['ori_dada', 1]], "now() - interval '2 hours'");
		expect(await nilai<boolean>('select diterima_at = dikirim_at as v from public.transfer where id = $1', [id2])).toBe(true);
	});
	it('terima online tetap memakai jam server', async () => {
		const id = await kirimOffline([['ori_dada', 2]], "now() - interval '2 hours'");
		await rpc(db, kasirTK, 'public.terima_transfer($1, $2::jsonb)', [id, JSON.stringify(await isian(db, [['ori_dada', 2]]))]);
		expect(await nilai<boolean>(`select diterima_at > now() - interval '1 minute' as v from public.transfer where id = $1`, [id])).toBe(true);
	});
});

async function hitung(fn: 'ajukan_opname_offline' | 'ajukan_stok_awal_offline', id: string, item: [string, number][], waktu = 'now()', oleh = kasirBL, outlet = 'BL') {
	const p = { id, outlet_id: await idOutlet(db, outlet), item: await isian(db, item), waktu: await jam(waktu) };
	return rpc<string>(db, oleh, `public.${fn}($1::jsonb)`, [JSON.stringify(p)]);
}

describe('opname & stok awal offline', () => {
	it('stok awal: id & jam perangkat; dua kali satu ajuan; setelah disetujui ditolak', async () => {
		const id = crypto.randomUUID();
		expect(await hitung('ajukan_stok_awal_offline', id, [['ori_dada', 5]], "now() - interval '2 hours'")).toBe(id);
		expect(await hitung('ajukan_stok_awal_offline', id, [['ori_dada', 5]])).toBe(id);
		expect(await nilai<number>('select count(*)::int as v from public.stok_awal')).toBe(1);
		expect(await nilai<boolean>(`select dihitung_at < now() - interval '90 minutes' as v from public.stok_awal where id = $1`, [id])).toBe(true);
		await rpc(db, adminId, 'public.putuskan_stok_awal($1, $2, $3::jsonb, $4)', [id, true, null, null]);
		await expect(hitung('ajukan_stok_awal_offline', crypto.randomUUID(), [['ori_dada', 5]])).rejects.toThrow(/sudah disetujui/);
	});
	it('opname: id & jam perangkat; dua kali satu ajuan; id outlet lain ditolak; jam lama ditolak', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 3);
		await expect(hitung('ajukan_opname_offline', crypto.randomUUID(), [['ori_dada', 9]], "now() - interval '4 hours'")).rejects.toThrow(
			/lebih lama dari hitungan stok terakhir/
		);
		const id = crypto.randomUUID();
		await hitung('ajukan_opname_offline', id, [['ori_dada', 9]], "now() - interval '1 hour'");
		expect(await hitung('ajukan_opname_offline', id, [['ori_dada', 9]])).toBe(id);
		expect(await nilai<number>('select count(*)::int as v from public.opname')).toBe(1);
		await setujuiStokAwal(db, kasirTK, adminId, 'TK', [['ori_dada', 1]]);
		await expect(hitung('ajukan_opname_offline', id, [['ori_dada', 1]], 'now()', kasirTK, 'TK')).rejects.toThrow(/tidak berhak/);
	});
	it('opname: persetujuan memakai saldo s.d. jam hitung di perangkat', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 3);
		const s = await buka("now() - interval '150 minutes'");
		await jual(s, "now() - interval '2 hours'");
		const id = crypto.randomUUID();
		await hitung('ajukan_opname_offline', id, [['ori_dada', 8]], "now() - interval '90 minutes'");
		// Penjualan sesudah jam hitung (tiba sebelum opname disetujui) tidak ikut dikoreksi.
		await jual(s, "now() - interval '1 hour'");
		await rpc(db, adminId, 'public.putuskan_opname($1, $2, $3::jsonb, $4)', [id, true, null, null]);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(7);
	});
	it('opname ditolak bila masih ada transfer menunggu', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 3);
		await kirimOffline([['ori_dada', 1]]);
		await expect(hitung('ajukan_opname_offline', crypto.randomUUID(), [['ori_dada', 9]])).rejects.toThrow(/Selesaikan kiriman/);
	});
});
