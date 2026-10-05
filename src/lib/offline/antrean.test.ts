import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cobaLagi, GalatKirim, hitungAntrean, kirimAntrean, tambahKejadian, ubahDataMenunggu, type Pengirim } from './antrean';
import { bukaDb, type DbKasir, type Kejadian } from './db';

let db: DbKasir;
beforeEach(async () => {
	db = bukaDb(`uji-${crypto.randomUUID()}`);
});

const k = (id: string, jenis: Kejadian['jenis'], shift: string | null = 's1') => ({ id, jenis, outlet_id: 'o', shift_id: shift, waktu: '2026-10-08T01:00:00Z', data: {} });

function pengirim(aturan: Record<string, 'ok' | 'tolak' | 'putus'>): Pengirim & { dikirim: string[] } {
	const dikirim: string[] = [];
	return {
		dikirim,
		async kirim(x) {
			dikirim.push(x.id);
			const a = aturan[x.id] ?? 'ok';
			if (a === 'tolak') throw new GalatKirim('Shift sudah ditutup.', false);
			if (a === 'putus') throw new GalatKirim('Tidak bisa terhubung.', true);
			return { ok: x.id };
		}
	};
}

describe('antrean kejadian', () => {
	it('dikirim berurutan sesuai urutan dibuat; hasil disimpan; tidak dikirim dua kali', async () => {
		await tambahKejadian(db, k('a', 'buka_shift'));
		await tambahKejadian(db, k('b', 'jual'));
		await tambahKejadian(db, k('c', 'tutup_shift'));
		const p = pengirim({});
		expect(await kirimAntrean(db, p)).toEqual({ terkirim: 3, ditolak: 0, berhenti: 'selesai' });
		expect(p.dikirim).toEqual(['a', 'b', 'c']);
		await kirimAntrean(db, p);
		expect(p.dikirim).toEqual(['a', 'b', 'c']);
		expect((await db.kejadian.where('id').equals('b').first())?.hasil).toEqual({ ok: 'b' });
	});
	it('galat jaringan: berhenti, sisanya tetap menunggu, urutan terjaga', async () => {
		await tambahKejadian(db, k('a', 'jual'));
		await tambahKejadian(db, k('b', 'jual'));
		const p = pengirim({ a: 'putus' });
		expect((await kirimAntrean(db, p)).berhenti).toBe('jaringan');
		expect(p.dikirim).toEqual(['a']);
		expect(await hitungAntrean(db)).toEqual({ menunggu: 2, ditolak: 0 });
	});
	it('ditolak server: ke Perlu perhatian dengan alasan; antrean lanjut', async () => {
		await tambahKejadian(db, k('a', 'jual', 's1'));
		await tambahKejadian(db, k('b', 'jual', 's2'));
		const p = pengirim({ a: 'tolak' });
		expect(await kirimAntrean(db, p)).toEqual({ terkirim: 1, ditolak: 1, berhenti: 'selesai' });
		const a = await db.kejadian.where('id').equals('a').first();
		expect(a).toMatchObject({ status: 'ditolak', alasan: 'Shift sudah ditutup.' });
	});
	it('buka toko ditolak → kejadian shift itu ikut tertahan; coba lagi melepas semuanya', async () => {
		await tambahKejadian(db, k('buka', 'buka_shift', 's1'));
		await tambahKejadian(db, k('j1', 'jual', 's1'));
		await tambahKejadian(db, k('lain', 'jual', 's9'));
		await kirimAntrean(db, pengirim({ buka: 'tolak' }));
		expect((await db.kejadian.where('id').equals('j1').first())).toMatchObject({ status: 'ditolak', alasan: expect.stringMatching(/^Menunggu: buka toko/) });
		expect((await db.kejadian.where('id').equals('lain').first())?.status).toBe('terkirim');
		await cobaLagi(db, 'buka');
		expect(await hitungAntrean(db)).toEqual({ menunggu: 2, ditolak: 0 });
		const p = pengirim({});
		await kirimAntrean(db, p);
		expect(p.dikirim).toEqual(['buka', 'j1']);
	});
	it('kejadian baru di shift yang buka-nya sedang ditolak langsung ikut tertahan saat dikirim', async () => {
		await tambahKejadian(db, k('buka', 'buka_shift', 's1'));
		await kirimAntrean(db, pengirim({ buka: 'tolak' }));
		await tambahKejadian(db, k('j2', 'jual', 's1'));
		const p = pengirim({});
		await kirimAntrean(db, p);
		expect(p.dikirim).toEqual([]);
		expect((await db.kejadian.where('id').equals('j2').first())?.status).toBe('ditolak');
	});
	it('data kejadian yang masih menunggu bisa diubah; yang sudah terkirim tidak', async () => {
		await tambahKejadian(db, k('a', 'jual'));
		expect(await ubahDataMenunggu(db, 'a', { nomor_sementara: 'S1-001' })).toBe(true);
		expect((await db.kejadian.where('id').equals('a').first())?.data).toEqual({ nomor_sementara: 'S1-001' });
		await kirimAntrean(db, pengirim({}));
		expect(await ubahDataMenunggu(db, 'a', { x: 1 })).toBe(false);
	});
});
