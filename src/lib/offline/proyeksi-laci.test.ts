import { describe, expect, it } from 'vitest';
import type { Kejadian } from './db';
import { kasAntrean, saldoLaciLokal } from './proyeksi-laci';

let urut = 0;
const kej = (x: Partial<Kejadian> & Pick<Kejadian, 'id' | 'jenis'>): Kejadian => ({
	urut: ++urut,
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
const jual = (id: string, total: number, metode = 'cash', x: Partial<Kejadian> = {}) => kej({ id, jenis: 'jual', data: { metode, total }, ...x });

describe('saldoLaciLokal', () => {
	it('contoh owner seluruhnya offline: laci awal, jual tiga hari, pengeluaran, tutup, setoran', () => {
		const ks = [
			kej({ id: 'b1', jenis: 'buka_shift', data: { modal: 100000, laci_awal: 100000 } }),
			jual('j1', 800000),
			jual('q1', 50000, 'qris'),
			kej({ id: 't1', jenis: 'tutup_shift', data: { uang_fisik: 900000 } }),
			kej({ id: 'b2', jenis: 'buka_shift', data: { modal: 900000 } }),
			jual('j2', 600000),
			jual('j3', 1200000),
			kej({ id: 'g', jenis: 'pengeluaran', data: { jumlah: 100000 } })
		];
		expect(saldoLaciLokal(null, ks, 'o', null)).toEqual({ saldo: 2600000, adaAwal: true });
		ks.push(kej({ id: 's', jenis: 'setoran', data: { jumlah: 2500000 } }));
		expect(saldoLaciLokal(null, ks, 'o', null).saldo).toBe(100000);
	});
	it('mulai dari saldo server; laci awal kedua diabaikan; outlet lain & diabaikan tidak dihitung', () => {
		const ks = [
			kej({ id: 'b', jenis: 'buka_shift', data: { laci_awal: 5 } }),
			jual('j', 10000),
			jual('x', 99999, 'cash', { outlet_id: 'lain' }),
			kej({ id: 'g', jenis: 'pengeluaran', status: 'diabaikan', data: { jumlah: 7 } })
		];
		expect(saldoLaciLokal({ saldo: 300000, ada_awal: true }, ks, 'o', null).saldo).toBe(310000);
	});
	it('batal: jual & batal di antrean → nol; batal atas jual di server → dikurangi; non-cash tidak', () => {
		const ks = [
			jual('j', 10000),
			kej({ id: 'bj', jenis: 'batal_jual', data: { penjualan_id: 'j', metode: 'cash', total: 10000 } }),
			kej({ id: 'bs', jenis: 'batal_jual', data: { penjualan_id: 'srv', metode: 'cash', total: 4000 } }),
			kej({ id: 'bq', jenis: 'batal_jual', data: { penjualan_id: 'srv2', metode: 'qris', total: 4000 } })
		];
		expect(saldoLaciLokal({ saldo: 50000, ada_awal: true }, ks, 'o', null).saldo).toBe(46000);
	});
	it('terkirim sesudah salinan diambil masih dihitung; sebelumnya sudah tercermin; ditolak tetap dihitung (uangnya sudah keluar)', () => {
		const s = (id: string, terkirim_at: string) => kej({ id, jenis: 'setoran', status: 'terkirim', terkirim_at, data: { jumlah: 1000 } });
		const ks = [s('a', '2026-10-08T08:00:00Z'), s('b', '2026-10-08T10:00:00Z'), kej({ id: 'c', jenis: 'pengeluaran', status: 'ditolak', data: { jumlah: 500 } })];
		expect(saldoLaciLokal({ saldo: 10000, ada_awal: true }, ks, 'o', '2026-10-08T09:00:00Z').saldo).toBe(8500);
	});
});

describe('review 5a: jangkar server', () => {
	it('kejadian (termasuk yang ditolak) berjam ≤ hitungan laci terakhir di server tidak dihitung lagi', () => {
		const ks = [
			kej({ id: 'g', jenis: 'pengeluaran', status: 'ditolak', waktu: '2026-10-08T03:00:00Z', data: { jumlah: 50000 } }),
			jual('j', 10000, 'cash', { waktu: '2026-10-08T04:00:00Z' }),
			kej({ id: 's', jenis: 'setoran', waktu: '2026-10-09T02:00:00Z', data: { jumlah: 1000 } })
		];
		expect(saldoLaciLokal({ saldo: 200000, ada_awal: true, jangkar_at: '2026-10-08T10:00:00Z' }, ks, 'o', null).saldo).toBe(199000);
	});
});

describe('kasAntrean', () => {
	it('pengeluaran & setoran sejak buka shift', () => {
		const ks = [
			kej({ id: 'a', jenis: 'pengeluaran', waktu: '2026-10-08T01:00:00Z', data: { jumlah: 1 } }),
			kej({ id: 'b', jenis: 'pengeluaran', waktu: '2026-10-08T05:00:00Z', data: { jumlah: 20 } }),
			kej({ id: 'c', jenis: 'setoran', waktu: '2026-10-08T06:00:00Z', data: { jumlah: 300 } })
		];
		expect(kasAntrean(ks, 'o', '2026-10-08T02:00:00Z', null)).toEqual({ pengeluaran: 20, setoran: 300 });
	});
});

describe('kasbon (5b)', () => {
	it('kasbon dari laci mengurangi saldo & masuk pengeluaran shift', () => {
		const ks = [kej({ id: 'k', jenis: 'kasbon', waktu: '2026-10-08T05:00:00Z', data: { karyawan_id: 'x', jumlah: 40000 } })];
		expect(saldoLaciLokal({ saldo: 100000, ada_awal: true }, ks, 'o', null).saldo).toBe(60000);
		expect(kasAntrean(ks, 'o', '2026-10-08T02:00:00Z', null).pengeluaran).toBe(40000);
	});
});
