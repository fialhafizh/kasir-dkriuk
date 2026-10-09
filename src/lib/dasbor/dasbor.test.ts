import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pesanDasbor } from './api';
import { KATALOG } from './katalog';
import { keMatriks, keSeri, ringkas, skala, type Hasil } from './olah';
import { perubahan, rentangPembanding, rentangPeriode } from './periode';
import { letakBaru, periksaSpek, urutHp } from './spek';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
const sql = ['20261013000029_dasbor_skema.sql', '20261013000030_dasbor_agregasi.sql', '20261013000031_dasbor_khusus.sql']
	.map((f) => readFileSync(join(dir, f), 'utf8'))
	.join('\n');

describe('katalog & pesan sama dengan server', () => {
	it('katalog klien = _dasbor_katalog', () => {
		const json = sql.match(/_dasbor_katalog\(\) returns jsonb[\s\S]*?select '(\{[\s\S]*?\})'::jsonb/)![1];
		expect(JSON.parse(json)).toEqual(KATALOG);
	});
	it('semua pesan resmi diteruskan apa adanya', () => {
		const resmi = [...sql.matchAll(/raise exception '([^'%]+)' using errcode = '(\d+)'/g)].map((m) => ({ message: m[1], code: m[2] }));
		expect(resmi.length).toBeGreaterThanOrEqual(20);
		for (const e of resmi) expect(pesanDasbor(e)).toBe(`${e.message}.`);
	});
});

// 9 Okt 2026 15.00 WIB = 08.00 UTC
const SEKARANG = new Date('2026-10-09T08:00:00Z');
const iso = (d: Date) => d.toISOString();

describe('periode WIB', () => {
	it('hari ini, kemarin, 7 & 30 hari, bulan ini, bulan lalu, kustom', () => {
		expect(rentangPeriode('hari_ini', SEKARANG)).toEqual({ dari: new Date('2026-10-08T17:00:00Z'), sampai: new Date('2026-10-09T17:00:00Z') });
		expect(iso(rentangPeriode('kemarin', SEKARANG).dari)).toBe('2026-10-07T17:00:00.000Z');
		expect(iso(rentangPeriode('7_hari', SEKARANG).dari)).toBe('2026-10-02T17:00:00.000Z');
		expect(iso(rentangPeriode('30_hari', SEKARANG).dari)).toBe('2026-09-09T17:00:00.000Z');
		expect(rentangPeriode('bulan_lalu', SEKARANG)).toEqual({ dari: new Date('2026-08-31T17:00:00Z'), sampai: new Date('2026-09-30T17:00:00Z') });
		expect(rentangPeriode('kustom', SEKARANG, { dari: '2026-01-01', sampai: '2026-01-31' })).toEqual({
			dari: new Date('2025-12-31T17:00:00Z'),
			sampai: new Date('2026-01-31T17:00:00Z')
		});
	});
	it('23.30 WIB masih hari yang sama', () => {
		const malam = new Date('2026-10-09T16:30:00Z');
		expect(iso(rentangPeriode('hari_ini', malam).dari)).toBe('2026-10-08T17:00:00.000Z');
	});
	it('pembanding: panjang sama sebelumnya; bulan ini ↔ tanggal yang sama bulan lalu', () => {
		const h = rentangPeriode('hari_ini', SEKARANG);
		expect(rentangPembanding('hari_ini', h)).toEqual({ dari: new Date('2026-10-07T17:00:00Z'), sampai: h.dari });
		const b = rentangPeriode('bulan_ini', SEKARANG); // 1–9 Okt
		expect(rentangPembanding('bulan_ini', b)).toEqual({ dari: new Date('2026-08-31T17:00:00Z'), sampai: new Date('2026-09-09T17:00:00Z') });
		const bl = rentangPeriode('bulan_lalu', SEKARANG); // Sep
		expect(rentangPembanding('bulan_lalu', bl)).toEqual({ dari: new Date('2026-07-31T17:00:00Z'), sampai: new Date('2026-08-31T17:00:00Z') });
	});
	it('perubahan persen', () => {
		expect(perubahan(112, 100)).toBe(12);
		expect(perubahan(50, 0)).toBeNull();
		expect(perubahan(-50, -100)).toBe(50);
	});
});

describe('spek & tata letak', () => {
	it('aturan jenis tampilan', () => {
		expect(periksaSpek('angka', { sumber: 'penjualan', ukuran: ['omzet'] })).toBeNull();
		expect(periksaSpek('angka', { sumber: 'penjualan', ukuran: ['omzet'], kelompok: [{ kolom: 'outlet' }] })).toMatch(/angka/);
		expect(periksaSpek('garis', { sumber: 'penjualan', ukuran: ['omzet'], kelompok: [{ kolom: 'outlet' }] })).toMatch(/waktu/);
		expect(periksaSpek('peta_panas', { sumber: 'penjualan', ukuran: ['transaksi'], kelompok: [{ kolom: 'hari' }] })).toMatch(/2 pengelompokan/);
		expect(periksaSpek('batang', { sumber: 'item', ukuran: ['omzet'], kelompok: [{ kolom: 'menu' }] })).toMatch(/Ukuran/);
		expect(periksaSpek('batang', { sumber: 'item', ukuran: ['jumlah'], kelompok: [{ kolom: 'waktu' }] })).toMatch(/satuan waktu/);
		expect(periksaSpek('riwayat', {})).toBeNull();
	});
	it('urutan HP & letak panel baru', () => {
		expect(urutHp([{ x: 6, y: 0 }, { x: 0, y: 4 }, { x: 0, y: 0 }])).toEqual([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 4 }]);
		expect(letakBaru([{ y: 0, h: 2 }, { y: 2, h: 4 }])).toEqual({ x: 0, y: 6, w: 6, h: 4 });
	});
});

describe('olah data grafik', () => {
	const dua: Hasil = {
		kolom: [{ kolom: 'waktu', satuan: 'hari' }, { kolom: 'outlet' }],
		ukuran: ['omzet'],
		terpotong: false,
		baris: [
			{ k: ['2026-10-02 00:00', 'b'], l: ['02/10', 'TK'], n: [5] },
			{ k: ['2026-10-01 00:00', 'a'], l: ['01/10', 'BL'], n: [10] },
			{ k: ['2026-10-02 00:00', 'a'], l: ['02/10', 'BL'], n: [7] }
		]
	};
	it('dua pengelompokan → kategori kronologis, seri per kelompok kedua, kosong = 0', () => {
		expect(keSeri(dua)).toEqual({
			kategori: ['01/10', '02/10'],
			seri: [
				{ nama: 'TK', nilai: [0, 5] },
				{ nama: 'BL', nilai: [10, 7] }
			]
		});
	});
	it('satu pengelompokan → seri per ukuran', () => {
		const h: Hasil = { kolom: [{ kolom: 'kanal' }], ukuran: ['omzet', 'transaksi'], terpotong: false, baris: [{ k: ['cash'], l: ['Tunai'], n: [9, 2] }] };
		expect(keSeri(h, (u) => u.toUpperCase())).toEqual({ kategori: ['Tunai'], seri: [{ nama: 'OMZET', nilai: [9] }, { nama: 'TRANSAKSI', nilai: [2] }] });
	});
	it('peta panas: jam diisi berurutan', () => {
		const h: Hasil = {
			kolom: [{ kolom: 'hari' }, { kolom: 'jam' }],
			ukuran: ['transaksi'],
			terpotong: false,
			baris: [
				{ k: ['1', '09'], l: ['Sen', '09.00'], n: [3] },
				{ k: ['2', '11'], l: ['Sel', '11.00'], n: [5] }
			]
		};
		expect(keMatriks(h)).toEqual({ baris: ['Sen', 'Sel'], kolom: ['09.00', '10.00', '11.00'], nilai: [[3, 0, 0], [0, 0, 5]], maks: 5 });
	});
	it('skala sumbu & angka ringkas', () => {
		expect(skala(1250000)).toEqual([0, 500000, 1000000, 1500000]);
		expect(skala(0)).toEqual([0]);
		expect(ringkas(1250000)).toBe('1,25 jt');
		expect(ringkas(12500)).toBe('12,5 rb');
		expect(ringkas(950)).toBe('950');
	});
});

describe('susun ulang (penyunting HP)', () => {
	it('mengalir kiri→kanan, baris baru bila penuh, tinggi baris = panel tertinggi', async () => {
		const { susunUlang } = await import('./spek');
		expect(susunUlang([{ w: 6, h: 2 }, { w: 6, h: 4 }, { w: 8, h: 3 }, { w: 6, h: 1 }])).toEqual([
			{ w: 6, h: 2, x: 0, y: 0 },
			{ w: 6, h: 4, x: 6, y: 0 },
			{ w: 8, h: 3, x: 0, y: 4 },
			{ w: 6, h: 1, x: 0, y: 7 }
		]);
	});
});
