import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KELOMPOK_JENIS, pesanTelegram, teksPolos } from './api';

const dir = join(import.meta.dirname, '../../../supabase/migrations');
const sql = readFileSync(join(dir, '20261012000028_fungsi_telegram_admin.sql'), 'utf8');
const resmi = [...sql.matchAll(/raise exception '([^'%]+)' using errcode = '(\d+)'/g)].map((m) => ({ message: m[1], code: m[2] }));

describe('Telegram admin', () => {
	it('semua pesan resmi migrasi diteruskan apa adanya', () => {
		expect(resmi.length).toBe(4);
		for (const e of resmi) expect(pesanTelegram(e)).toBe(`${e.message}.`);
		expect(pesanTelegram({ code: '22023', message: 'invalid input syntax' })).toBe('Isian tidak sah.');
	});

	it('jenis pesan di layar sama dengan yang diterima simpan_telegram', () => {
		const daftar = sql.match(/v_mati <@ array\[([^\]]+)\]/)![1].match(/'(\w+)'/g)!.map((x) => x.slice(1, -1));
		expect(KELOMPOK_JENIS.flatMap((k) => k.jenis.map((j) => j.kunci)).sort()).toEqual(daftar.sort());
	});

	it('teksPolos: tag dibuang, entitas dikembalikan', () => {
		expect(teksPolos('⚠️ <b>Batal</b> · a &lt;b&gt; &amp; c')).toBe('⚠️ Batal · a <b> & c');
	});
});
