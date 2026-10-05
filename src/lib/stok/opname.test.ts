import { describe, expect, it } from 'vitest';
import type { IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import { awalMingguWib, isiPerBahan, perluOpname, selisihBesar } from './opname';

describe('selisihBesar', () => {
	it('≥ 1 pack-setara atau ≥ 10% dari angka sistem', () => {
		expect(selisihBesar(97, 100, 100)).toBe(false);
		expect(selisihBesar(0, 100, 100)).toBe(true);
		expect(selisihBesar(8, 10, 100)).toBe(true);
		expect(selisihBesar(9.5, 10)).toBe(false);
		expect(selisihBesar(1, 0)).toBe(true);
		expect(selisihBesar(0, 0)).toBe(false);
	});
});

describe('isiPerBahan', () => {
	it('isi terkecil dari satuan beli aktif yang memuat bahan', () => {
		const s = (id: string): SatuanBeli => ({ id, kode: id, nama: id, ambang: null, harga_tetap: true, urutan: 0, aktif: true });
		const isi: IsiSatuanBeli[] = [
			{ satuan_beli_id: 'ori', bahan_id: 'dada', qty: 3 },
			{ satuan_beli_id: 'pack', bahan_id: 'tepung', qty: 1.3 },
			{ satuan_beli_id: 'karung', bahan_id: 'tepung', qty: 19.5 }
		];
		expect(isiPerBahan([s('ori'), s('pack'), s('karung')], isi)).toEqual(new Map([['dada', 3], ['tepung', 1.3]]));
	});
});

describe('pengingat opname mingguan (WIB)', () => {
	// 2026-10-04 adalah hari Minggu.
	const minggu = new Date('2026-10-04T05:00:00Z');
	const senin = new Date('2026-10-05T05:00:00Z');
	it('awal minggu = Minggu 00:00 WIB', () => {
		expect(awalMingguWib(senin).toISOString()).toBe('2026-10-03T17:00:00.000Z');
	});
	it('tanpa stok awal → tidak perlu', () => {
		expect(perluOpname(minggu, null, [])).toBe(false);
	});
	it('belum ada opname minggu ini → perlu, termasuk Senin bila Minggu terlewat', () => {
		expect(perluOpname(minggu, '2026-09-01T00:00:00Z', [])).toBe(true);
		expect(perluOpname(senin, '2026-09-01T00:00:00Z', [{ status: 'disetujui', dihitung_at: '2026-09-27T10:00:00Z' }])).toBe(true);
	});
	it('sudah dikirim/disetujui minggu ini → tidak perlu; yang ditolak tidak dihitung', () => {
		expect(perluOpname(senin, '2026-09-01T00:00:00Z', [{ status: 'diajukan', dihitung_at: '2026-10-04T12:00:00Z' }])).toBe(false);
		expect(perluOpname(senin, '2026-09-01T00:00:00Z', [{ status: 'ditolak', dihitung_at: '2026-10-04T12:00:00Z' }])).toBe(true);
	});
});

describe('review Tugas 5–7: pengingat', () => {
	const senin = new Date('2026-10-05T05:00:00Z');
	it('stok awal dihitung minggu ini → belum perlu opname', () => {
		expect(perluOpname(senin, '2026-10-04T03:00:00Z', [])).toBe(false);
	});
	it('masih ada opname menunggu (dari minggu lalu) → tidak mengingatkan', () => {
		expect(perluOpname(senin, '2026-09-01T00:00:00Z', [{ status: 'diajukan', dihitung_at: '2026-09-27T10:00:00Z' }])).toBe(false);
	});
});
