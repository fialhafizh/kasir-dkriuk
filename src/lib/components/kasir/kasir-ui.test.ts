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

import RingkasanShift from './RingkasanShift.svelte';

describe('RingkasanShift', () => {
	const r = {
		shift_id: 's',
		outlet_id: 'o',
		modal: 100000,
		dibuka_at: '2026-10-05T01:00:00Z',
		ditutup_at: '2026-10-05T14:00:00Z',
		jumlah_transaksi: 2,
		jumlah_void: 1,
		total: 21000,
		per_metode: {
			cash: { jumlah: 1, total: 11000 },
			qris: { jumlah: 1, total: 10000 },
			gofood: { jumlah: 0, total: 0 },
			grabfood: { jumlah: 0, total: 0 },
			shopeefood: { jumlah: 0, total: 0 }
		},
		cash_seharusnya: 111000,
		uang_fisik: 110000,
		selisih: -1000
	};
	it('menampilkan per metode, cash seharusnya, dan selisih kurang', () => {
		const { body } = render(RingkasanShift, { props: { r } });
		expect(body).toContain('ShopeeFood (0)');
		expect(body).toContain('Rp111.000');
		expect(body).toContain('Kurang Rp1.000');
		expect(body).toContain('(+1 batal)');
	});
	it('selisih nol tertulis Pas; shift belum ditutup tanpa baris selisih', () => {
		expect(render(RingkasanShift, { props: { r: { ...r, uang_fisik: 111000, selisih: 0 } } }).body).toContain('Pas');
		expect(render(RingkasanShift, { props: { r: { ...r, uang_fisik: null, selisih: null } } }).body).not.toContain('Selisih');
	});
});
