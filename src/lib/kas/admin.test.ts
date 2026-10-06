import { describe, expect, it } from 'vitest';
import { awalHariWib, mundurHari, ringkasRentang, type HariKas } from './admin';

const hari = (x: Partial<HariKas>): HariKas => ({
	tanggal: '2026-10-08',
	per_metode: { cash: { jumlah: 1, total: 1000 }, qris: { jumlah: 1, total: 2000 }, gofood: { jumlah: 0, total: 0 }, grabfood: { jumlah: 0, total: 0 }, shopeefood: { jumlah: 0, total: 0 } },
	total: 3000,
	jumlah_batal: 0,
	pengeluaran_laci: [{ kategori: 'Gas', jumlah: 300 }],
	pengeluaran_luar: [],
	belanja_bahan: 0,
	setoran: 0,
	saldo_awal: 0,
	saldo_akhir: 700,
	selisih: 0,
	...x
});

describe('ringkasRentang', () => {
	it('menjumlah hari; saldo akhir dari hari terakhir', () => {
		const r = ringkasRentang([hari({}), hari({ tanggal: '2026-10-09', setoran: 500, selisih: -100, saldo_akhir: 1200, belanja_bahan: 77 })]);
		expect(r).toMatchObject({ total: 6000, pengeluaranLaci: 600, setoran: 500, selisih: -100, saldoAkhir: 1200, belanjaBahan: 77 });
		expect(r.perMetode).toMatchObject({ cash: 2000, qris: 4000 });
		expect(ringkasRentang([]).saldoAkhir).toBe(0);
	});
});

describe('tanggal WIB', () => {
	it('mundur/maju hari melewati bulan; awal hari WIB', () => {
		expect(mundurHari('2026-10-01', 1)).toBe('2026-09-30');
		expect(mundurHari('2026-10-31', -1)).toBe('2026-11-01');
		expect(awalHariWib('2026-10-08')).toBe('2026-10-08T00:00:00+07:00');
	});
});
