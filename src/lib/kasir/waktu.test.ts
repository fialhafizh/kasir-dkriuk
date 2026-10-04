import { describe, expect, it } from 'vitest';
import { formatWaktuWib, shiftKedaluwarsa, tanggalWib } from './waktu';

describe('waktu WIB', () => {
	it('format struk dd/MM/yy HH:mm:ss dalam WIB', () => {
		expect(formatWaktuWib('2026-10-05T05:31:07Z')).toBe('05/10/26 12:31:07');
	});
	it('tanggal WIB berganti pukul 00:00 WIB (17:00 UTC)', () => {
		expect(tanggalWib('2026-10-04T16:59:59Z')).toBe('2026-10-04');
		expect(tanggalWib('2026-10-04T17:00:00Z')).toBe('2026-10-05');
	});
	it('shift dari hari WIB sebelumnya dianggap kedaluwarsa', () => {
		const sekarang = new Date('2026-10-05T02:00:00Z'); // 09:00 WIB 5 Okt
		expect(shiftKedaluwarsa('2026-10-05T00:30:00Z', sekarang)).toBe(false);
		expect(shiftKedaluwarsa('2026-10-04T13:00:00Z', sekarang)).toBe(true);
	});
});
