import { describe, expect, it } from 'vitest';
import type { RekapGaji } from './gaji';
import { lembarGaji, ringkasGaji, teksGaji } from './ringkasan-gaji';

const rekap: RekapGaji[] = [
	{ karyawan_id: 'a', nama: 'Nanda', aktif: true, upah_harian: 5432, hari_masuk: 31, sisa_kasbon: 0, gaji: null },
	{ karyawan_id: 'b', nama: 'Rahma', aktif: true, upah_harian: 4321, hari_masuk: 31, sisa_kasbon: 10000, gaji: null },
	{
		karyawan_id: 'c',
		nama: 'Dira',
		aktif: true,
		upah_harian: 4321,
		hari_masuk: 30,
		sisa_kasbon: 0,
		gaji: { id: 'g', hari_masuk: 30, upah_harian: 4321, penyesuaian: 500, keterangan: 'bonus', potongan_kasbon: 2000, dibayar: 30 * 4321 + 500 - 2000, dibayar_at: '2026-11-01' }
	},
	{ karyawan_id: 'd', nama: 'Lama', aktif: false, upah_harian: 4000, hari_masuk: 0, sisa_kasbon: 0, gaji: null }
];

describe('ringkasan gaji', () => {
	const b = ringkasGaji([{ outlet: 'Bukit Lama', rekap }]);
	it('belum dibayar: kasbon = sisa sebatas gaji; dibayar: angka pembayaran; nonaktif tanpa hari dilewati', () => {
		expect(b.map((x) => [x.nama, x.kotor, x.kasbon, x.total, x.dibayar])).toEqual([
			['Nanda', 31 * 5432, 0, 31 * 5432, false],
			['Rahma', 31 * 4321, 10000, 31 * 4321 - 10000, false],
			['Dira', 30 * 4321, 2000, 30 * 4321 + 500 - 2000, true]
		]);
	});
	it('teks WA & lembar Excel dengan jumlah', () => {
		const t = teksGaji('2026-10', b, false);
		expect(t.split('\n')[0]).toBe('Gaji Oktober 2026');
		expect(t).toContain(`Rahma: 31 hr × Rp4.321 = Rp${(31 * 4321).toLocaleString('id-ID')} − kasbon Rp10.000 → Rp${(31 * 4321 - 10000).toLocaleString('id-ID')} (belum dibayar)`);
		expect(t).toContain('Dira: 30 hr × Rp4.321 = Rp129.630 + Rp500 − kasbon Rp2.000 → Rp128.130');
		const l = lembarGaji('2026-10', b);
		expect(l.baris.at(-1)?.[7]).toBe(b.reduce((s, x) => s + x.total, 0));
	});
});
