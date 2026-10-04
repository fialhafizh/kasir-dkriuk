import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DaftarStok from './DaftarStok.svelte';
import RiwayatGerakan from './RiwayatGerakan.svelte';

const baris = [
	{ kunci: 'a', label: 'Ayam Ori', teks: '5 pack + 3 Sayap Ori', status: 'menipis' as const, bahan_id: ['d'] },
	{ kunci: 'k', label: 'Kemasan Kecil', teks: '-3 pcs', status: 'minus' as const, bahan_id: ['k'] },
	{ kunci: 'b', label: 'Beras', teks: '12,5 kg', status: 'aman' as const, bahan_id: ['b'] }
];

describe('DaftarStok', () => {
	it('menampilkan label, angka, dan tanda status', () => {
		const { body } = render(DaftarStok, { props: { baris } });
		expect(body).toContain('5 pack + 3 Sayap Ori');
		expect(body).toContain('Menipis');
		expect(body).toContain('Minus');
		expect(body).toContain('Aman');
	});
	it('tanpaStatus menyembunyikan tanda (stok awal belum disetujui)', () => {
		const { body } = render(DaftarStok, { props: { baris, tanpaStatus: true } });
		expect(body).not.toContain('Menipis');
		expect(body).not.toContain('Minus');
	});
	it('bisa dipilih bila ada onpilih (tombol dengan aria-pressed)', () => {
		const { body } = render(DaftarStok, { props: { baris, dipilih: 'a', onpilih: () => {} } });
		expect(body).toMatch(/<button[^>]*aria-pressed="true"/);
	});
});

describe('RiwayatGerakan', () => {
	it('jenis, nomor transaksi, jumlah bertanda, nama bahan', () => {
		const { body } = render(RiwayatGerakan, {
			props: {
				gerakan: [
					{ id: 2, bahan_id: 'd', qty: -2, jenis: 'jual' as const, waktu: '2026-10-06T05:00:00Z', nomor: 'BL-261006-001' },
					{ id: 1, bahan_id: 'd', qty: 15, jenis: 'masuk' as const, waktu: '2026-10-06T01:00:00Z', nomor: null }
				],
				namaBahan: new Map([['d', 'Dada Ori']])
			}
		});
		expect(body).toContain('Terjual');
		expect(body).toContain('BL-261006-001');
		expect(body).toContain('-2 Dada Ori');
		expect(body).toContain('+15 Dada Ori');
		expect(body).toContain('Barang masuk');
	});
	it('kosong → keterangan', () => {
		const { body } = render(RiwayatGerakan, { props: { gerakan: [], namaBahan: new Map() } });
		expect(body).toContain('Belum ada gerakan stok');
	});
});
