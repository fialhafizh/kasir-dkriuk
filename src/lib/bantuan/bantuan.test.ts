import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Petunjuk from '#lib/components/bantuan/Petunjuk.svelte';
import { buatInfografis } from './infografis';
import { BAGIAN, bagianUntuk, cariTopik, cocok, SEMUA_TOPIK, tebal } from './isi';

const AKAR = join(import.meta.dirname, '../../..');

describe('isi bantuan', () => {
	it('id topik unik & setiap topik punya ringkasan', () => {
		const id = SEMUA_TOPIK.map((t) => t.id);
		expect(new Set(id).size).toBe(id.length);
		for (const t of SEMUA_TOPIK) expect(t.ringkas.length).toBeGreaterThan(10);
	});
	it('petunjuk "?" di layar memakai topik yang ada', () => {
		const pakai = ['jualan', 'tutup-toko', 'kas-kasir', 'stok-kasir', 'dasbor', 'analisis', 'belanja', 'gaji', 'telegram'];
		for (const id of pakai) expect(cariTopik(id), id).toBeDefined();
	});
	it('kasir hanya melihat bagian umum & kasir', () => {
		expect(bagianUntuk('kasir').map((b) => b.id)).toEqual(['umum', 'kasir']);
		expect(bagianUntuk('admin')).toHaveLength(BAGIAN.length);
	});
	it('cari & tebal', () => {
		expect(cocok(cariTopik('kas-kasir')!, 'SETORAN')).toBe(true);
		expect(cocok(cariTopik('jualan')!, 'gajian')).toBe(false);
		expect(tebal('**Bayar** <b>')).toBe('<b>Bayar</b> &lt;b&gt;');
	});
	it('tidak memuat angka rupiah atau rahasia', () => {
		const semua = JSON.stringify(BAGIAN);
		expect(semua).not.toMatch(/Rp\s?\d/);
		expect(semua).not.toMatch(/sb_secret|service_role|TOKEN|eyJ/);
	});
	it('petunjuk "?" tampil dengan judul topik', () => {
		expect(render(Petunjuk, { props: { topik: 'tutup-toko' } }).body).toContain('Petunjuk: Tutup toko');
		expect(render(Petunjuk, { props: { topik: 'tidak-ada' } }).body).not.toContain('Petunjuk');
	});
});

describe('infografis', () => {
	it('static/panduan.html sama dengan isi terbaru (jalankan "npm run panduan" bila gagal)', () => {
		expect(readFileSync(join(AKAR, 'static/panduan.html'), 'utf8')).toBe(buatInfografis());
	});
	it('memuat semua topik, tanpa skrip/gaya dari luar', () => {
		const h = buatInfografis();
		for (const t of SEMUA_TOPIK) expect(h).toContain(`id="t-${t.id}"`);
		expect(h).not.toMatch(/<script[^>]+src=|<link[^>]+stylesheet/);
	});
});
