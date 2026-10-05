import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pesanStok } from './pesan';

const MIGRASI = [
	'20261006000011_fungsi_stok.sql',
	'20261007000014_fungsi_rusak.sql',
	'20261007000015_fungsi_transfer.sql',
	'20261007000016_fungsi_opname.sql',
	'20261007000017_perbaikan_3b.sql'
];
const resmi = MIGRASI.flatMap((f) => {
	const sql = readFileSync(join(import.meta.dirname, '../../../supabase/migrations', f), 'utf8');
	return [...sql.matchAll(/raise exception '([^'%]+)' using errcode = '(\d+)'/g)].map((m) => ({ f, message: m[1], code: m[2] }));
});

describe('pesanStok', () => {
	it('semua pesan resmi fungsi stok diteruskan apa adanya, berakhiran titik', () => {
		expect(resmi.length).toBeGreaterThanOrEqual(45);
		for (const e of resmi) expect(pesanStok(e), `${e.f}: ${e.message}`).toBe(`${e.message}.`);
	});
	it('pesan transfer berisi nama outlet (format %) juga diteruskan', () => {
		const m = 'Ada perbedaan jumlah. Silakan hubungi outlet pengirim (Bukit Lama)';
		expect(pesanStok({ code: '22023', message: m })).toBe(`${m}.`);
	});
	it('pesan akses outlet dari 0009 juga diteruskan', () => {
		expect(pesanStok({ code: '42501', message: 'Anda tidak berhak mengakses outlet ini' })).toBe('Anda tidak berhak mengakses outlet ini.');
	});
	it('pesan Postgres mentah tidak diteruskan', () => {
		expect(pesanStok({ code: '22023', message: 'cannot extract elements from a scalar' })).toBe('Isian tidak sah.');
		expect(pesanStok(null)).toBeNull();
	});
});
