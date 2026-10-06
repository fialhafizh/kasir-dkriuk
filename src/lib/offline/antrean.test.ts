import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bersihkanTerkirim, cobaLagi, GalatKirim, hitungAntrean, hitungMilikLain, kirimAntrean, tambahKejadian, ubahDataMenunggu, type Pengirim } from './antrean';
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


import { abaikan } from './antrean';

describe('review T4–T8: antrean', () => {
	it('hanya mengirim kejadian milik pengguna yang sedang masuk; milik orang lain menunggu', async () => {
		await tambahKejadian(db, { ...k('a', 'jual'), user_id: 'u1' });
		await tambahKejadian(db, { ...k('b', 'jual'), user_id: 'u2' });
		const p = pengirim({});
		await kirimAntrean(db, p, 'u2');
		expect(p.dikirim).toEqual(['b']);
		expect((await db.kejadian.where('id').equals('a').first())?.status).toBe('menunggu');
	});
	it('kejadian dengan id yang sudah ada tidak ditambah dua kali (tidak galat)', async () => {
		await tambahKejadian(db, k('a', 'jual'));
		await tambahKejadian(db, k('a', 'jual'));
		expect(await db.kejadian.count()).toBe(1);
	});
	it('abaikan: kejadian ditolak keluar dari daftar dengan alasan', async () => {
		await tambahKejadian(db, k('a', 'jual'));
		await kirimAntrean(db, pengirim({ a: 'tolak' }));
		const x = await abaikan(db, 'a', 'transaksi dobel');
		expect(x?.status).toBe('diabaikan');
		expect(await hitungAntrean(db)).toEqual({ menunggu: 0, ditolak: 0 });
	});
});


describe('kejadian 4b di antrean', () => {
	it('jual lalu batalnya dikirim berurutan; batal di shift yang buka-nya ditolak ikut tertahan', async () => {
		await tambahKejadian(db, k('j', 'jual'));
		await tambahKejadian(db, k('bj', 'batal_jual'));
		await tambahKejadian(db, k('kt', 'kirim_transfer', null));
		const p = pengirim({});
		await kirimAntrean(db, p);
		expect(p.dikirim).toEqual(['j', 'bj', 'kt']);

		await tambahKejadian(db, k('b2', 'buka_shift', 's2'));
		await tambahKejadian(db, k('bj2', 'batal_jual', 's2'));
		await tambahKejadian(db, k('op', 'opname', null));
		const p2 = pengirim({ b2: 'tolak' });
		// ditolak = yang dikirim lalu ditolak; batal yang tertahan tidak dikirim sama sekali.
		expect(await kirimAntrean(db, p2)).toMatchObject({ terkirim: 1, ditolak: 1 });
		expect(p2.dikirim).toEqual(['b2', 'op']);
		expect((await db.kejadian.where('id').equals('bj2').first())?.status).toBe('ditolak');
	});
});

describe('pengerasan 4b', () => {
	const lama = '2026-10-01T00:00:00Z';
	const terkirim = (id: string, jenis: Kejadian['jenis'], shift: string | null, terkirim_at = lama, hasil: unknown = null) =>
		db.kejadian.add({ ...k(id, jenis, shift), status: 'terkirim', alasan: null, percobaan: 0, hasil, terkirim_at });
	const ada = async () => (await db.kejadian.toArray()).map((x) => x.id).sort();

	it('bersihkan: shift tanpa tutup di perangkat disimpan; shift yang ditutup & kejadian tanpa shift dihapus', async () => {
		await terkirim('j-buka', 'jual', 'sBuka');
		await terkirim('b-tutup', 'buka_shift', 'dev', lama, 'srv');
		await terkirim('j-tutup', 'jual', 'srv');
		await terkirim('t-tutup', 'tutup_shift', 'dev');
		await terkirim('r', 'rusak', null);
		await terkirim('baru', 'rusak', null, '2026-10-07T00:00:00Z');
		await bersihkanTerkirim(db, new Date('2026-10-05T00:00:00Z'));
		expect(await ada()).toEqual(['baru', 'j-buka']);
	});
	it('bersihkan: lewat 14 hari dihapus walau shift tidak ditutup di perangkat ini', async () => {
		await terkirim('j', 'jual', 'sLain', '2026-09-15T00:00:00Z');
		await bersihkanTerkirim(db, new Date('2026-10-05T00:00:00Z'));
		expect(await ada()).toEqual([]);
	});
	it('hitungMilikLain: menunggu/ditolak milik akun lain saja', async () => {
		await tambahKejadian(db, { ...k('a', 'jual'), user_id: 'u1' });
		await tambahKejadian(db, { ...k('b', 'jual'), user_id: 'u2' });
		await tambahKejadian(db, { ...k('c', 'jual'), user_id: null });
		expect(await hitungMilikLain(db, 'u1')).toBe(1);
		expect(await hitungMilikLain(db, null)).toBe(2);
	});
});
