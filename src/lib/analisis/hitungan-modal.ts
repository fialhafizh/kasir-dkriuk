// Hitungan modal per potong ayam (perkiraan) dari Harga Beli, isi pack, dan harga jual tiap outlet:
// ayam (pack dibagi sebanding harga jual atau rata) + pelengkap + tepung campuran + minyak.
import type { Bahan, HargaBeli, IsiSatuanBeli, Menu, Resep, SatuanBeli } from '#lib/master/types.ts';
import { satuanDiOutlet, type SatuanOutlet } from '#lib/stok/per-outlet.ts';

export interface AturanModal {
	/** 'harga' = pack ayam dibagi sebanding harga jual potongan; 'rata' = sama rata. */
	bagiAyam: 'harga' | 'rata';
	/** Kode bahan pelengkap yang ikut tiap potong (masing-masing 1). */
	pelengkap: string[];
	/** Kg tepung campuran per pack ayam. */
	tepungKgPerPack: number;
	/** Bagian Tepung D'Kriuk dalam campuran (persen berat); sisanya Tepung A. */
	persenDkriuk: number;
	/** Liter minyak per pack ayam. */
	minyakLiterPerPack: number;
}

// Pelengkap tiap potong: 1 saus tomat, 1 saus sambal, 1 kemasan, 1 plastik. Tepung: 1,3 kg cukup untuk 3 pack ayam.
// Minyak: 2 liter untuk 10 pack ayam. Campuran tepung 50:50 menurut berat.
export const ATURAN_AWAL: AturanModal = {
	bagiAyam: 'harga',
	pelengkap: ['saus_tomat', 'saus_sambal', 'kemasan_besar', 'plastik_kecil'],
	tepungKgPerPack: 1.3 / 3,
	persenDkriuk: 50,
	minyakLiterPerPack: 0.2
};

export const PILIHAN_PELENGKAP = ['saus_tomat', 'saus_sambal', 'kemasan_besar', 'kemasan_kecil', 'plastik_kecil', 'plastik_besar'] as const;

export interface DataModal {
	bahan: Bahan[];
	satuan: SatuanBeli[];
	isi: IsiSatuanBeli[];
	pemakai: SatuanOutlet[];
	hargaBeli: HargaBeli[];
	menu: Menu[];
	resep: Resep[];
	hargaJual: { outlet_id: string; menu_id: string; harga: number }[];
}

export interface HargaSatuan {
	kode: string;
	nama: string;
	satuan: string;
	/** Nama satuan beli sumber harga, mis. "Pack Saus Tomat". */
	dari: string;
	hargaPack: number;
	isiPack: number;
	perSatuan: number;
}

export interface Potong {
	nama: string;
	jumlah: number;
	ayam: number;
	pelengkap: number;
	tepung: number;
	minyak: number;
	modal: number;
	jual: number;
	untung: number;
	persen: number;
}

export interface PackAyam {
	nama: string;
	hargaPack: number;
	potong: Potong[];
	jumlahPotong: number;
	modalPack: number;
	jualPack: number;
	untungPack: number;
	persenPack: number;
}

export interface HasilOutlet {
	outlet_id: string;
	harga: HargaSatuan[];
	pelengkap: { daftar: HargaSatuan[]; perPotong: number };
	tepung: { dkriukKg: number | null; aKg: number | null; campuranKg: number | null; perPack: number | null };
	minyak: { perLiter: number | null; perPack: number | null };
	pack: PackAyam[];
	/** Harga yang belum diisi di Harga Beli (hitungan tidak lengkap). */
	kurang: string[];
}

const bulat = (n: number) => Math.round(n * 100) / 100;

/** Harga per satuan dasar tiap bahan tunggal di outlet (satuan beli termurah per satuan yang punya harga). */
function hargaBahan(d: DataModal, outletId: string): Map<string, HargaSatuan> {
	const bahan = new Map(d.bahan.map((b) => [b.id, b]));
	const hasil = new Map<string, HargaSatuan>();
	for (const s of d.satuan) {
		if (!s.aktif || !satuanDiOutlet(s.id, outletId, d.pemakai)) continue;
		const isi = d.isi.filter((i) => i.satuan_beli_id === s.id);
		const h = d.hargaBeli.find((x) => x.outlet_id === outletId && x.satuan_beli_id === s.id)?.harga;
		if (isi.length !== 1 || h == null || isi[0].qty <= 0) continue;
		const b = bahan.get(isi[0].bahan_id);
		if (!b) continue;
		const per = h / isi[0].qty;
		const lama = hasil.get(b.kode);
		if (!lama || per < lama.perSatuan) {
			hasil.set(b.kode, { kode: b.kode, nama: b.nama, satuan: b.satuan, dari: s.nama, hargaPack: h, isiPack: isi[0].qty, perSatuan: per });
		}
	}
	return hasil;
}

export function hitungModalOutlet(d: DataModal, outletId: string, aturan: AturanModal): HasilOutlet {
	const harga = hargaBahan(d, outletId);
	const kurang: string[] = [];
	const ambil = (kode: string, label: string) => {
		const h = harga.get(kode);
		if (!h) kurang.push(label);
		return h ?? null;
	};

	const daftarPelengkap = aturan.pelengkap.map((k) => ambil(k, d.bahan.find((b) => b.kode === k)?.nama ?? k)).filter((x): x is HargaSatuan => !!x);
	const pelengkapPerPotong = daftarPelengkap.reduce((t, x) => t + x.perSatuan, 0);

	const tD = ambil('tepung_dkriuk', "Tepung D'Kriuk");
	const tA = aturan.persenDkriuk < 100 ? ambil('tepung_a', 'Tepung A') : null;
	const p = aturan.persenDkriuk / 100;
	const campuranKg = tD && (tA || p === 1) ? p * tD.perSatuan + (1 - p) * (tA?.perSatuan ?? 0) : null;
	const tepungPerPack = campuranKg === null ? null : campuranKg * aturan.tepungKgPerPack;
	const mi = ambil('minyak', 'Minyak Goreng');
	const minyakPerPack = mi ? mi.perSatuan * aturan.minyakLiterPerPack : null;

	// Pack ayam: satuan beli berisi banyak potongan yang dipakai outlet ini.
	const bahan = new Map(d.bahan.map((b) => [b.id, b]));
	const pack: PackAyam[] = [];
	for (const s of d.satuan) {
		if (!s.aktif || !satuanDiOutlet(s.id, outletId, d.pemakai)) continue;
		const isi = d.isi.filter((i) => i.satuan_beli_id === s.id);
		if (isi.length < 2) continue;
		const hargaPack = d.hargaBeli.find((x) => x.outlet_id === outletId && x.satuan_beli_id === s.id)?.harga;
		if (hargaPack == null) {
			kurang.push(s.nama);
			continue;
		}
		const baris = isi.map((i) => {
			const menuIds = d.resep.filter((r) => r.bahan_id === i.bahan_id).map((r) => r.menu_id);
			const jual = d.hargaJual.find((h) => h.outlet_id === outletId && menuIds.includes(h.menu_id))?.harga ?? 0;
			return { nama: bahan.get(i.bahan_id)?.nama ?? 'Potongan', jumlah: i.qty, jual };
		});
		if (baris.every((b) => b.jual <= 0)) continue; // tidak dijual di outlet ini
		const jumlahPotong = baris.reduce((t, b) => t + b.jumlah, 0);
		const bobot = (b: (typeof baris)[number]) => (aturan.bagiAyam === 'harga' && b.jual > 0 ? b.jual : 1);
		const totalBobot = baris.reduce((t, b) => t + b.jumlah * bobot(b), 0);
		const tepung = (tepungPerPack ?? 0) / jumlahPotong;
		const minyak = (minyakPerPack ?? 0) / jumlahPotong;
		const potong = baris.map((b): Potong => {
			const ayam = (hargaPack * bobot(b)) / totalBobot;
			const modal = ayam + pelengkapPerPotong + tepung + minyak;
			return {
				nama: b.nama,
				jumlah: b.jumlah,
				ayam: bulat(ayam),
				pelengkap: bulat(pelengkapPerPotong),
				tepung: bulat(tepung),
				minyak: bulat(minyak),
				modal: bulat(modal),
				jual: b.jual,
				untung: bulat(b.jual - modal),
				persen: b.jual > 0 ? Math.round(((b.jual - modal) / b.jual) * 1000) / 10 : 0
			};
		});
		const modalPack = hargaPack + pelengkapPerPotong * jumlahPotong + (tepungPerPack ?? 0) + (minyakPerPack ?? 0);
		const jualPack = baris.reduce((t, b) => t + b.jumlah * b.jual, 0);
		pack.push({
			nama: s.nama,
			hargaPack,
			potong,
			jumlahPotong,
			modalPack: bulat(modalPack),
			jualPack,
			untungPack: bulat(jualPack - modalPack),
			persenPack: jualPack > 0 ? Math.round(((jualPack - modalPack) / jualPack) * 1000) / 10 : 0
		});
	}

	return {
		outlet_id: outletId,
		harga: [...harga.values()],
		pelengkap: { daftar: daftarPelengkap, perPotong: bulat(pelengkapPerPotong) },
		tepung: { dkriukKg: tD?.perSatuan ?? null, aKg: tA?.perSatuan ?? null, campuranKg: campuranKg === null ? null : bulat(campuranKg), perPack: tepungPerPack === null ? null : bulat(tepungPerPack) },
		minyak: { perLiter: mi?.perSatuan ?? null, perPack: minyakPerPack === null ? null : bulat(minyakPerPack) },
		pack,
		kurang: [...new Set(kurang)]
	};
}
