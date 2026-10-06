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


const jualSrv = (id: string, total: number, metode: 'cash' | 'qris' = 'cash') => ({
	id,
	nomor: `BL-1-${id}`,
	waktu: '2026-10-08T02:00:00Z',
	metode,
	total,
	diterima: null,
	kembalian: null,
	void_at: null,
	void_alasan: null,
	item: []
});
const jualKej = (id: string, total: number, status: Kejadian['status'] = 'menunggu') =>
	kej({ id, jenis: 'jual', status, shift_id: 'srv', data: { metode: 'cash', total, item: [], kode_struk: 'ABCDEF' } });
const batalKej = (id: string, penjualanId: string, status: Kejadian['status'] = 'menunggu') =>
	kej({ id, jenis: 'batal_jual', status, shift_id: 'srv', data: { penjualan_id: penjualanId, alasan: 'salah' }, alasan: status === 'ditolak' ? 'Ditolak.' : null });
const dasar = {
	shift_id: 'srv',
	outlet_id: 'o',
	modal: 100000,
	dibuka_at: '2026-10-08T00:00:00Z',
	ditutup_at: null,
	jumlah_transaksi: 2,
	jumlah_void: 0,
	total: 30000,
	per_metode: {
		cash: { jumlah: 2, total: 30000 },
		qris: { jumlah: 0, total: 0 },
		gofood: { jumlah: 0, total: 0 },
		grabfood: { jumlah: 0, total: 0 },
		shopeefood: { jumlah: 0, total: 0 }
	},
	cash_seharusnya: 130000,
	uang_fisik: null,
	selisih: null
};

describe('batal dari antrean (4b)', () => {
	it('batal menunggu atas transaksi server → tampil dibatalkan & keluar dari ringkasan', () => {
		const rows = gabungRiwayat([jualSrv('a', 10000), jualSrv('b', 20000)], [batalKej('x', 'a')], 'srv');
		const a = rows.find((p) => p.id === 'a')!;
		expect(a).toMatchObject({ void_alasan: 'salah', batal_lokal: true, batal_kirim: 'menunggu' });
		const r = ringkasanLokal(dasar, serverShift, rows);
		expect(r).toMatchObject({ jumlah_transaksi: 1, jumlah_void: 1, total: 20000, cash_seharusnya: 120000 });
		expect(r.per_metode.cash).toEqual({ jumlah: 1, total: 20000 });
	});
	it('batal atas jual yang masih di antrean → tidak dihitung, void +1', () => {
		const rows = gabungRiwayat([], [jualKej('j', 5000), batalKej('x', 'j')], 'srv');
		expect(ringkasanLokal(null, serverShift, rows)).toMatchObject({ jumlah_transaksi: 0, jumlah_void: 1, total: 0, cash_seharusnya: 100000 });
	});
	it('batal ditolak server → transaksi tetap berlaku, ditandai', () => {
		const rows = gabungRiwayat([jualSrv('a', 10000)], [batalKej('x', 'a', 'ditolak')], 'srv');
		expect(rows[0]).toMatchObject({ void_at: null, batal_kirim: 'ditolak', alasan_batal_ditolak: 'Ditolak.' });
		expect(ringkasanLokal({ ...dasar, jumlah_transaksi: 1, total: 10000, cash_seharusnya: 110000, per_metode: { ...dasar.per_metode, cash: { jumlah: 1, total: 10000 } } }, serverShift, rows)).toMatchObject({ jumlah_void: 0, total: 10000 });
	});
	it('batal terkirim tapi data server sudah mencatat batalnya → tidak dikurangi dua kali', () => {
		const rows = gabungRiwayat([{ ...jualSrv('a', 10000), void_at: '2026-10-08T03:00:00Z', void_alasan: 'salah' }], [batalKej('x', 'a', 'terkirim')], 'srv');
		expect(rows[0].batal_lokal).toBe(false);
		const d = { ...dasar, jumlah_transaksi: 0, jumlah_void: 1, total: 0, cash_seharusnya: 100000, per_metode: { ...dasar.per_metode, cash: { jumlah: 0, total: 0 } } };
		expect(ringkasanLokal(d, serverShift, rows)).toMatchObject({ jumlah_void: 1, total: 0 });
	});
	it('jual ditolak server tetap dihitung tetapi dilaporkan terpisah', () => {
		const rows = gabungRiwayat([], [jualKej('j', 7000, 'ditolak')], 'srv');
		expect(ringkasanLokal(null, serverShift, rows)).toMatchObject({ total: 7000, jumlah_ditolak: 1, total_ditolak: 7000 });
	});
});

describe('shiftLokal dengan salinan lama (4b)', () => {
	const t = (terkirim_at: string) => kej({ id: 't', jenis: 'tutup_shift', shift_id: 'srv', status: 'terkirim', terkirim_at });
	it('tutup terkirim SESUDAH salinan diambil → shift sudah tutup', () => {
		expect(shiftLokal(serverShift, [t('2026-10-08T10:00:00Z')], 'o', '2026-10-08T09:00:00Z')).toBeNull();
	});
	it('tutup terkirim SEBELUM salinan diambil, atau data server baru → data server dipakai', () => {
		expect(shiftLokal(serverShift, [t('2026-10-08T08:00:00Z')], 'o', '2026-10-08T09:00:00Z')).toEqual(serverShift);
		expect(shiftLokal(serverShift, [t('2026-10-08T10:00:00Z')], 'o')).toEqual(serverShift);
	});
	it('buka terkirim sesudah salinan → id shift dari server (bisa hasil penggabungan)', () => {
		const b = kej({ id: 'b', jenis: 'buka_shift', shift_id: 'dev', status: 'terkirim', terkirim_at: '2026-10-08T10:00:00Z', hasil: 'srv2', data: { modal: 5 } });
		expect(shiftLokal(null, [b], 'o', '2026-10-08T09:00:00Z')?.id).toBe('srv2');
	});
});

describe('review 4b: ringkasan satu sumber', () => {
	it('daftar server lebih baru dari salinan ringkasan → transaksi di daftar tetap terhitung sekali', () => {
		const lama = { ...dasar, jumlah_transaksi: 1, total: 10000, cash_seharusnya: 110000, per_metode: { ...dasar.per_metode, cash: { jumlah: 1, total: 10000 } } };
		const rows = gabungRiwayat([jualSrv('a', 10000), jualSrv('x', 4321)], [jualKej('x', 4321, 'terkirim')], 'srv');
		expect(ringkasanLokal(lama, serverShift, rows)).toMatchObject({ jumlah_transaksi: 2, total: 14321, cash_seharusnya: 114321 });
	});
	it('tanpa daftar server (belum pernah tersimpan) → ringkasan server + antrean', () => {
		const rows = gabungRiwayat([], [jualKej('j', 5000)], 'srv');
		expect(ringkasanLokal(dasar, serverShift, rows, false)).toMatchObject({ jumlah_transaksi: 3, total: 35000, cash_seharusnya: 135000 });
	});
	it('batal atas transaksi yang ditolak server → tetap dianggap batal (uang sudah dikembalikan)', () => {
		const rows = gabungRiwayat([], [jualKej('j', 5000, 'ditolak'), batalKej('b', 'j', 'ditolak')], 'srv');
		expect(ringkasanLokal(null, serverShift, rows)).toMatchObject({ total: 0, jumlah_void: 1, jumlah_ditolak: 0 });
	});
});
