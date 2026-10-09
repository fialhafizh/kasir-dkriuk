import { describe, expect, it } from 'vitest';
import { berlakuPada, rentangBulan, type BiayaTetap } from './laporan';

const b = (x: Partial<BiayaTetap>): BiayaTetap => ({ id: crypto.randomUUID(), outlet_id: 'o', nama: 'Sewa', per_tahun: 1, mulai: '2026-01-01', aktif: true, ...x });

describe('laporan', () => {
	it('rentang bulan', () => {
		expect(rentangBulan('2026-02')).toEqual({ dari: '2026-02-01', sampai: '2026-02-28' });
	});
	it('biaya tetap yang berlaku: mulai terakhir ≤ tanggal, aktif, per outlet & nama', () => {
		const xs = [b({ per_tahun: 10 }), b({ per_tahun: 20, mulai: '2026-06-01' }), b({ per_tahun: 30, mulai: '2026-09-01', aktif: false }), b({ outlet_id: 'p', per_tahun: 5 })];
		expect(berlakuPada(xs, '2026-07-01').map((x) => x.per_tahun).sort()).toEqual([20, 5]);
		expect(berlakuPada(xs, '2026-03-01').map((x) => x.per_tahun).sort()).toEqual([10, 5]);
		expect(berlakuPada(xs, '2025-12-31')).toEqual([]);
	});
});
