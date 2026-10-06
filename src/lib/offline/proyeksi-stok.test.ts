import { describe, expect, it } from 'vitest';
import { perluOpname } from '#lib/stok/opname.ts';
import type { Transfer } from '#lib/stok/types.ts';
import type { Kejadian } from './db';
import { antreanOutlet, hitunganLokal, stokLokal, transferLokal } from './proyeksi-stok';

const kej = (x: Partial<Kejadian> & Pick<Kejadian, 'id' | 'jenis'>): Kejadian => ({
	outlet_id: 'o',
	shift_id: null,
	waktu: '2026-10-08T03:00:00Z',
	data: {},
	status: 'menunggu',
	alasan: null,
	percobaan: 0,
	hasil: null,
	terkirim_at: null,
	...x
});
const resep = [
	{ menu_id: 'dada', bahan_id: 'ayam', qty: 1 },
	{ menu_id: 'nasi', bahan_id: 'beras', qty: 0.0833 }
];
const server = new Map([
	['ayam', 10],
	['beras', 2]
]);

describe('stokLokal', () => {
	it('jual dipotong menurut resep; rusak berkurang; terima bertambah', () => {
		const s = stokLokal(
			server,
			[
				kej({ id: 'j', jenis: 'jual', data: { item: [{ menu_id: 'dada', qty: 2 }, { menu_id: 'nasi', qty: 12 }] } }),
				kej({ id: 'r', jenis: 'rusak', data: { item: [{ bahan_id: 'ayam', qty: 1 }] } }),
				kej({ id: 't', jenis: 'terima_transfer', data: { transfer_id: 'x', item: [{ bahan_id: 'ayam', qty: 4 }] } })
			],
			resep,
			'o',
			null
		);
		expect(s.get('ayam')).toBe(11);
		expect(s.get('beras')).toBeCloseTo(2 - 0.9996, 6);
	});
	it('jual yang dibatalkan lewat antrean tidak dipotong; outlet lain & kirim diabaikan', () => {
		const s = stokLokal(
			server,
			[
				kej({ id: 'j', jenis: 'jual', data: { item: [{ menu_id: 'dada', qty: 2 }] } }),
				kej({ id: 'b', jenis: 'batal_jual', data: { penjualan_id: 'j' } }),
				kej({ id: 'j2', jenis: 'jual', outlet_id: 'lain', data: { item: [{ menu_id: 'dada', qty: 5 }] } }),
				kej({ id: 'k', jenis: 'kirim_transfer', data: { item: [{ bahan_id: 'ayam', qty: 3 }] } })
			],
			resep,
			'o',
			null
		);
		expect(s.get('ayam')).toBe(10);
	});
	it('terkirim sesudah salinan diambil masih dihitung; sebelum itu sudah tercermin di server', () => {
		const j = (id: string, terkirim_at: string) => kej({ id, jenis: 'jual', status: 'terkirim', terkirim_at, data: { item: [{ menu_id: 'dada', qty: 1 }] } });
		const s = stokLokal(server, [j('a', '2026-10-08T08:00:00Z'), j('b', '2026-10-08T10:00:00Z')], resep, 'o', '2026-10-08T09:00:00Z');
		expect(s.get('ayam')).toBe(9);
		expect(stokLokal(server, [j('b', '2026-10-08T10:00:00Z')], resep, 'o', null).get('ayam')).toBe(10);
	});
	it('kejadian ditolak tidak mengubah stok', () => {
		expect(stokLokal(server, [kej({ id: 'r', jenis: 'rusak', status: 'ditolak', data: { item: [{ bahan_id: 'ayam', qty: 1 }] } })], resep, 'o', null).get('ayam')).toBe(10);
	});
});

const trf = (x: Partial<Transfer> & Pick<Transfer, 'id'>): Transfer => ({
	dari_outlet_id: 'o',
	ke_outlet_id: 'o2',
	status: 'dikirim',
	catatan: null,
	dikirim_at: '2026-10-08T01:00:00Z',
	diterima_at: null,
	batal_alasan: null,
	item: [{ bahan_id: 'ayam', qty: 4 }],
	...x
});

describe('transferLokal', () => {
	it('kirim → ubah → batal di antrean', () => {
		const ks = [
			kej({ id: 't1', jenis: 'kirim_transfer', data: { ke_outlet_id: 'o2', item: [{ bahan_id: 'ayam', qty: 2 }] } }),
			kej({ id: 'u', jenis: 'ubah_transfer', data: { transfer_id: 't1', item: [{ bahan_id: 'ayam', qty: 3 }], catatan: null } })
		];
		const a = transferLokal([], ks, 'o', null);
		expect(a).toMatchObject([{ id: 't1', status: 'dikirim', item: [{ bahan_id: 'ayam', qty: 3 }], lokal: true, dikirim_at: '2026-10-08T03:00:00Z' }]);
		const b = transferLokal([], [...ks, kej({ id: 'x', jenis: 'batal_transfer', data: { transfer_id: 't1', alasan: 'tidak jadi' } })], 'o', null);
		expect(b[0]).toMatchObject({ status: 'dibatalkan', batal_alasan: 'tidak jadi' });
	});
	it('kirim yang sudah ada di server tidak digandakan; terima mengubah status', () => {
		const ks = [kej({ id: 't1', jenis: 'kirim_transfer', status: 'terkirim', terkirim_at: '2026-10-08T10:00:00Z', data: { ke_outlet_id: 'o2', item: [] } })];
		expect(transferLokal([trf({ id: 't1' })], ks, 'o', '2026-10-08T09:00:00Z')).toHaveLength(1);
		const t = transferLokal([trf({ id: 't9', dari_outlet_id: 'o2', ke_outlet_id: 'o', item: [] })], [kej({ id: 'r', jenis: 'terima_transfer', data: { transfer_id: 't9', item: [] } })], 'o', null);
		expect(t[0]).toMatchObject({ status: 'diterima', diterima_at: '2026-10-08T03:00:00Z' });
	});
});

describe('hitunganLokal', () => {
	it('opname di antrean tampil diajukan → pengingat opname tidak muncul lagi', () => {
		const sekarang = new Date('2026-10-11T05:00:00Z');
		const awal = '2026-10-01T00:00:00Z';
		expect(perluOpname(sekarang, awal, [])).toBe(true);
		const op = hitunganLokal([], [kej({ id: 'h', jenis: 'opname', waktu: '2026-10-11T04:00:00Z', data: { item: [] } })], 'opname', 'o', null);
		expect(op).toMatchObject([{ id: 'h', status: 'diajukan', dihitung_at: '2026-10-11T04:00:00Z' }]);
		expect(perluOpname(sekarang, awal, op)).toBe(false);
	});
	it('stok awal di antrean membawa isiannya; yang sudah ada di server tidak digandakan', () => {
		const ks = [kej({ id: 'h', jenis: 'stok_awal', data: { item: [{ bahan_id: 'ayam', qty: 5 }] } })];
		const a = hitunganLokal([], ks, 'stok_awal', 'o', null) as unknown as { item: unknown[] }[];
		expect(a[0].item).toEqual([{ bahan_id: 'ayam', qty_hitung: 5 }]);
		const srv = [{ id: 'h', outlet_id: 'o', status: 'disetujui', dihitung_at: '2026-10-08T03:00:00Z', catatan: null }];
		expect(hitunganLokal(srv, ks, 'stok_awal', 'o', null)).toEqual(srv);
	});
});

describe('antreanOutlet', () => {
	it('menghitung kejadian menunggu outlet ini saja', () => {
		expect(antreanOutlet([kej({ id: 'a', jenis: 'rusak' }), kej({ id: 'b', jenis: 'rusak', outlet_id: 'x' }), kej({ id: 'c', jenis: 'rusak', status: 'terkirim' })], 'o')).toBe(1);
	});
});
