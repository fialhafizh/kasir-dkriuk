import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';
import { isian, rpc, setujuiStokAwal } from './harness-3b';
import { idMenu, idOutlet } from './harness-kasir';
import { stokBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;
const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
});

describe('skema offline', () => {
	it('anon tidak bisa membaca tabel baru; kasir tidak bisa menulis langsung', async () => {
		for (const t of ['perangkat', 'shift_perangkat']) {
			await expect(sebagaiAnon(db, () => db.query(`select * from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for table ${t}`));
			await expect(sebagai(db, kasirBL, () => db.query(`delete from public.${t}`))).rejects.toThrow(new RegExp(`permission denied for table ${t}`));
		}
	});
	it('penjualan bertanda tanpa_stok tidak memotong stok', async () => {
		const bl = await idOutlet(db, 'BL');
		const s = (await db.query<{ id: string }>(`insert into public.shift (outlet_id, dibuka_oleh, modal) values ($1, $2, 0) returning id`, [bl, kasirBL])).rows[0].id;
		const p = crypto.randomUUID();
		await db.query(
			`insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, metode, total, tanpa_stok) values ($1, $2, $3, $4, 'BL-X', now(), 'qris', 1, true)`,
			[p, bl, s, kasirBL]
		);
		await db.query(`insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty) values ($1, $2, 'Dada', 1, 2)`, [p, await idMenu(db, 'ori_dada')]);
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(0);
	});
	it('kode struk unik dan berformat 6 karakter', async () => {
		const bl = await idOutlet(db, 'BL');
		const s = (await db.query<{ id: string }>(`insert into public.shift (outlet_id, dibuka_oleh, modal) values ($1, $2, 0) returning id`, [bl, kasirBL])).rows[0].id;
		await expect(
			db.query(`insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, metode, total, kode_struk) values (gen_random_uuid(), $1, $2, $3, 'BL-Y', now(), 'qris', 1, 'abc')`, [bl, s, kasirBL])
		).rejects.toThrow(/penjualan_kode_struk_check/);
	});
});

export { P1, P2, adminId, kasirTK, rpc };

const daftar = async (oleh: string, id: string, outlet = 'BL') => rpc<number>(db, oleh, 'public.daftar_perangkat($1, $2)', [id, await idOutlet(db, outlet)]);
async function buka(oleh: string, id: string, perangkat: string, modal = 100000, waktu = 'now()') {
	const w = (await db.query<{ w: string }>(`select (${waktu})::text as w`)).rows[0].w;
	return rpc<string>(db, oleh, 'public.buka_shift_offline($1::jsonb)', [JSON.stringify({ id, outlet_id: await idOutlet(db, 'BL'), modal, waktu: w, perangkat_id: perangkat })]);
}
async function tutup(oleh: string, id: string, shiftId: string, uang = 0, waktu = 'now()') {
	const w = (await db.query<{ w: string }>(`select (${waktu})::text as w`)).rows[0].w;
	return rpc<Record<string, unknown>>(db, oleh, 'public.tutup_shift_offline($1::jsonb)', [JSON.stringify({ id, shift_id: shiftId, uang_fisik: uang, catatan: null, waktu: w })]);
}

describe('perangkat', () => {
	it('daftar memberi kode berurutan & idempoten; kasir outlet lain ditolak', async () => {
		const k1 = await daftar(kasirBL, P1);
		expect(await daftar(kasirBL, P1)).toBe(k1);
		const k2 = await daftar(kasirBL, P2);
		expect(k2).toBe(k1 + 1);
		await expect(daftar(kasirTK, crypto.randomUUID(), 'BL')).rejects.toThrow(/tidak berhak/);
	});
	it('tandai sinkron mengisi jam sinkron terakhir', async () => {
		await daftar(kasirBL, P1);
		await rpc(db, kasirBL, 'public.tandai_sinkron($1)', [P1]);
		const r = (await db.query<{ t: string | null }>('select terakhir_sinkron::text as t from public.perangkat where id = $1', [P1])).rows[0];
		expect(r.t).not.toBeNull();
	});
});

describe('buka & tutup toko offline', () => {
	beforeEach(async () => {
		await daftar(kasirBL, P1);
		await daftar(kasirBL, P2);
	});
	it('buka dari perangkat: shift dibuat dengan id perangkat & jam kejadian; kirim ulang → shift sama', async () => {
		const id = crypto.randomUUID();
		const s = await buka(kasirBL, id, P1, 150000, "now() - interval '2 hours'");
		expect(s).toBe(id);
		expect(await buka(kasirBL, id, P1)).toBe(id);
		const r = (await db.query<{ modal: number; lama: boolean }>(`select modal, dibuka_at < now() - interval '1 hour' as lama from public.shift where id = $1`, [id])).rows[0];
		expect(r).toEqual({ modal: 150000, lama: true });
	});
	it('dua perangkat membuka di hari yang sama → digabung ke satu shift', async () => {
		const a = await buka(kasirBL, crypto.randomUUID(), P1, 100000, "now() - interval '3 hours'");
		const idB = crypto.randomUUID();
		const b = await buka(kasirBL, idB, P2, 50000, "now() - interval '2 hours'");
		expect(b).toBe(a);
		const r = (await db.query<{ digabung: boolean; n: number }>(`select digabung, (select count(*)::int from public.shift where outlet_id = s.outlet_id) as n from public.shift s where id = $1`, [a])).rows[0];
		expect(r).toEqual({ digabung: true, n: 1 });
	});
	it('perangkat yang membuka saat shift lain masih berjalan tetapi tiba setelah shift itu ditutup → tetap digabung', async () => {
		const a = await buka(kasirBL, crypto.randomUUID(), P1, 0, "now() - interval '5 hours'");
		await tutup(kasirBL, crypto.randomUUID(), a, 0, "now() - interval '1 hour'");
		expect(await buka(kasirBL, crypto.randomUUID(), P2, 0, "now() - interval '3 hours'")).toBe(a);
	});
	it('buka lagi setelah ditutup → shift baru dengan catatan jam tutup sebelumnya', async () => {
		const a = await buka(kasirBL, crypto.randomUUID(), P1, 0, "now() - interval '5 hours'");
		await tutup(kasirBL, crypto.randomUUID(), a, 0, "now() - interval '3 hours'");
		const b = await buka(kasirBL, crypto.randomUUID(), P2, 0, "now() - interval '2 hours'");
		expect(b).not.toBe(a);
		const r = (await db.query<{ ok: boolean }>(`select dibuka_lagi_setelah = (select ditutup_at from public.shift where id = $2) as ok from public.shift where id = $1`, [b, a])).rows[0];
		expect(r.ok).toBe(true);
	});
	it('shift hari sebelumnya belum ditutup → buka ditolak', async () => {
		await buka(kasirBL, crypto.randomUUID(), P1, 0, "now() - interval '30 hours'");
		await expect(buka(kasirBL, crypto.randomUUID(), P2)).rejects.toThrow(/Toko kemarin belum ditutup/);
	});
	it('tutup: idempoten per id kejadian; tutup kedua dari perangkat lain ditolak; jam tutup = jam kejadian', async () => {
		const a = await buka(kasirBL, crypto.randomUUID(), P1, 100000, "now() - interval '5 hours'");
		const t = crypto.randomUUID();
		const r1 = await tutup(kasirBL, t, a, 100000, "now() - interval '1 hour'");
		const r2 = await tutup(kasirBL, t, a, 100000);
		expect(r2).toEqual(r1);
		await expect(tutup(kasirBL, crypto.randomUUID(), a, 5)).rejects.toThrow(/Shift sudah ditutup/);
		const lama = (await db.query<{ ok: boolean }>(`select ditutup_at < now() - interval '30 minutes' as ok from public.shift where id = $1`, [a])).rows[0].ok;
		expect(lama).toBe(true);
	});
	it('jam perangkat di masa depan dipakai jam server', async () => {
		const a = await buka(kasirBL, crypto.randomUUID(), P1, 0, "now() + interval '3 hours'");
		const ok = (await db.query<{ ok: boolean }>(`select dibuka_at <= now() + interval '1 minute' as ok from public.shift where id = $1`, [a])).rows[0].ok;
		expect(ok).toBe(true);
	});
});


async function jual(oleh: string, shiftId: string, opsi: { id?: string; waktu?: string; kode?: string; item?: [string, number][]; metode?: string; diterima?: number } = {}) {
	const w = (await db.query<{ w: string }>(`select (${opsi.waktu ?? 'now()'})::text as w`)).rows[0].w;
	const p = {
		id: opsi.id ?? crypto.randomUUID(),
		outlet_id: await idOutlet(db, 'BL'),
		shift_id: shiftId,
		metode: opsi.metode ?? 'qris',
		...(opsi.diterima !== undefined ? { diterima: opsi.diterima } : {}),
		waktu: w,
		perangkat_id: P1,
		kode_struk: opsi.kode ?? Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X'),
		nomor_sementara: 'S1-001',
		item: await Promise.all((opsi.item ?? [['ori_dada', 1]]).map(async ([kode, qty]) => ({ menu_id: await idMenu(db, kode), qty })))
	};
	return { p, hasil: await rpc<{ id: string; nomor: string; total: number; ulang: boolean; kode_struk: string }>(db, oleh, 'public.catat_penjualan_offline($1::jsonb)', [JSON.stringify(p)]) };
}

describe('jualan offline', () => {
	let shift: string;
	beforeEach(async () => {
		await daftar(kasirBL, P1);
		shift = await buka(kasirBL, crypto.randomUUID(), P1, 100000, "now() - interval '6 hours'");
	});
	it('tercatat dengan jam kejadian, kode struk & nomor sementara; nomor resmi urut kedatangan; kirim ulang → sama', async () => {
		const a = await jual(kasirBL, shift, { waktu: "now() - interval '1 hour'", kode: 'K7Q2MX' });
		const b = await jual(kasirBL, shift, { waktu: "now() - interval '3 hours'" });
		expect(a.hasil.nomor).toMatch(/^BL-\d{6}-001$/);
		expect(b.hasil.nomor).toMatch(/-002$/);
		const ulang = await rpc<{ nomor: string; ulang: boolean }>(db, kasirBL, 'public.catat_penjualan_offline($1::jsonb)', [JSON.stringify(a.p)]);
		expect(ulang).toMatchObject({ nomor: a.hasil.nomor, ulang: true });
		const r = (await db.query<{ kode_struk: string; nomor_sementara: string; lama: boolean }>(
			`select kode_struk, nomor_sementara, waktu < now() - interval '50 minutes' as lama from public.penjualan where id = $1`, [a.p.id]
		)).rows[0];
		expect(r).toEqual({ kode_struk: 'K7Q2MX', nomor_sementara: 'S1-001', lama: true });
	});
	it('penjualan yang tiba setelah toko ditutup tetap masuk shift-nya dan ditandai', async () => {
		await tutup(kasirBL, crypto.randomUUID(), shift, 100000, "now() - interval '30 minutes'");
		await jual(kasirBL, shift, { waktu: "now() - interval '2 hours'", metode: 'cash', diterima: 20000 });
		const r = await rpc<{ jual_setelah_tutup: number; jumlah_transaksi: number }>(db, kasirBL, 'public.ringkasan_shift($1)', [shift]);
		expect(r).toMatchObject({ jual_setelah_tutup: 1, jumlah_transaksi: 1 });
	});
	it('penjualan berjam sebelum stok awal disetujui tidak memotong stok; sesudahnya memotong', async () => {
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 2);
		await jual(kasirBL, shift, { waktu: "now() - interval '4 hours'" });
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(10);
		await jual(kasirBL, shift, { waktu: "now() - interval '1 hour'" });
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(9);
	});
	it('shift perangkat yang tidak dikenal → ditolak; kode struk salah → ditolak; harga dari server', async () => {
		await expect(jual(kasirBL, crypto.randomUUID())).rejects.toThrow(/Shift belum dibuka/);
		await expect(jual(kasirBL, shift, { kode: 'ab' })).rejects.toThrow(/Kode struk tidak sah/);
		const { hasil } = await jual(kasirBL, shift, { item: [['nasi', 2]] });
		expect(hasil.total).toBe(10000);
	});
	it('kasir outlet lain ditolak', async () => {
		await expect(jual(kasirTK, shift)).rejects.toThrow(/tidak berhak/);
	});
});

describe('rusak offline', () => {
	it('jam kejadian dipakai; sebelum stok awal → tanpa efek stok; kirim ulang sekali', async () => {
		await daftar(kasirBL, P1);
		await setujuiStokAwal(db, kasirBL, adminId, 'BL', [['ori_dada', 10]], 2);
		const kirim = async (id: string, waktu: string) => {
			const w = (await db.query<{ w: string }>(`select (${waktu})::text as w`)).rows[0].w;
			const p = { id, outlet_id: await idOutlet(db, 'BL'), alasan: 'sisa_tidak_laku', waktu: w, perangkat_id: P1, item: await isian(db, [['ori_dada', 2]]) };
			return rpc<string>(db, kasirBL, 'public.catat_rusak_offline($1::jsonb)', [JSON.stringify(p)]);
		};
		await kirim(crypto.randomUUID(), "now() - interval '3 hours'");
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(10);
		const id = crypto.randomUUID();
		await kirim(id, "now() - interval '1 hour'");
		await kirim(id, "now() - interval '1 hour'");
		expect(await stokBahan(db, 'BL', 'ori_dada')).toBe(8);
	});
});
