import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import HargaInput from './HargaInput.svelte';
import QtyInput from './QtyInput.svelte';

describe('HargaInput', () => {
	it('menampilkan nilai dengan titik ribuan dan keyboard angka', () => {
		const { body } = render(HargaInput, { props: { id: 'h', label: 'Harga BL', nilai: 11000, onsimpan: async () => {} } });
		expect(body).toContain('value="11.000"');
		expect(body).toContain('inputmode="numeric"');
		expect(body).toContain('Harga BL');
	});
	it('nilai kosong tampil kosong, bukan 0', () => {
		const { body } = render(HargaInput, { props: { id: 'h', label: 'Harga', nilai: null, onsimpan: async () => {} } });
		expect(body).toContain('value=""');
	});
});

describe('QtyInput', () => {
	it('desimal dengan koma dan satuan', () => {
		const { body } = render(QtyInput, { props: { id: 'q', label: 'Isi', nilai: 1.3, satuan: 'kg', onsimpan: async () => {} } });
		expect(body).toContain('value="1,3"');
		expect(body).toContain('inputmode="decimal"');
		expect(body).toContain('kg');
	});
});

describe('batas dari review Tugas 3', () => {
	it('HargaInput menerima batas maksimal dan menjelaskannya', () => {
		const { body } = render(HargaInput, { props: { id: 'h', label: 'Harga', nilai: 1000, maks: 10_000_000, onsimpan: async () => {} } });
		expect(body).toContain('data-maks="10000000"');
	});
	it('QtyInput menerima jumlah desimal maksimal', () => {
		const { body } = render(QtyInput, { props: { id: 'q', label: 'Ambang', nilai: 2.5, satuan: 'pack', desimal: 2, onsimpan: async () => {} } });
		expect(body).toContain('data-desimal="2"');
	});
});
