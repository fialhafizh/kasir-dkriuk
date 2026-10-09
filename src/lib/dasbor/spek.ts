// Spek panel & dasbor; validasi di perangkat (sama aturannya dengan public._dasbor_cek_spek).
import { KATALOG, type JenisPanel, type SatuanWaktu, type Sumber } from './katalog.ts';
import type { Periode } from './periode.ts';

export interface Kelompok {
	kolom: string;
	satuan?: SatuanWaktu;
}

export interface Spek {
	sumber?: Sumber;
	ukuran?: string[];
	kelompok?: Kelompok[];
	saringan?: Record<string, string[]>;
	urutan?: { oleh: 'ukuran' | 'kelompok'; arah: 'naik' | 'turun' };
	batas?: number;
	periode_kunci?: Exclude<Periode, 'kustom'> | null;
	outlet_kunci?: string | null;
	bandingkan?: boolean;
	/** siklus_stok: baris stok (id kelompok pack / id bahan) */
	kunci?: string | null;
	/** riwayat: jenis kejadian yang ditampilkan (kosong = semua) */
	jenis?: string[];
}

export interface Panel {
	id?: string;
	judul: string;
	jenis: JenisPanel;
	spek: Spek;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface SaringanDasbor {
	outlet_id: string | null;
	periode: Periode;
	dari?: string;
	sampai?: string;
}

export interface Dasbor {
	id: string;
	nama: string;
	urutan: number;
	utama: boolean;
	bawaan: boolean;
	saringan: SaringanDasbor;
	panel: Panel[];
}

/** Pesan kesalahan pertama atau null bila spek boleh disimpan. */
export function periksaSpek(jenis: JenisPanel, s: Spek): string | null {
	if (jenis === 'status_stok' || jenis === 'uang_laci' || jenis === 'riwayat' || jenis === 'siklus_stok') return null;
	const k = s.sumber ? KATALOG[s.sumber] : undefined;
	if (!k) return 'Pilih sumber data.';
	const ukuran = s.ukuran ?? [];
	if (ukuran.length < 1 || ukuran.length > 4) return 'Pilih 1–4 ukuran.';
	if (ukuran.some((u) => !(k.ukuran as readonly string[]).includes(u))) return 'Ukuran tidak cocok dengan sumber data.';
	const kel = s.kelompok ?? [];
	if (kel.length > 2) return 'Pengelompokan paling banyak 2.';
	if (kel.some((x) => !(k.kelompok as readonly string[]).includes(x.kolom))) return 'Pengelompokan tidak cocok dengan sumber data.';
	if (kel.some((x) => x.kolom === 'waktu' && !x.satuan)) return 'Pilih satuan waktu.';
	if (jenis === 'angka' && kel.length) return 'Panel angka tidak memakai pengelompokan.';
	if (jenis === 'garis' && kel[0]?.kolom !== 'waktu') return 'Grafik garis dikelompokkan per waktu lebih dulu.';
	if (jenis === 'peta_panas' && kel.length !== 2) return 'Peta panas butuh 2 pengelompokan (mis. hari × jam).';
	if (jenis === 'lingkaran' && (kel.length !== 1 || ukuran.length !== 1)) return 'Lingkaran butuh 1 pengelompokan dan 1 ukuran.';
	if (jenis === 'batang' && !kel.length) return 'Grafik batang butuh pengelompokan.';
	if (s.batas !== undefined && (s.batas < 1 || s.batas > 500)) return 'Batas baris 1–500.';
	for (const [kolom, nilai] of Object.entries(s.saringan ?? {})) {
		if (kolom === 'waktu' || !(k.kelompok as readonly string[]).includes(kolom) || nilai.length > 100) return 'Saringan tidak sah.';
	}
	return null;
}

/** Urutan panel untuk tampilan HP: atas ke bawah, kiri ke kanan. */
export function urutHp<T extends { x: number; y: number }>(panel: T[]): T[] {
	return [...panel].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Letak panel baru: baris kosong di bawah semua panel. */
export function letakBaru(panel: Pick<Panel, 'y' | 'h'>[], w = 6, h = 4): Pick<Panel, 'x' | 'y' | 'w' | 'h'> {
	return { x: 0, y: panel.reduce((m, p) => Math.max(m, p.y + p.h), 0), w, h };
}

/** Lebar panel di HP/penyunting sederhana. */
export const PILIHAN_LEBAR = [
	{ w: 3, label: '¼' },
	{ w: 4, label: '⅓' },
	{ w: 6, label: '½' },
	{ w: 8, label: '⅔' },
	{ w: 12, label: 'Penuh' }
] as const;

/** Susun ulang panel sesuai urutan: mengalir kiri→kanan dalam 12 kolom, baris baru bila tidak muat. */
export function susunUlang<T extends { w: number; h: number }>(urutan: T[]): (T & { x: number; y: number })[] {
	let x = 0;
	let y = 0;
	let tinggiBaris = 0;
	return urutan.map((p) => {
		const w = Math.min(12, Math.max(1, p.w));
		if (x + w > 12) {
			y += tinggiBaris;
			x = 0;
			tinggiBaris = 0;
		}
		const hasil = { ...p, w, x, y };
		x += w;
		tinggiBaris = Math.max(tinggiBaris, p.h);
		return hasil;
	});
}
