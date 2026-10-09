import { describe, expect, it } from 'vitest';
import { lembarKas, lembarLabaRugi } from './laporan';

const metode = { cash: { jumlah: 2, total: 4321 }, qris: { jumlah: 1, total: 1000 }, gofood: { jumlah: 0, total: 0 }, grabfood: { jumlah: 0, total: 0 }, shopeefood: { jumlah: 0, total: 0 } };

describe('lembar laporan', () => {
	it('laba-rugi: pos per baris, outlet per kolom, biaya minus', () => {
		const r = { dari: 'a', sampai: 'b', omzet: 5321, per_metode: metode, belanja_bahan: 100, belanja_bahan_masuk: 100, belanja_bahan_lain: 0, gaji: 50, sewa: 10, pengeluaran_lain: [{ kategori: 'Gas', jumlah: 20 }], pengeluaran_lain_total: 20, laba: 5141, arus_keluar: [], setoran_diterima: 0, selisih_setoran: 0 };
		const l = lembarLabaRugi([{ judul: 'Bukit Lama', r }]);
		expect(l.kolom).toEqual(['Pos', 'Bukit Lama']);
		expect(l.baris).toContainEqual(['Omzet', 5321]);
		expect(l.baris).toContainEqual(['Pengeluaran: Gas', -20]);
		expect(l.baris).toContainEqual(['Laba', 5141]);
	});
	it('kas harian per tanggal', () => {
		const h = { tanggal: '2026-10-09', per_metode: metode, total: 5321, jumlah_batal: 1, pengeluaran_laci: [{ kategori: 'Gas', jumlah: 20 }], pengeluaran_luar: [], belanja_bahan: 0, setoran: 0, saldo_awal: 100, saldo_akhir: 4401, selisih: 0 };
		const l = lembarKas([{ outlet: { nama: 'BL' }, hari: [h] }]);
		expect(l.baris[0].slice(0, 3)).toEqual(['BL', '2026-10-09', 4321]);
		expect(l.baris[0].at(-2)).toBe(4401);
	});
});
