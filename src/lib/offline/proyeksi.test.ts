import { describe, expect, it } from 'vitest';
import type { Kejadian } from './db';
import { cocokCari, gabungRiwayat, ringkasanLokal, shiftLokal } from './proyeksi';

const kej = (x: Partial<Kejadian> & Pick<Kejadian, 'id' | 'jenis'>): Kejadian => ({
	outlet_id: 'o',
	shift_id: 's1',
	waktu: '2026-10-08T03:00:00Z',
	data: {},
	status: 'menunggu',
	alasan: null,
	percobaan: 0,
	hasil: null,
	terkirim_at: null,
	...x
});
const serverShift = { id: 'srv', outlet_id: 'o', dibuka_at: '2026-10-08T00:00:00Z', modal: 100000, ditutup_at: null };

describe('shiftLokal', () => {
	it('tanpa kejadian → shift server', () => {
		expect(shiftLokal(serverShift, [], 'o')).toEqual(serverShift);
	});
	it('buka di perangkat (belum terkirim) → shift lokal dengan id perangkat', () => {
		const k = [kej({ id: 'b', jenis: 'buka_shift', shift_id: 'dev1', data: { modal: 50000 } })];
		expect(shiftLokal(null, k, 'o')).toMatchObject({ id: 'dev1', modal: 50000, ditutup_at: null });
	});
	it('tutup di perangkat → tidak ada shift terbuka walau server masih terbuka', () => {
		const k = [kej({ id: 't', jenis: 'tutup_shift', shift_id: 'srv' })];
		expect(shiftLokal(serverShift, k, 'o')).toBeNull();
	});
	it('buka lalu tutup lalu buka lagi → shift terakhir', () => {
		const k = [
			kej({ id: 'b1', jenis: 'buka_shift', shift_id: 'd1', data: { modal: 1 } }),
			kej({ id: 't1', jenis: 'tutup_shift', shift_id: 'd1' }),
			kej({ id: 'b2', jenis: 'buka_shift', shift_id: 'd2', data: { modal: 2 }, waktu: '2026-10-08T05:00:00Z' })
		];
		expect(shiftLokal(null, k, 'o')?.id).toBe('d2');
	});
	it('kejadian outlet lain diabaikan', () => {
		expect(shiftLokal(null, [kej({ id: 'b', jenis: 'buka_shift', outlet_id: 'x', shift_id: 'd' })], 'o')).toBeNull();
	});
});

describe('riwayat & ringkasan lokal', () => {
	const jualK = (id: string, status: Kejadian['status'], total: number, metode = 'cash') =>
		kej({ id, jenis: 'jual', status, data: { metode, total, diterima: total, kembalian: 0, kode_struk: `K${id}AAAA`.slice(0, 6), nomor_sementara: 'S1-001', item: [{ nama: 'Dada', harga: total, qty: 1 }] } });
	const server = [{ id: 'srv1', nomor: 'BL-1', waktu: '2026-10-08T02:00:00Z', metode: 'cash' as const, total: 10000, diterima: 10000, kembalian: 0, void_at: null, void_alasan: null, item: [], kode_struk: 'SRV111' }];
	it('gabung: penjualan server + yang belum terkirim; yang sudah terkirim tapi sudah ada di server tidak dobel', () => {
		const r = gabungRiwayat(server, [jualK('a', 'menunggu', 5000), jualK('srv1', 'terkirim', 10000)], 's1');
		expect(r.map((x) => [x.id, x.status_kirim])).toEqual([
			['a', 'menunggu'],
			['srv1', 'server']
		]);
	});
	it('ringkasan lokal = ringkasan server + penjualan belum terkirim (cash menambah cash seharusnya)', () => {
		const lokal = gabungRiwayat([], [jualK('a', 'menunggu', 5000), jualK('b', 'ditolak', 7000, 'qris')], 's1');
		const r = ringkasanLokal(null, { ...serverShift, id: 's1' }, lokal);
		expect(r).toMatchObject({ jumlah_transaksi: 2, total: 12000, cash_seharusnya: 105000 });
		expect(r.per_metode.qris).toEqual({ jumlah: 1, total: 7000 });
	});
	it('cari: nomor resmi, nomor sementara, kode struk (tanpa beda huruf besar/kecil)', () => {
		const [p] = gabungRiwayat([], [jualK('a', 'menunggu', 5000)], 's1');
		expect(cocokCari(p, 'kaaa')).toBe(true);
		expect(cocokCari(p, 's1-001')).toBe(true);
		expect(cocokCari(p, 'zzz')).toBe(false);
	});
});

describe('shift digabung saat sinkron (id perangkat ≠ id shift server)', () => {
	const buka = kej({ id: 'b', jenis: 'buka_shift', shift_id: 'dev1', status: 'terkirim', hasil: 'srv', data: { modal: 0 } });
	const jual = kej({ id: 'j', jenis: 'jual', shift_id: 'dev1', status: 'ditolak', alasan: 'x', data: { metode: 'qris', total: 9000, item: [] } });
	it('penjualan yang masih memakai id perangkat tetap tampil di riwayat shift server', () => {
		expect(gabungRiwayat([], [buka, jual], 'srv').map((p) => p.id)).toEqual(['j']);
	});
	it('dan sebaliknya: shift server terlihat dari id perangkat', () => {
		const jSrv = kej({ id: 'j2', jenis: 'jual', shift_id: 'srv', data: { metode: 'qris', total: 1, item: [] } });
		expect(gabungRiwayat([], [buka, jSrv], 'dev1').map((p) => p.id)).toEqual(['j2']);
	});
});


describe('review T4–T8: proyeksi', () => {
	it('buka yang DITOLAK tidak dipakai: shift server (mis. kemarin) tetap tampil supaya bisa ditutup', () => {
		const k = [kej({ id: 'b', jenis: 'buka_shift', shift_id: 'dev', status: 'ditolak', alasan: 'Toko kemarin belum ditutup.' })];
		expect(shiftLokal(serverShift, k, 'o')?.id).toBe('srv');
	});
	it('ringkasan menghitung penjualan terkirim yang belum ada di daftar server (salinan lama)', () => {
		const t = kej({ id: 't', jenis: 'jual', status: 'terkirim', hasil: { nomor: 'BL-9', total: 4000 }, data: { metode: 'cash', total: 4000, item: [] } });
		const r = ringkasanLokal(null, { ...serverShift, id: 's1' }, gabungRiwayat([], [t], 's1'));
		expect(r).toMatchObject({ jumlah_transaksi: 1, cash_seharusnya: 104000 });
	});
});

