import { describe, expect, it } from 'vitest';
import { validasiResep } from './resep';

describe('validasiResep', () => {
	it('mengubah teks jumlah menjadi angka', () => {
		expect(
			validasiResep([
				{ bahan_id: 'beras', teks: '0,1' },
				{ bahan_id: 'kertas', teks: '1' }
			])
		).toEqual({ ok: true, isi: [{ bahan_id: 'beras', qty: 0.1 }, { bahan_id: 'kertas', qty: 1 }] });
	});
	it('resep kosong ditolak', () => {
		expect(validasiResep([])).toEqual({ ok: false, error: 'Resep minimal satu bahan.' });
	});
	it('jumlah tidak sah ditolak dengan contoh', () => {
		expect(validasiResep([{ bahan_id: 'beras', teks: '0' }])).toEqual({
			ok: false,
			error: 'Setiap jumlah harus angka lebih dari 0 (koma untuk desimal), mis. 0,1'
		});
		expect(validasiResep([{ bahan_id: 'beras', teks: '1.000' }]).ok).toBe(false);
	});
	it('bahan sama dua kali ditolak', () => {
		expect(
			validasiResep([
				{ bahan_id: 'beras', teks: '0,1' },
				{ bahan_id: 'beras', teks: '0,2' }
			])
		).toEqual({ ok: false, error: 'Bahan yang sama dipilih dua kali.' });
	});
});

describe('review Tugas 7: bahan yang tidak lagi boleh dipakai', () => {
	it('baris dengan bahan di luar pilihan sah ditolak dengan pesan yang menunjuk barisnya', () => {
		const sah = new Set(['beras']);
		expect(
			validasiResep(
				[
					{ bahan_id: 'beras', teks: '0,1' },
					{ bahan_id: 'tepung', teks: '1' }
				],
				sah
			)
		).toEqual({ ok: false, error: 'Baris 2: ganti bahan yang ditandai (nonaktif atau tidak dipotong otomatis).' });
	});
	it('tanpa daftar pilihan, semua bahan dianggap sah (pemeriksaan tetap di database)', () => {
		expect(validasiResep([{ bahan_id: 'tepung', teks: '1' }]).ok).toBe(true);
	});
});
