import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai } from './harness';
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

type Hasil = { id: string; nomor: string; total: number; kembalian: number | null; ulang: boolean };

async function rpc<T>(oleh: string, sql: string, params: unknown[]): Promise<T> {
	return sebagai(db, oleh, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0].r);
}
const buka = (oleh: string, outlet: string, modal = 200000) => rpc<string>(oleh, 'public.buka_shift($1, $2)', [outlet, modal]);
const jual = (oleh: string, p: Record<string, unknown>) => rpc<Hasil>(oleh, 'public.catat_penjualan($1::jsonb)', [JSON.stringify(p)]);

async function pesanan(outletKode: string, item: [string, number][], metode = 'qris', diterima?: number) {
	return {
		id: crypto.randomUUID(),
		outlet_id: await idOutlet(db, outletKode),
		metode,
		...(diterima !== undefined ? { diterima } : {}),
		item: await Promise.all(item.map(async ([kode, qty]) => ({ menu_id: await idMenu(db, kode), qty })))
	};
}

describe('buka_shift', () => {
	it('kasir membuka shift outletnya; panggilan kedua mengembalikan shift yang sama', async () => {
		const bl = await idOutlet(db, 'BL');
		const a = await buka(kasirBL, bl);
		const b = await buka(kasirBL, bl, 999);
		expect(b).toBe(a);
		const { rows } = await db.query<{ modal: number }>('select modal from public.shift where id = $1', [a]);
		expect(rows[0].modal).toBe(200000);
	});
	it('kasir tidak bisa membuka shift outlet lain', async () => {
		await expect(buka(kasirBL, await idOutlet(db, 'TK'))).rejects.toThrow(/tidak berhak/);
	});
	it('modal negatif ditolak', async () => {
		await expect(buka(kasirBL, await idOutlet(db, 'BL'), -1)).rejects.toThrow(/Modal/);
	});
});

describe('catat_penjualan', () => {
	beforeEach(async () => {
		await buka(kasirBL, await idOutlet(db, 'BL'));
	});

	it('harga & total dihitung server dari harga outlet; harga dari klien diabaikan', async () => {
		const p = await pesanan('BL', [
			['ori_dada', 2],
			['nasi', 1],
			['box', 1]
		]);
		(p.item[0] as Record<string, unknown>).harga = 1;
		const r = await jual(kasirBL, { ...p, total: 5 });
		expect(r.total).toBe(2 * 11000 + 5000 + 1000);
		expect(r.nomor).toMatch(/^BL-\d{6}-001$/);
		const { rows } = await db.query<{ harga: number; qty: number }>(
			'select harga, qty from public.penjualan_item where penjualan_id = $1 order by harga desc',
			[p.id]
		);
		expect(rows).toEqual([
			{ harga: 11000, qty: 2 },
			{ harga: 5000, qty: 1 },
			{ harga: 1000, qty: 1 }
		]);
	});

	it('item menu yang sama digabung', async () => {
		const p = await pesanan('BL', [
			['ori_dada', 1],
			['ori_dada', 2]
		]);
		const r = await jual(kasirBL, p);
		expect(r.total).toBe(33000);
		const { rows } = await db.query<{ qty: number }>('select qty from public.penjualan_item where penjualan_id = $1', [p.id]);
		expect(rows).toEqual([{ qty: 3 }]);
	});

	it('cash: kembalian dihitung; uang kurang ditolak', async () => {
		const r = await jual(kasirBL, await pesanan('BL', [['ori_dada', 1]], 'cash', 20000));
		expect(r.kembalian).toBe(9000);
		await expect(jual(kasirBL, await pesanan('BL', [['ori_dada', 1]], 'cash', 10000))).rejects.toThrow(/kurang dari total/);
		await expect(jual(kasirBL, await pesanan('BL', [['ori_dada', 1]], 'cash'))).rejects.toThrow(/kurang dari total/);
	});

	it('non-cash tidak menyimpan uang diterima', async () => {
		const p = await pesanan('BL', [['ori_dada', 1]], 'gofood', 50000);
		const r = await jual(kasirBL, p);
		expect(r.kembalian).toBeNull();
		const { rows } = await db.query<{ diterima: number | null }>('select diterima from public.penjualan where id = $1', [p.id]);
		expect(rows[0].diterima).toBeNull();
	});

	it('terkirim dua kali → tercatat sekali, nomor sama', async () => {
		const p = await pesanan('BL', [['ori_dada', 1]]);
		const a = await jual(kasirBL, p);
		const b = await jual(kasirBL, p);
		expect(b.nomor).toBe(a.nomor);
		expect(b.ulang).toBe(true);
		const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.penjualan');
		expect(rows[0].n).toBe(1);
	});

	it('nomor berurutan per outlet per hari', async () => {
		const a = await jual(kasirBL, await pesanan('BL', [['nasi', 1]]));
		const b = await jual(kasirBL, await pesanan('BL', [['nasi', 1]]));
		expect([a.nomor.slice(-3), b.nomor.slice(-3)]).toEqual(['001', '002']);
	});

	it('kasir tidak bisa mencatat untuk outlet lain', async () => {
		await buka(kasirTK, await idOutlet(db, 'TK'));
		await expect(jual(kasirBL, await pesanan('TK', [['nasi', 1]]))).rejects.toThrow(/tidak berhak/);
	});

	it('menu nonaktif atau tanpa harga di outlet ditolak', async () => {
		await db.query(`update public.menu set aktif = false where kode = 'box'`);
		await expect(jual(kasirBL, await pesanan('BL', [['box', 1]]))).rejects.toThrow(/Menu tidak tersedia/);
		await db.query(`update public.menu set aktif = true where kode = 'box'`);
		await db.query(`delete from public.harga_jual where outlet_id = $1 and menu_id = $2`, [await idOutlet(db, 'BL'), await idMenu(db, 'box')]);
		await expect(jual(kasirBL, await pesanan('BL', [['box', 1]]))).rejects.toThrow(/Menu tidak tersedia/);
	});

	it('jumlah tidak sah atau keranjang kosong ditolak', async () => {
		await expect(jual(kasirBL, await pesanan('BL', [['nasi', 0]]))).rejects.toThrow(/Jumlah item/);
		await expect(jual(kasirBL, { ...(await pesanan('BL', [])) })).rejects.toThrow(/minimal satu item/);
	});

	it('tanpa shift terbuka ditolak', async () => {
		await expect(jual(kasirTK, await pesanan('TK', [['nasi', 1]]))).rejects.toThrow(/Shift belum dibuka/);
	});

	it('waktu dari perangkat dipakai bila wajar, diganti waktu server bila tidak', async () => {
		const tadi = new Date(Date.now() - 60 * 60 * 1000).toISOString();
		const p1 = await pesanan('BL', [['nasi', 1]]);
		await jual(kasirBL, { ...p1, waktu: tadi });
		const p2 = await pesanan('BL', [['nasi', 1]]);
		await jual(kasirBL, { ...p2, waktu: '2020-01-01T00:00:00Z' });
		const { rows } = await db.query<{ id: string; lama: boolean }>(
			`select id, waktu < now() - interval '30 minutes' as lama from public.penjualan`
		);
		const lama = Object.fromEntries(rows.map((r) => [r.id, r.lama]));
		expect(lama[p1.id]).toBe(true);
		expect(lama[p2.id]).toBe(false);
	});
});

describe('void_penjualan', () => {
	let jualId: string;
	beforeEach(async () => {
		await buka(kasirBL, await idOutlet(db, 'BL'));
		const p = await pesanan('BL', [['ori_dada', 1]], 'cash', 11000);
		await jual(kasirBL, p);
		jualId = p.id;
	});

	it('kasir membatalkan dalam shift yang sama dengan alasan', async () => {
		await rpc(kasirBL, 'public.void_penjualan($1, $2)', [jualId, 'Salah input']);
		const { rows } = await db.query<{ void_alasan: string }>('select void_alasan from public.penjualan where id = $1', [jualId]);
		expect(rows[0].void_alasan).toBe('Salah input');
	});
	it('alasan wajib dan tidak bisa dibatalkan dua kali', async () => {
		await expect(rpc(kasirBL, 'public.void_penjualan($1, $2)', [jualId, ' '])).rejects.toThrow(/Alasan/);
		await rpc(kasirBL, 'public.void_penjualan($1, $2)', [jualId, 'Salah input']);
		await expect(rpc(kasirBL, 'public.void_penjualan($1, $2)', [jualId, 'Lagi'])).rejects.toThrow(/sudah dibatalkan/);
	});
	it('kasir outlet lain ditolak', async () => {
		await expect(rpc(kasirTK, 'public.void_penjualan($1, $2)', [jualId, 'Coba'])).rejects.toThrow(/tidak ditemukan|tidak berhak/);
	});
	it('setelah shift ditutup hanya admin yang boleh', async () => {
		const { rows } = await db.query<{ id: string }>('select shift_id as id from public.penjualan where id = $1', [jualId]);
		await rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [rows[0].id, 211000, null]);
		await expect(rpc(kasirBL, 'public.void_penjualan($1, $2)', [jualId, 'Telat'])).rejects.toThrow(/hanya bisa dibatalkan admin/);
		await rpc(adminId, 'public.void_penjualan($1, $2)', [jualId, 'Koreksi admin']);
	});
});

describe('tutup_shift & ringkasan', () => {
	it('ringkasan per metode, void tidak dihitung, selisih kas', async () => {
		const shift = await buka(kasirBL, await idOutlet(db, 'BL'), 100000);
		await jual(kasirBL, await pesanan('BL', [['ori_dada', 1]], 'cash', 20000));
		await jual(kasirBL, await pesanan('BL', [['nasi', 2]], 'qris'));
		const batal = await pesanan('BL', [['kulit', 1]], 'cash', 9000);
		await jual(kasirBL, batal);
		await rpc(kasirBL, 'public.void_penjualan($1, $2)', [batal.id, 'Salah input']);
		const r = await rpc<Record<string, unknown>>(kasirBL, 'public.tutup_shift($1, $2, $3)', [shift, 110000, 'Kurang seribu']);
		expect(r).toMatchObject({
			modal: 100000,
			jumlah_transaksi: 2,
			jumlah_void: 1,
			total: 21000,
			cash_seharusnya: 111000,
			uang_fisik: 110000,
			selisih: -1000
		});
		expect((r.per_metode as Record<string, { jumlah: number; total: number }>).cash).toEqual({ jumlah: 1, total: 11000 });
		expect((r.per_metode as Record<string, { jumlah: number; total: number }>).qris).toEqual({ jumlah: 1, total: 10000 });
		expect((r.per_metode as Record<string, { jumlah: number; total: number }>).gofood).toEqual({ jumlah: 0, total: 0 });
	});
	it('shift yang sudah ditutup tidak bisa ditutup lagi; setelah tutup bisa buka baru', async () => {
		const bl = await idOutlet(db, 'BL');
		const s = await buka(kasirBL, bl);
		await rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [s, 0, null]);
		await expect(rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [s, 0, null])).rejects.toThrow(/sudah ditutup/);
		const s2 = await buka(kasirBL, bl);
		expect(s2).not.toBe(s);
	});
	it('kasir tidak bisa menutup shift outlet lain', async () => {
		const s = await buka(kasirTK, await idOutlet(db, 'TK'));
		await expect(rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [s, 0, null])).rejects.toThrow(/tidak ditemukan|tidak berhak/);
	});
});

describe('hak fungsi', () => {
	it('fungsi bantu internal tidak bisa dipanggil pengguna', async () => {
		await expect(rpc(kasirBL, 'public._cek_akses_outlet($1)', [await idOutlet(db, 'BL')])).rejects.toThrow(/permission denied/);
	});
});

describe('review Tugas 3 Tahap 2', () => {
	it('kiriman ulang dengan id penjualan outlet lain tidak membocorkan nomor', async () => {
		await buka(kasirBL, await idOutlet(db, 'BL'));
		await buka(kasirTK, await idOutlet(db, 'TK'));
		const p = await pesanan('TK', [['nasi', 1]]);
		await jual(kasirTK, p);
		await expect(jual(kasirBL, { ...p, outlet_id: await idOutlet(db, 'BL') })).rejects.toThrow(/Penjualan tidak ditemukan/);
	});

	it('kiriman ulang penjualan yang sudah dibatalkan memberi tanda batal', async () => {
		await buka(kasirBL, await idOutlet(db, 'BL'));
		const p = await pesanan('BL', [['nasi', 1]]);
		await jual(kasirBL, p);
		await rpc(kasirBL, 'public.void_penjualan($1, $2)', [p.id, 'Salah input']);
		const r = await jual(kasirBL, p);
		expect((r as unknown as { batal: boolean }).batal).toBe(true);
	});

	it('qty kosong di antara item sah ditolak dengan pesan jumlah', async () => {
		await buka(kasirBL, await idOutlet(db, 'BL'));
		const p = await pesanan('BL', [['nasi', 1]]);
		p.item.push({ menu_id: await idMenu(db, 'box'), qty: null as unknown as number });
		await expect(jual(kasirBL, p)).rejects.toThrow(/Jumlah item tidak sah/);
	});

	it('admin bisa berjualan untuk outlet mana pun', async () => {
		const tk = await idOutlet(db, 'TK');
		await buka(adminId, tk);
		const r = await jual(adminId, await pesanan('TK', [['nasi', 1]]));
		expect(r.nomor).toMatch(/^TK-/);
	});

	it('kasir nonaktif ditolak', async () => {
		await buka(kasirBL, await idOutlet(db, 'BL'));
		await db.query('update public.profiles set aktif = false where id = $1', [kasirBL]);
		await expect(jual(kasirBL, await pesanan('BL', [['nasi', 1]]))).rejects.toThrow(/tidak berhak/);
	});

	it('alasan batal disimpan tanpa spasi tepi; ringkasan memuat kelima metode', async () => {
		const s = await buka(kasirBL, await idOutlet(db, 'BL'));
		const p = await pesanan('BL', [['nasi', 1]]);
		await jual(kasirBL, p);
		await rpc(kasirBL, 'public.void_penjualan($1, $2)', [p.id, '  Salah input  ']);
		const { rows } = await db.query<{ a: string }>('select void_alasan as a from public.penjualan where id = $1', [p.id]);
		expect(rows[0].a).toBe('Salah input');
		const r = await rpc<{ per_metode: Record<string, unknown> }>(kasirBL, 'public.ringkasan_shift($1)', [s]);
		expect(Object.keys(r.per_metode).sort()).toEqual(['cash', 'gofood', 'grabfood', 'qris', 'shopeefood']);
	});

	it('pengunjung tanpa login tidak bisa memanggil fungsi kasir', async () => {
		const { sebagaiAnon } = await import('./harness');
		await expect(sebagaiAnon(db, () => db.query(`select public.catat_penjualan('{}'::jsonb)`))).rejects.toThrow(/permission denied/);
	});

	it('kasir outlet lain: pesan spesifik (bukan sekadar salah satu)', async () => {
		const s = await buka(kasirTK, await idOutlet(db, 'TK'));
		await expect(rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [s, 0, null])).rejects.toThrow(/Shift tidak ditemukan/);
	});

	it('penguncian: catat & void mengunci baris shift (for share / for update)', async () => {
		const { rows } = await db.query<{ src: string }>(
			`select string_agg(prosrc, ' ') as src from pg_proc where proname in ('catat_penjualan', 'void_penjualan')`
		);
		expect(rows[0].src).toMatch(/ditutup_at is null for share/);
		expect(rows[0].src).toMatch(/pg_advisory_xact_lock/);
		expect(rows[0].src).toMatch(/where id = p_id for update/);
	});
});
