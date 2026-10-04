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

import FormStokAwal from './FormStokAwal.svelte';

describe('FormStokAwal', () => {
	it('kotak pack + lepas untuk bahan berpack, satu kotak untuk ayam; terisi dari jumlah awal', () => {
		const { body } = render(FormStokAwal, {
			props: {
				isian: [
					{ bahan_id: 'd', label: 'Dada Ori', jenis: 'satu' as const, satuan: 'potong', desimal: false },
					{ bahan_id: 'k', label: 'Kemasan Kecil', jenis: 'pack' as const, satuan: 'pcs', isi: 100 }
				],
				awal: new Map([['k', 340]]),
				labelKirim: 'Kirim ke admin',
				onkirim: async () => {}
			}
		});
		expect(body).toMatch(/aria-label="Dada Ori \(potong\)"/);
		expect(body).toMatch(/aria-label="Kemasan Kecil: jumlah pack utuh"[^>]*value="3"|value="3"[^>]*aria-label="Kemasan Kecil: jumlah pack utuh"/);
		expect(body).toMatch(/aria-label="Kemasan Kecil: pcs lepas"[^>]*value="40"|value="40"[^>]*aria-label="Kemasan Kecil: pcs lepas"/);
		expect(body).toContain('Kirim ke admin');
	});
});
