import { describe, expect, it } from 'vitest';
import { rencanaHargaBeli } from '../../scripts/lib/harga-beli';

const outlets = [
	{ id: 'o-bl', kode: 'BL' },
	{ id: 'o-tk', kode: 'TK' }
];
const satuan = [
	{ id: 's-ori', kode: 'pack_ayam_ori' },
	{ id: 's-cup', kode: 'pack_cup_kulit' }
];

describe('rencanaHargaBeli', () => {
	it('mengubah kode menjadi baris id', () => {
		const r = rencanaHargaBeli({ BL: { pack_ayam_ori: 49000 }, TK: { pack_cup_kulit: 33300 } }, outlets, satuan);
		expect(r.error).toEqual([]);
		expect(r.baris).toEqual([
			{ outlet_id: 'o-bl', satuan_beli_id: 's-ori', harga: 49000 },
			{ outlet_id: 'o-tk', satuan_beli_id: 's-cup', harga: 33300 }
		]);
	});
	it('kode tak dikenal dan harga tidak sah dilaporkan, tidak disimpan', () => {
		const r = rencanaHargaBeli({ XX: { pack_ayam_ori: 1 }, BL: { pack_tak_ada: 1, pack_ayam_ori: -5, pack_cup_kulit: 1.5 } }, outlets, satuan);
		expect(r.baris).toEqual([]);
		expect(r.error).toEqual([
			'Outlet tidak dikenal: XX',
			'Satuan beli tidak dikenal: pack_tak_ada',
			'Harga tidak sah untuk BL/pack_ayam_ori: -5',
			'Harga tidak sah untuk BL/pack_cup_kulit: 1.5'
		]);
	});
});
