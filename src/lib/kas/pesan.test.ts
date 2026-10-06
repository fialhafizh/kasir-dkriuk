import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pesanSinkron } from '#lib/offline/pesan.ts';
import { pesanKas } from './pesan';

const sql = ['20261010000022_kas_skema.sql', '20261010000023_fungsi_kas.sql']
	.map((f) => readFileSync(join(import.meta.dirname, '../../../supabase/migrations', f), 'utf8'))
	.join('\n');
const resmi = [...sql.matchAll(/raise exception '([^'%]+)' using errcode = '(\d+)'/g)].map((m) => ({ message: m[1], code: m[2] }));

describe('pesan kas', () => {
	it('semua pesan resmi migrasi kas diteruskan apa adanya (layar admin & sinkron kasir)', () => {
		expect(resmi.length).toBeGreaterThanOrEqual(25);
		for (const e of resmi) {
			expect(pesanKas(e)).toBe(`${e.message}.`);
			expect(pesanSinkron(e)).toBe(`${e.message}.`);
		}
	});
	it('pesan mentah tidak diteruskan', () => {
		expect(pesanKas({ code: '22023', message: 'invalid input syntax' })).toBe('Isian tidak sah.');
	});
});
