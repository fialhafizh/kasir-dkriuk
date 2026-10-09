import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pesanAnalisis, tandaUntung } from './api';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
const sql = ['20261014000032_analisis_modal.sql', '20261014000033_analisis_lain.sql'].map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

describe('analisis', () => {
	it('pesan resmi diteruskan apa adanya', () => {
		const resmi = [...sql.matchAll(/raise exception '([^'%]+)' using errcode = '(\d+)'/g)].map((m) => ({ message: m[1], code: m[2] }));
		expect(resmi.length).toBeGreaterThanOrEqual(2);
		for (const e of resmi) expect(pesanAnalisis(e)).toBe(`${e.message}.`);
	});
	it('tanda untung', () => {
		expect(tandaUntung({ lengkap: false, untung: 100, tipis: false })).toBe('belum');
		expect(tandaUntung({ lengkap: true, untung: -5, tipis: true })).toBe('rugi');
		expect(tandaUntung({ lengkap: true, untung: 500, tipis: true })).toBe('tipis');
		expect(tandaUntung({ lengkap: true, untung: 5000, tipis: false })).toBe('sehat');
	});
});
