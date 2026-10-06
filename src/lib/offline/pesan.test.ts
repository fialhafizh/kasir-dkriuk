import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pesanSinkron } from './pesan';

const sql = ['20261008000019_fungsi_offline.sql', '20261009000021_fungsi_offline_4b.sql']
	.map((f) => readFileSync(join(import.meta.dirname, '../../../supabase/migrations', f), 'utf8'))
	.join('\n');
const resmi = [...sql.matchAll(/raise exception '([^'%]+)' using errcode = '(\d+)'/g)].map((m) => ({ message: m[1], code: m[2] }));

describe('pesanSinkron', () => {
	it('pesan resmi fungsi offline diteruskan apa adanya', () => {
		expect(resmi.length).toBeGreaterThanOrEqual(15);
		for (const e of resmi) expect(pesanSinkron(e)).toBe(`${e.message}.`);
	});
	it('pesan stok & kasir lama juga diteruskan; pesan mentah tidak', () => {
		expect(pesanSinkron({ code: '22023', message: 'Transfer sudah dibatalkan oleh pengirim' })).toBe('Transfer sudah dibatalkan oleh pengirim.');
		expect(pesanSinkron({ code: '22023', message: 'cannot extract elements from a scalar' })).toBe('Isian tidak sah.');
	});
});
