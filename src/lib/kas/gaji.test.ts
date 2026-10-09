import { describe, expect, it } from 'vitest';
import { hariDalamBulan, hitungDibayar, saranPotongan } from './gaji';

describe('gaji', () => {
	it('hari dalam bulan (termasuk kabisat)', () => {
		expect(hariDalamBulan('2026-10')).toHaveLength(31);
		expect(hariDalamBulan('2026-02')).toHaveLength(28);
		expect(hariDalamBulan('2028-02').at(-1)).toBe('2028-02-29');
		expect(hariDalamBulan('2026-11')[0]).toBe('2026-11-01');
	});
	it('dibayar & saran potongan kasbon', () => {
		expect(hitungDibayar(26, 70000, 10000, 100000)).toBe(26 * 70000 + 10000 - 100000);
		expect(saranPotongan(100000, 1820000)).toBe(100000);
		expect(saranPotongan(3000000, 1820000)).toBe(1820000);
		expect(saranPotongan(50000, -10)).toBe(0);
	});
});

describe('status kasbon (dipotong urut tanggal tertua)', () => {
	it('contoh owner: kasbon 50 rb, 100 rb, 250 rb; dipotong 200 rb dulu', async () => {
		const { statusKasbon } = await import('./gaji');
		const k = [
			{ waktu: '2026-10-30T03:00:00Z', jumlah: 250000 },
			{ waktu: '2026-10-02T03:00:00Z', jumlah: 50000 },
			{ waktu: '2026-10-10T03:00:00Z', jumlah: 100000 }
		];
		expect(statusKasbon(k, 200000).map((x) => [x.jumlah, x.dipotong, x.status])).toEqual([
			[50000, 50000, 'lunas'],
			[100000, 100000, 'lunas'],
			[250000, 50000, 'sebagian']
		]);
		expect(statusKasbon(k, 0).every((x) => x.status === 'belum')).toBe(true);
	});
});
