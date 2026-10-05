import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pesanStok } from './pesan';

const sql = readFileSync(join(import.meta.dirname, '../../../supabase/migrations/20261006000011_fungsi_stok.sql'), 'utf8');
const resmi = [...sql.matchAll(/raise exception '([^']+)' using errcode = '(\d+)'/g)].map((m) => ({ message: m[1], code: m[2] }));

describe('pesanStok', () => {
	it('semua pesan resmi fungsi stok (0011) diteruskan apa adanya, berakhiran titik', () => {
		expect(resmi.length).toBeGreaterThanOrEqual(18);
		for (const e of resmi) expect(pesanStok(e)).toBe(`${e.message}.`);
	});
	it('pesan akses outlet dari 0009 juga diteruskan', () => {
		expect(pesanStok({ code: '42501', message: 'Anda tidak berhak mengakses outlet ini' })).toBe('Anda tidak berhak mengakses outlet ini.');
	});
	it('pesan Postgres mentah tidak diteruskan', () => {
		expect(pesanStok({ code: '22023', message: 'cannot extract elements from a scalar' })).toBe('Isian tidak sah.');
		expect(pesanStok(null)).toBeNull();
	});
});
