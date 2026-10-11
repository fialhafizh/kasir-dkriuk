import { describe, expect, it } from 'vitest';
import type { Bahan, SatuanBeli } from '#lib/master/types.ts';
import { ATURAN_AWAL, hitungModalOutlet, type DataModal } from './hitungan-modal.ts';

const bahan = (kode: string): Bahan => ({ id: kode, kode, nama: kode, satuan: 'pcs', mode: 'otomatis', urutan: 1, aktif: true });
const satuan = (id: string): SatuanBeli => ({ id, kode: id, nama: id, ambang: null, harga_tetap: true, urutan: 1, aktif: true });

// Angka contoh fiktif (bukan harga asli).
function data(): DataModal {
	const kode = ['dada', 'sayap', 'saus_tomat', 'saus_sambal', 'kemasan_besar', 'plastik_kecil', 'tepung_dkriuk', 'tepung_a', 'minyak'];
	return {
		bahan: kode.map(bahan),
		satuan: ['pack', 'tomat', 'sambal', 'kemasan', 'plastik', 'td', 'ta', 'mi', 'tomat_kp'].map(satuan),
		isi: [
			{ satuan_beli_id: 'pack', bahan_id: 'dada', qty: 2 },
			{ satuan_beli_id: 'pack', bahan_id: 'sayap', qty: 2 },
			{ satuan_beli_id: 'tomat', bahan_id: 'saus_tomat', qty: 100 },
			{ satuan_beli_id: 'tomat_kp', bahan_id: 'saus_tomat', qty: 10 },
			{ satuan_beli_id: 'sambal', bahan_id: 'saus_sambal', qty: 100 },
			{ satuan_beli_id: 'kemasan', bahan_id: 'kemasan_besar', qty: 100 },
			{ satuan_beli_id: 'plastik', bahan_id: 'plastik_kecil', qty: 100 },
			{ satuan_beli_id: 'td', bahan_id: 'tepung_dkriuk', qty: 2 },
			{ satuan_beli_id: 'ta', bahan_id: 'tepung_a', qty: 4 },
			{ satuan_beli_id: 'mi', bahan_id: 'minyak', qty: 1 }
		],
		pemakai: [
			{ satuan_beli_id: 'tomat', outlet_id: 'BL' },
			{ satuan_beli_id: 'tomat_kp', outlet_id: 'KP' }
		],
		hargaBeli: [
			['pack', 4000],
			['tomat', 1000],
			['sambal', 2000],
			['kemasan', 3000],
			['plastik', 4000],
			['td', 4000],
			['ta', 4000],
			['mi', 1000]
		].map(([s, h]) => ({ outlet_id: 'BL', satuan_beli_id: s as string, harga: h as number, diubah_at: '' })),
		menu: [],
		resep: [
			{ menu_id: 'm_dada', bahan_id: 'dada', qty: 1 },
			{ menu_id: 'm_sayap', bahan_id: 'sayap', qty: 1 }
		],
		hargaJual: [
			{ outlet_id: 'BL', menu_id: 'm_dada', harga: 3000 },
			{ outlet_id: 'BL', menu_id: 'm_sayap', harga: 1000 }
		]
	};
}

describe('hitungan modal per potong', () => {
	it('pack dibagi sebanding harga jual + pelengkap + tepung campuran + minyak', () => {
		const h = hitungModalOutlet(data(), 'BL', { ...ATURAN_AWAL, tepungKgPerPack: 1, minyakLiterPerPack: 2 });
		// pelengkap = 10 + 20 + 30 + 40; tepung campuran = (2000 + 1000) / 2 = 1500/kg → 1500 per pack; minyak 2000 per pack
		expect(h.pelengkap.perPotong).toBe(100);
		expect(h.tepung.campuranKg).toBe(1500);
		expect(h.minyak.perPack).toBe(2000);
		const [p] = h.pack;
		// bobot: 2×3000 + 2×1000 = 8000 → dada 4000×3000/8000 = 1500, sayap 500
		expect(p.potong.map((x) => [x.nama, x.ayam, x.modal, x.untung])).toEqual([
			['dada', 1500, 1500 + 100 + 375 + 500, 3000 - 2475],
			['sayap', 500, 1475, -475]
		]);
		expect(p.modalPack).toBe(4000 + 400 + 1500 + 2000);
		expect(p.untungPack).toBe(8000 - 7900);
		expect(h.kurang).toEqual([]);
	});

	it('bagi rata, satuan khusus outlet, dan harga yang belum diisi dilaporkan', () => {
		const d = data();
		const h = hitungModalOutlet(d, 'BL', { ...ATURAN_AWAL, bagiAyam: 'rata' });
		expect(h.pack[0].potong.map((x) => x.ayam)).toEqual([1000, 1000]);
		const kp = hitungModalOutlet(d, 'KP', ATURAN_AWAL);
		expect(kp.pack).toEqual([]); // tidak ada harga pack & harga jual di KP
		expect(kp.kurang).toContain('saus_tomat');
		expect(kp.kurang).toContain('pack');
	});
});
