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
