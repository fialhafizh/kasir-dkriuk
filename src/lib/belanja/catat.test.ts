import { describe, expect, it } from 'vitest';
import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
import { barisCatat, dariRencana, hitungJumlah, kunci, susunKiriman, type Draf } from './catat.ts';
import type { Rencana } from './belanja.ts';

const satuan = (id: string, harga_tetap = true, urutan = 1): SatuanBeli => ({ id, kode: id, nama: `Pack ${id}`, ambang: null, harga_tetap, urutan, aktif: true });
const S = [satuan('ori', false, 1), satuan('saus', true, 2), satuan('saus25', true, 3)];
const pemakai = [
	{ satuan_beli_id: 'saus', outlet_id: 'BL' },
	{ satuan_beli_id: 'saus25', outlet_id: 'KP' }
];
const O = ['BL', 'KP'];
const harga: HargaBeli[] = [
	{ outlet_id: 'BL', satuan_beli_id: 'saus', harga: 4321, diubah_at: '' },
	{ outlet_id: 'KP', satuan_beli_id: 'saus25', harga: 1234, diubah_at: '' },
	{ outlet_id: 'KP', satuan_beli_id: 'ori', harga: 43210, diubah_at: '' }
];

describe('catat belanja riil (tabel barang × outlet)', () => {
	it('sel outlet yang tidak memakai satuan itu dikunci', () => {
		expect(barisCatat(S, pemakai, O).map((x) => [x.s.id, x.outlet])).toEqual([
			['ori', ['BL', 'KP']],
			['saus', ['BL']],
			['saus25', ['KP']]
		]);
	});

	it('contoh owner: 10 pack ayam Ori untuk Kertapati → satu barang masuk Kertapati; harga tetap diisi harga acuan', () => {
		const draf: Draf = { [kunci('ori', 'KP')]: { qty: '10', harga: '43.210' }, [kunci('saus25', 'KP')]: { qty: '2', harga: '1.234' } };
		const k = susunKiriman(draf, S, pemakai, O, harga, '2026-10-13', (o) => `id-${o}`);
		expect(k).toEqual([
			{
				outlet_id: 'KP',
				kirim: { id: 'id-KP', outlet_id: 'KP', tanggal: '2026-10-13', item: [{ satuan_beli_id: 'ori', qty: 10, harga: 43210 }, { satuan_beli_id: 'saus25', qty: 2, harga: 1234 }] },
				galat: []
			}
		]);
		const j = hitungJumlah(draf, S, pemakai, O, harga);
		expect(j.perOutlet).toEqual({ BL: 0, KP: 432100 + 2468 });
		expect(j.perBaris.ori).toEqual({ qty: 10, rupiah: 432100 });
	});

	it('harga berubah-ubah kosong ditolak per barang; jumlah 0 / kosong dilewati', () => {
		const draf: Draf = { [kunci('ori', 'BL')]: { qty: '3', harga: '' }, [kunci('saus', 'BL')]: { qty: '0', harga: '4.321' } };
		const [bl] = susunKiriman(draf, S, pemakai, O, harga, '2026-10-13', () => 'x');
		expect(bl.kirim).toBeNull();
		expect(bl.galat).toEqual([{ nama: 'Pack ori', pesan: 'Harga wajib diisi (harganya berubah-ubah).' }]);
	});

	it('isi dari rencana: isian admin dulu, lalu saran', () => {
		const r: Rencana = {
			hari: 7,
			outlet: [{ id: 'BL', nama: 'Bukit Lama', kode: 'BL' }, { id: 'KP', nama: 'Kertapati', kode: 'KP' }],
			barang: [{ satuan_beli_id: 'ori', nama: 'Pack ori', per_outlet: { BL: { stok: 1, pakai_hari: 1, dari_beli: false, harga: null, saran: 7 }, KP: { stok: 1, pakai_hari: 1, dari_beli: false, harga: null, saran: 0 } } }]
		};
		expect(dariRencana(r, { [kunci('ori', 'KP')]: 4 })).toEqual({ [kunci('ori', 'BL')]: 7, [kunci('ori', 'KP')]: 4 });
	});

	it("urutan owner: kebutuhan D'Kriuk dulu, lalu Tepung A, lalu pack khusus Kertapati, lalu sisanya", () => {
		const kode = ['minyak_liter', 'pack_kemasan_besar_50', 'karung_tepung_a', 'pack_saus_sambal', 'pack_ayam_hot', 'pack_plastik_merah', 'pack_ayam_ori', 'beras_kg'];
		const acak = kode.map((k, i) => satuan(k, true, k === 'beras_kg' ? 30 : 70 + i));
		const hasil = barisCatat(acak, [], ['BL']).map((x) => x.s.kode);
		expect(hasil).toEqual(['pack_ayam_ori', 'pack_ayam_hot', 'pack_saus_sambal', 'pack_plastik_merah', 'karung_tepung_a', 'pack_kemasan_besar_50', 'beras_kg', 'minyak_liter']);
	});
});
