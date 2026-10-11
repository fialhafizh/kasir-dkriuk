import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { rpc } from './harness-3b';
import { idOutlet } from './harness-kasir';

let db: PGlite;
let adminId: string;
let kasirKP: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirKP = await buatUser(db, { username: 'kasir.kertapati', role: 'kasir', outlet_kode: 'KP' });
});

const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const status = async (outlet: string) =>
	(await db.query<{ label: string }>('select label from public._tg_status_stok($1)', [await idOutlet(db, outlet)])).rows.map((r) => r.label);

describe('satuan beli per outlet (Kertapati)', () => {
	it('Kertapati tidak melihat ayam Hot, kulit, cup kulit; Bukit Lama tetap', async () => {
		const kp = await status('KP');
		expect(kp).toContain('Ayam Ori');
		expect(kp).not.toContain('Ayam Hot');
		expect(kp).not.toContain('Kulit Mentah');
		expect(kp).not.toContain('Cup Kulit');
		const bl = await status('BL');
		expect(bl).toContain('Ayam Hot');
		expect(bl).toContain('Kulit Mentah');
	});

	it('isi pack: saus D\'Kriuk 150, saus Kertapati 25, kemasan besar & plastik kecil Kertapati 50', async () => {
		const isi = async (kode: string) =>
			Number(await nilai(`select i.qty as v from public.satuan_beli_isi i join public.satuan_beli s on s.id = i.satuan_beli_id where s.kode = $1`, [kode]));
		expect(await isi('pack_saus_sambal')).toBe(125);
		expect(await isi('pack_saus_tomat')).toBe(125);
		expect(await isi('pack_saus_sambal_25')).toBe(25);
		expect(await isi('pack_kemasan_besar_50')).toBe(50);
		expect(await isi('pack_plastik_kecil_50')).toBe(50);
	});

	it('rencana belanja: Kertapati memakai pack isi 25, tidak ada baris Hot/kulit untuk Kertapati', async () => {
		const kp = await idOutlet(db, 'KP');
		const bl = await idOutlet(db, 'BL');
		const r = await rpc<{ barang: { nama: string; per_outlet: Record<string, unknown> }[] }>(db, adminId, 'public.rencana_belanja($1)', [7]);
		const baris = (nama: string) => r.barang.find((b) => b.nama === nama);
		expect(Object.keys(baris('Pack Saus Sambal (isi 25)')!.per_outlet)).toEqual([kp]);
		expect(Object.keys(baris('Pack Saus Sambal')!.per_outlet)).not.toContain(kp);
		expect(Object.keys(baris('Pack Saus Sambal')!.per_outlet)).toContain(bl);
		expect(Object.keys(baris('Pack Ayam Hot (1 kg)')!.per_outlet)).not.toContain(kp);
		expect(Object.keys(baris('Pack Ayam Ori (1 kg)')!.per_outlet)).toContain(kp);
	});

	it('admin mengatur outlet pemakai satuan beli; kosong = semua outlet; kasir ditolak', async () => {
		const sid = await nilai<string>(`select id as v from public.satuan_beli where kode = 'pack_box'`);
		await rpc(db, adminId, 'public.simpan_outlet_satuan($1, $2)', [sid, [await idOutlet(db, 'BL')]]);
		expect(await status('KP')).not.toContain("Box D'Kriuk");
		await rpc(db, adminId, 'public.simpan_outlet_satuan($1, $2)', [sid, []]);
		expect(await status('KP')).toContain("Box D'Kriuk");
		await expect(rpc(db, kasirKP, 'public.simpan_outlet_satuan($1, $2)', [sid, []])).rejects.toThrow(/Hanya admin/);
	});
});
