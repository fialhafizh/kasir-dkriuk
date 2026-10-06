import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { bukaDb } from './db';
import { bacaSalinan, denganSalinan } from './salinan';

const jaringan = (e: unknown) => (e as Error).message === 'putus';

describe('denganSalinan', () => {
	it('online: ambil dari server lalu simpan', async () => {
		const db = bukaDb(`uji-${crypto.randomUUID()}`);
		const r = await denganSalinan(db, 'menu:o', async () => [1, 2], jaringan);
		expect(r).toMatchObject({ nilai: [1, 2], dariSalinan: false });
		expect(Date.now() - Date.parse(r.disimpanAt)).toBeLessThan(5000);
		expect(await bacaSalinan(db, 'menu:o')).toEqual([1, 2]);
	});
	it('jaringan putus: pakai salinan terakhir', async () => {
		const db = bukaDb(`uji-${crypto.randomUUID()}`);
		const awal = await denganSalinan(db, 'menu:o', async () => [1], jaringan);
		// Jam salinan = jam data diambil dari server, bukan jam dibaca ulang.
		expect(await denganSalinan(db, 'menu:o', async () => { throw new Error('putus'); }, jaringan)).toEqual({ nilai: [1], dariSalinan: true, disimpanAt: awal.disimpanAt });
	});
	it('jaringan putus tanpa salinan, atau galat bukan jaringan → galat diteruskan', async () => {
		const db = bukaDb(`uji-${crypto.randomUUID()}`);
		await expect(denganSalinan(db, 'x', async () => { throw new Error('putus'); }, jaringan)).rejects.toThrow('putus');
		await denganSalinan(db, 'y', async () => 1, jaringan);
		await expect(denganSalinan(db, 'y', async () => { throw new Error('izin'); }, jaringan)).rejects.toThrow('izin');
	});
});
