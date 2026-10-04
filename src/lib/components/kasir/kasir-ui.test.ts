import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import KasirNav from './KasirNav.svelte';

describe('KasirNav', () => {
	it('tiga tujuan kasir dengan halaman aktif ditandai', () => {
		const { body } = render(KasirNav, { props: { aktif: '/kasir/riwayat' } });
		expect(body).toContain('href="#/kasir"');
		expect(body).toContain('href="#/kasir/riwayat"');
		expect(body).toContain('href="#/kasir/tutup"');
		expect(body).toMatch(/href="#\/kasir\/riwayat"[^>]*aria-current="page"/);
		expect(body).not.toMatch(/href="#\/kasir"[^>]*aria-current="page"/);
	});
});
