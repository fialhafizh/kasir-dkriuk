// Nilai yang bisa dipilih untuk saringan panel, per kolom pengelompokan.
import { muatKategori } from '#lib/kas/api.ts';
import { muatBahan, muatMenu, muatOutlets, muatSatuanBeli } from '#lib/master/api.ts';
import { supabase } from '#lib/supabase/client.ts';

export interface Pilihan {
	nilai: string;
	label: string;
}

const TETAP: Record<string, Pilihan[]> = {
	kanal: [
		{ nilai: 'cash', label: 'Tunai' },
		{ nilai: 'qris', label: 'QRIS' },
		{ nilai: 'gofood', label: 'GoFood' },
		{ nilai: 'grabfood', label: 'GrabFood' },
		{ nilai: 'shopeefood', label: 'ShopeeFood' }
	],
	varian: [
		{ nilai: 'ori', label: 'Ori' },
		{ nilai: 'hot', label: 'Hot' },
		{ nilai: '-', label: 'Tanpa varian' }
	],
	alasan: [
		{ nilai: 'sisa_tidak_laku', label: 'Sisa tidak laku' },
		{ nilai: 'dimakan_karyawan', label: 'Dimakan/dibawa karyawan' },
		{ nilai: 'gosong', label: 'Gosong' },
		{ nilai: 'basi', label: 'Basi' },
		{ nilai: 'jatuh_rusak', label: 'Jatuh/rusak' },
		{ nilai: 'lainnya', label: 'Lainnya' }
	],
	sumber: [
		{ nilai: 'laci', label: 'Laci' },
		{ nilai: 'luar', label: 'Luar laci' }
	],
	hari: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((h, i) => ({ nilai: String(i + 1), label: h })),
	jam: Array.from({ length: 24 }, (_, i) => ({ nilai: String(i).padStart(2, '0'), label: `${String(i).padStart(2, '0')}.00` }))
};
const KATEGORI_MENU: Pilihan[] = [
	{ nilai: 'ayam', label: 'Ayam' },
	{ nilai: 'kulit', label: 'Kulit' },
	{ nilai: 'nasi', label: 'Nasi' },
	{ nilai: 'box', label: 'Box' },
	{ nilai: 'pelengkap', label: 'Pelengkap' }
];

export async function pilihanSaringan(sumber: string, kolom: string): Promise<Pilihan[]> {
	if (TETAP[kolom]) return TETAP[kolom];
	switch (kolom) {
		case 'outlet':
			return (await muatOutlets()).map((o) => ({ nilai: o.id, label: o.nama }));
		case 'menu':
			return (await muatMenu()).map((m) => ({ nilai: m.id, label: m.nama }));
		case 'bahan':
			return (await muatBahan()).filter((b) => b.aktif).map((b) => ({ nilai: b.id, label: `${b.nama} (${b.satuan})` }));
		case 'barang':
			return (await muatSatuanBeli()).map((s) => ({ nilai: s.id, label: s.nama }));
		case 'kategori':
			return sumber === 'pengeluaran' ? (await muatKategori()).map((k) => ({ nilai: k.id, label: k.nama })) : KATEGORI_MENU;
		case 'kasir': {
			const { data } = await supabase.from('profiles').select('id, nama_tampilan').order('nama_tampilan');
			return (data ?? []).map((p) => ({ nilai: p.id as string, label: p.nama_tampilan as string }));
		}
		default:
			return [];
	}
}
