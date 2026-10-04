import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';

let db: PGlite;
let adminId: string;
let kasirKP: string;

async function satu<T>(sql: string, params: unknown[] = []): Promise<T> {
	return (await db.query<T>(sql, params)).rows[0];
}
async function jumlah(sql: string): Promise<number> {
	return (await satu<{ n: number }>(`select count(*)::int as n from ${sql}`)).n;
}
async function harga(outlet: string, menu: string): Promise<number> {
	return (
		await satu<{ harga: number }>(
			`select h.harga from public.harga_jual h join public.outlets o on o.id = h.outlet_id join public.menu m on m.id = h.menu_id where o.kode = $1 and m.kode = $2`,
			[outlet, menu]
		)
	).harga;
}
async function idDari(tabel: string, kode: string): Promise<string> {
	return (await satu<{ id: string }>(`select id from public.${tabel} where kode = $1`, [kode])).id;
}

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirKP = await buatUser(db, { username: 'kasir.kertapati', role: 'kasir', outlet_kode: 'KP' });
});

describe('seed master', () => {
	it('jumlah data awal', async () => {
		expect(await jumlah('public.bahan')).toBe(23);
		expect(await jumlah('public.satuan_beli')).toBe(18);
		expect(await jumlah('public.menu')).toBe(17);
		expect(await jumlah('public.resep')).toBe(19);
		expect(await jumlah('public.harga_jual')).toBe(51);
		expect(await jumlah('public.harga_beli')).toBe(0);
	});

	it('pack ayam Ori berisi 9 potong: 3 dada, 2 paha atas, 2 paha bawah, 2 sayap', async () => {
		const { rows } = await db.query<{ kode: string; qty: string }>(
			`select b.kode, i.qty from public.satuan_beli_isi i join public.bahan b on b.id = i.bahan_id
			 join public.satuan_beli s on s.id = i.satuan_beli_id where s.kode = 'pack_ayam_ori' order by b.kode`
		);
		expect(rows.map((r) => [r.kode, Number(r.qty)])).toEqual([
			['ori_dada', 3],
			['ori_paha_atas', 2],
			['ori_paha_bawah', 2],
			['ori_sayap', 2]
		]);
	});

	it('harga jual: Kertapati −Rp1.000 untuk ayam & kulit, sama untuk nasi/box/pelengkap', async () => {
		expect(await harga('BL', 'ori_dada')).toBe(11000);
		expect(await harga('TK', 'hot_sayap')).toBe(9000);
		expect(await harga('KP', 'ori_dada')).toBe(10000);
		expect(await harga('KP', 'hot_paha_bawah')).toBe(8000);
		expect(await harga('KP', 'kulit')).toBe(8000);
		expect(await harga('KP', 'nasi')).toBe(5000);
		expect(await harga('KP', 'box')).toBe(1000);
		expect(await harga('BL', 'saus_sambal')).toBe(0);
	});

	it('setiap menu punya resep, dan setiap bahan otomatis dipakai minimal satu resep', async () => {
		expect(await jumlah('public.menu m where not exists (select 1 from public.resep r where r.menu_id = m.id)')).toBe(0);
		expect(
			await jumlah(`public.bahan b where b.mode = 'otomatis' and not exists (select 1 from public.resep r where r.bahan_id = b.id)`)
		).toBe(0);
	});

	it('nasi memotong 0,1 kg beras dan 1 kertas nasi; kulit memotong 1 porsi kulit dan 1 cup', async () => {
		const { rows } = await db.query<{ menu: string; bahan: string; qty: string }>(
			`select m.kode as menu, b.kode as bahan, r.qty from public.resep r join public.menu m on m.id = r.menu_id
			 join public.bahan b on b.id = r.bahan_id where m.kode in ('nasi', 'kulit') order by 1, 2`
		);
		expect(rows.map((r) => [r.menu, r.bahan, Number(r.qty)])).toEqual([
			['kulit', 'cup_kulit', 1],
			['kulit', 'kulit', 1],
			['nasi', 'beras', 0.1],
			['nasi', 'kertas_nasi', 1]
		]);
	});

	it('tepung & minyak dianalisis, plastik merah hanya dicatat', async () => {
		const { rows } = await db.query<{ kode: string; mode: string }>(
			`select kode, mode from public.bahan where mode <> 'otomatis' order by kode`
		);
		expect(rows).toEqual([
			{ kode: 'minyak', mode: 'analisis' },
			{ kode: 'plastik_merah', mode: 'catat' },
			{ kode: 'tepung_a', mode: 'analisis' },
			{ kode: 'tepung_dkriuk', mode: 'analisis' }
		]);
	});
});

describe('RLS master', () => {
	it('pengunjung tanpa login tidak punya izin atas menu maupun harga', async () => {
		await expect(sebagaiAnon(db, () => db.query('select 1 from public.menu'))).rejects.toThrow(/permission denied/);
		await expect(sebagaiAnon(db, () => db.query('select 1 from public.harga_jual'))).rejects.toThrow(/permission denied/);
	});

	it('kasir membaca menu, bahan, resep, satuan beli', async () => {
		const n = await sebagai(db, kasirKP, async () => [
			(await db.query('select 1 from public.menu')).rows.length,
			(await db.query('select 1 from public.bahan')).rows.length,
			(await db.query('select 1 from public.resep')).rows.length,
			(await db.query('select 1 from public.satuan_beli_isi')).rows.length
		]);
		expect(n).toEqual([17, 23, 19, 24]);
	});

	it('kasir hanya melihat harga jual outletnya sendiri', async () => {
		const kode = await sebagai(db, kasirKP, async () =>
			(await db.query<{ kode: string }>('select distinct o.kode from public.harga_jual h join public.outlets o on o.id = h.outlet_id')).rows
		);
		expect(kode).toEqual([{ kode: 'KP' }]);
	});

	it('kasir tidak melihat harga beli sama sekali', async () => {
		const bl = await idDari('outlets', 'BL');
		const s = await idDari('satuan_beli', 'pack_ayam_ori');
		await db.query('insert into public.harga_beli (outlet_id, satuan_beli_id, harga) values ($1, $2, 44444)', [bl, s]);
		const n = await sebagai(db, kasirKP, async () => (await db.query('select 1 from public.harga_beli')).rows.length);
		expect(n).toBe(0);
	});

	it('kasir tidak bisa mengubah harga jual', async () => {
		await sebagai(db, kasirKP, () => db.query('update public.harga_jual set harga = 1'));
		expect(await harga('KP', 'ori_dada')).toBe(10000);
	});

	it('admin bisa mengubah harga jual dan mengisi harga beli', async () => {
		const kp = await idDari('outlets', 'KP');
		const s = await idDari('satuan_beli', 'pack_kemasan_kecil');
		await sebagai(db, adminId, async () => {
			await db.query(`update public.harga_jual set harga = 12000 where menu_id = (select id from public.menu where kode = 'ori_dada')`);
			await db.query('insert into public.harga_beli (outlet_id, satuan_beli_id, harga) values ($1, $2, 25000)', [kp, s]);
		});
		expect(await harga('BL', 'ori_dada')).toBe(12000);
		expect(await jumlah('public.harga_beli')).toBe(1);
	});

	it('harga negatif ditolak', async () => {
		await expect(sebagai(db, adminId, () => db.query('update public.harga_jual set harga = -1'))).rejects.toThrow(/harga_jual_harga_check/);
	});
});

describe('simpan_resep (atomik)', () => {
	it('admin mengganti seluruh resep satu menu', async () => {
		const nasi = await idDari('menu', 'nasi');
		const beras = await idDari('bahan', 'beras');
		await sebagai(db, adminId, () =>
			db.query('select public.simpan_resep($1, $2::jsonb)', [nasi, JSON.stringify([{ bahan_id: beras, qty: 0.08 }])])
		);
		const { rows } = await db.query<{ qty: string }>('select qty from public.resep where menu_id = $1', [nasi]);
		expect(rows.map((r) => Number(r.qty))).toEqual([0.08]);
	});

	it('resep kosong ditolak dan resep lama tetap utuh', async () => {
		const nasi = await idDari('menu', 'nasi');
		await expect(sebagai(db, adminId, () => db.query(`select public.simpan_resep($1, '[]'::jsonb)`, [nasi]))).rejects.toThrow(
			/minimal satu bahan/
		);
		expect(await jumlah(`public.resep where menu_id = '${nasi}'`)).toBe(2);
	});

	it('bahan ganda ditolak dan resep lama tetap utuh', async () => {
		const nasi = await idDari('menu', 'nasi');
		const beras = await idDari('bahan', 'beras');
		const isi = JSON.stringify([
			{ bahan_id: beras, qty: 0.1 },
			{ bahan_id: beras, qty: 0.2 }
		]);
		await expect(sebagai(db, adminId, () => db.query('select public.simpan_resep($1, $2::jsonb)', [nasi, isi]))).rejects.toThrow(/resep_pkey|duplicate key/);
		expect(await jumlah(`public.resep where menu_id = '${nasi}'`)).toBe(2);
	});

	it('kasir tidak boleh mengubah resep', async () => {
		const nasi = await idDari('menu', 'nasi');
		const beras = await idDari('bahan', 'beras');
		await expect(
			sebagai(db, kasirKP, () => db.query('select public.simpan_resep($1, $2::jsonb)', [nasi, JSON.stringify([{ bahan_id: beras, qty: 1 }])]))
		).rejects.toThrow(/Hanya admin/);
	});
});

describe('simpan_isi_satuan_beli (atomik)', () => {
	it('admin mengubah isi pack kulit dari 17 menjadi 18 porsi', async () => {
		const pack = await idDari('satuan_beli', 'pack_kulit');
		const kulit = await idDari('bahan', 'kulit');
		await sebagai(db, adminId, () =>
			db.query('select public.simpan_isi_satuan_beli($1, $2::jsonb)', [pack, JSON.stringify([{ bahan_id: kulit, qty: 18 }])])
		);
		const { rows } = await db.query<{ qty: string }>('select qty from public.satuan_beli_isi where satuan_beli_id = $1', [pack]);
		expect(rows.map((r) => Number(r.qty))).toEqual([18]);
	});

	it('isi dengan 4 desimal tersimpan persis (sama dengan presisi aplikasi)', async () => {
		const pack = await idDari('satuan_beli', 'pack_kulit');
		const kulit = await idDari('bahan', 'kulit');
		await sebagai(db, adminId, () =>
			db.query('select public.simpan_isi_satuan_beli($1, $2::jsonb)', [pack, JSON.stringify([{ bahan_id: kulit, qty: 0.0833 }])])
		);
		const { rows } = await db.query<{ qty: string }>('select qty from public.satuan_beli_isi where satuan_beli_id = $1', [pack]);
		expect(Number(rows[0].qty)).toBe(0.0833);
	});

	it('jumlah nol ditolak dan isi lama tetap utuh', async () => {
		const pack = await idDari('satuan_beli', 'pack_kulit');
		const kulit = await idDari('bahan', 'kulit');
		await expect(
			sebagai(db, adminId, () =>
				db.query('select public.simpan_isi_satuan_beli($1, $2::jsonb)', [pack, JSON.stringify([{ bahan_id: kulit, qty: 0 }])])
			)
		).rejects.toThrow(/satuan_beli_isi_qty_check/);
		expect(await jumlah(`public.satuan_beli_isi where satuan_beli_id = '${pack}'`)).toBe(1);
	});
});

describe('review Tugas 1: batas yang dijaga database', () => {
	it('p_isi NULL tidak menghapus resep', async () => {
		const nasi = await idDari('menu', 'nasi');
		await expect(sebagai(db, adminId, () => db.query('select public.simpan_resep($1, null)', [nasi]))).rejects.toThrow(/minimal satu bahan/);
		await expect(sebagai(db, adminId, () => db.query('select public.simpan_isi_satuan_beli($1, null)', [nasi]))).rejects.toThrow(
			/minimal satu bahan/
		);
		expect(await jumlah(`public.resep where menu_id = '${nasi}'`)).toBe(2);
	});

	it('resep menolak bahan yang dianalisis (tepung/minyak), hanya-dicatat, atau nonaktif', async () => {
		const nasi = await idDari('menu', 'nasi');
		for (const kode of ['tepung_dkriuk', 'minyak', 'plastik_merah']) {
			const b = await idDari('bahan', kode);
			await expect(
				sebagai(db, adminId, () => db.query('select public.simpan_resep($1, $2::jsonb)', [nasi, JSON.stringify([{ bahan_id: b, qty: 1 }])]))
			).rejects.toThrow(/bahan aktif yang dipotong otomatis/);
		}
		const { rows } = await db.query<{ id: string }>(
			`insert into public.bahan (kode, nama, satuan, mode, aktif) values ('uji_nonaktif', 'Uji Nonaktif', 'pcs', 'otomatis', false) returning id`
		);
		await expect(
			sebagai(db, adminId, () => db.query('select public.simpan_resep($1, $2::jsonb)', [nasi, JSON.stringify([{ bahan_id: rows[0].id, qty: 1 }])]))
		).rejects.toThrow(/bahan aktif yang dipotong otomatis/);
		expect(await jumlah(`public.resep where menu_id = '${nasi}'`)).toBe(2);
	});

	it('elemen rusak ditolak dengan galat yang jelas, resep lama utuh', async () => {
		const nasi = await idDari('menu', 'nasi');
		await expect(
			sebagai(db, adminId, () => db.query('select public.simpan_resep($1, $2::jsonb)', [nasi, JSON.stringify([{ bahan_id: 'bukan-uuid', qty: 1 }])]))
		).rejects.toThrow(/invalid input syntax for type uuid/);
		expect(await jumlah(`public.resep where menu_id = '${nasi}'`)).toBe(2);
	});

	it('kasir tidak boleh mengubah isi satuan beli', async () => {
		const pack = await idDari('satuan_beli', 'pack_kulit');
		const kulit = await idDari('bahan', 'kulit');
		await expect(
			sebagai(db, kasirKP, () =>
				db.query('select public.simpan_isi_satuan_beli($1, $2::jsonb)', [pack, JSON.stringify([{ bahan_id: kulit, qty: 1 }])])
			)
		).rejects.toThrow(/Hanya admin/);
	});

	it('menu, bahan, dan satuan beli tidak bisa dihapus (cukup dinonaktifkan) agar riwayat aman', async () => {
		await sebagai(db, adminId, async () => {
			await db.query(`delete from public.menu where kode = 'box'`);
			await db.query(`delete from public.satuan_beli where kode = 'pack_box'`);
			await db.query(`delete from public.bahan where kode = 'plastik_merah'`);
		});
		expect(await jumlah(`public.menu where kode = 'box'`)).toBe(1);
		expect(await jumlah(`public.satuan_beli where kode = 'pack_box'`)).toBe(1);
		expect(await jumlah(`public.bahan where kode = 'plastik_merah'`)).toBe(1);
	});

	it('diubah_at harga beli diperbarui otomatis walau klien tidak mengirimnya', async () => {
		const bl = await idDari('outlets', 'BL');
		const s = await idDari('satuan_beli', 'pack_box');
		await db.query(`insert into public.harga_beli (outlet_id, satuan_beli_id, harga, diubah_at) values ($1, $2, 1, '2020-01-01')`, [bl, s]);
		await sebagai(db, adminId, () => db.query('update public.harga_beli set harga = 2 where outlet_id = $1 and satuan_beli_id = $2', [bl, s]));
		const r = await satu<{ tahun: number }>(
			'select extract(year from diubah_at)::int as tahun from public.harga_beli where outlet_id = $1 and satuan_beli_id = $2',
			[bl, s]
		);
		expect(r.tahun).toBeGreaterThan(2020);
	});
});

describe('review akhir Tahap 1: aturan resep selalu berlaku & master tidak terhapus', () => {
	it('bahan yang dipakai resep tidak bisa dinonaktifkan atau diubah dari otomatis', async () => {
		await expect(
			sebagai(db, adminId, () => db.query(`update public.bahan set aktif = false where kode = 'beras'`))
		).rejects.toThrow(/Bahan masih dipakai di resep: Nasi/);
		await expect(
			sebagai(db, adminId, () => db.query(`update public.bahan set mode = 'analisis' where kode = 'kertas_nasi'`))
		).rejects.toThrow(/Bahan masih dipakai di resep/);
		expect(await jumlah(`public.bahan where kode = 'beras' and aktif`)).toBe(1);
	});

	it('bahan yang tidak dipakai resep tetap bisa dinonaktifkan', async () => {
		await sebagai(db, adminId, () => db.query(`update public.bahan set aktif = false where kode = 'plastik_merah'`));
		expect(await jumlah(`public.bahan where kode = 'plastik_merah' and not aktif`)).toBe(1);
	});

	it('baris resep langsung (tanpa simpan_resep) tetap ditolak bila bahannya bukan otomatis', async () => {
		const nasi = await idDari('menu', 'nasi');
		const tepung = await idDari('bahan', 'tepung_a');
		await expect(
			sebagai(db, adminId, () => db.query('insert into public.resep (menu_id, bahan_id, qty) values ($1, $2, 1)', [nasi, tepung]))
		).rejects.toThrow(/Resep hanya boleh memakai bahan aktif yang dipotong otomatis/);
	});

	it('outlet tidak bisa dihapus lewat API (harga & riwayat aman)', async () => {
		await sebagai(db, adminId, () => db.query(`delete from public.outlets where kode = 'KP'`));
		expect(await jumlah(`public.outlets where kode = 'KP'`)).toBe(1);
	});
});
