import type { SatuanBeli } from '#lib/master/types.ts';

// Urutan barang di Rencana belanja & Belanja riil (permintaan owner 13 Okt 2026): kebutuhan D'Kriuk dulu, lalu Tepung A,
// lalu pack khusus Kertapati; barang lain (beras, minyak, barang baru) di bawah menurut urutan biasa.
const URUTAN = [
	'pack_ayam_ori',
	'pack_ayam_hot',
	'pack_kulit',
	'pack_tepung_dkriuk',
	'karung_tepung_dkriuk',
	'pack_saus_sambal',
	'pack_saus_tomat',
	'pack_plastik_besar',
	'pack_plastik_kecil',
	'pack_kemasan_besar',
	'pack_kemasan_kecil',
	'pack_kertas_nasi',
	'pack_cup_kulit',
	'pack_box',
	'pack_plastik_merah',
	'karung_tepung_a',
	'pack_saus_sambal_25',
	'pack_saus_tomat_25',
	'pack_plastik_kecil_50',
	'pack_kemasan_besar_50'
];
export function urutBelanja(a: Pick<SatuanBeli, 'kode' | 'urutan'>, b: Pick<SatuanBeli, 'kode' | 'urutan'>): number {
	const i = (x: Pick<SatuanBeli, 'kode'>) => (URUTAN.includes(x.kode) ? URUTAN.indexOf(x.kode) : URUTAN.length);
	return i(a) - i(b) || a.urutan - b.urutan;
}
