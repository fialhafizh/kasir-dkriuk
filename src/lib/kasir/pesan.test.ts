import { describe, expect, it } from 'vitest';
import { pesanKasir } from './pesan';

describe('pesanKasir', () => {
	it.each([
		['22023', 'Shift belum dibuka'],
		['22023', 'Uang diterima kurang dari total'],
		['22023', 'Menu tidak tersedia di outlet ini'],
		['22023', 'Jumlah item tidak sah'],
		['22023', 'Penjualan minimal satu item'],
		['22023', 'Penjualan sudah dibatalkan'],
		['22023', 'Penjualan tidak ditemukan'],
		['22023', 'Alasan pembatalan wajib diisi (3–200 karakter)'],
		['22023', 'Shift sudah ditutup'],
		['22023', 'Shift tidak ditemukan'],
		['22023', 'Jumlah uang di laci tidak sah'],
		['22023', 'Modal kembalian tidak sah'],
		['22023', 'Data penjualan tidak lengkap'],
		['42501', 'Penjualan dari shift yang sudah ditutup hanya bisa dibatalkan admin'],
		['42501', 'Anda tidak berhak mengakses outlet ini']
	])('%s "%s" diteruskan apa adanya (dengan titik)', (code, message) => {
		expect(pesanKasir({ code, message })).toBe(`${message}.`);
	});
	it('pesan Postgres lain tidak diteruskan mentah', () => {
		expect(pesanKasir({ code: '22023', message: 'cannot extract elements from a scalar' })).toBe('Isian tidak sah.');
		expect(pesanKasir({ code: '42501', message: 'permission denied for function catat_penjualan' })).toBe(
			'Anda tidak punya izin untuk perubahan ini.'
		);
	});
	it('jaringan putus', () => {
		expect(pesanKasir({ message: 'TypeError: Failed to fetch' })).toMatch(/Tidak bisa terhubung/);
	});
	it('tanpa galat → null', () => {
		expect(pesanKasir(null)).toBeNull();
	});
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('daftar pesan selalu sama dengan fungsi SQL kasir', () => {
	it('setiap raise exception di migrasi 0009 diteruskan ke kasir', () => {
		const sql = readFileSync(join(import.meta.dirname, '../../../supabase/migrations/20261005000009_fungsi_kasir.sql'), 'utf8');
		const pesan = [...sql.matchAll(/raise exception '([^']+)'/g)].map((m) => m[1]);
		expect(pesan.length).toBeGreaterThan(10);
		for (const m of pesan) expect(pesanKasir({ code: '22023', message: m }), m).toBe(`${m}.`);
	});
});
