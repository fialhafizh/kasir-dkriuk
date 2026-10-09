// Mengolah hasil agregasi server menjadi data grafik (logika murni, teruji).

export interface BarisHasil {
	k: string[];
	l: string[];
	n: number[];
}
export interface Hasil {
	kolom: { kolom: string; satuan?: string }[];
	ukuran: string[];
	baris: BarisHasil[];
	terpotong: boolean;
}

export interface Seri {
	nama: string;
	nilai: number[];
}
export interface DataSeri {
	/** label sumbu kategori (urut sesuai hasil) */
	kategori: string[];
	seri: Seri[];
}

/**
 * 1 pengelompokan: kategori = kelompok, satu seri per ukuran.
 * 2 pengelompokan: kategori = kelompok pertama, satu seri per nilai kelompok kedua (ukuran pertama); yang tidak ada = 0.
 */
export function keSeri(h: Hasil, labelUkuran: (u: string) => string = (u) => u): DataSeri {
	if (h.kolom.length < 2) {
		return {
			kategori: h.baris.map((b) => b.l[0] ?? ''),
			seri: h.ukuran.map((u, i) => ({ nama: labelUkuran(u), nilai: h.baris.map((b) => Number(b.n[i]) || 0) }))
		};
	}
	const kunciKat: string[] = [];
	const labelKat = new Map<string, string>();
	const kunciSeri: string[] = [];
	const labelSeri = new Map<string, string>();
	for (const b of h.baris) {
		if (!labelKat.has(b.k[0])) (kunciKat.push(b.k[0]), labelKat.set(b.k[0], b.l[0]));
		if (!labelSeri.has(b.k[1])) (kunciSeri.push(b.k[1]), labelSeri.set(b.k[1], b.l[1]));
	}
	// Kategori waktu/jam/hari diurutkan menurut kuncinya supaya sumbu kronologis.
	kunciKat.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	const nilai = new Map(h.baris.map((b) => [`${b.k[0]}\u0000${b.k[1]}`, Number(b.n[0]) || 0]));
	return {
		kategori: kunciKat.map((k) => labelKat.get(k)!),
		seri: kunciSeri.map((s) => ({ nama: labelSeri.get(s)!, nilai: kunciKat.map((k) => nilai.get(`${k}\u0000${s}`) ?? 0) }))
	};
}

export interface Matriks {
	baris: string[];
	kolom: string[];
	nilai: number[][];
	maks: number;
}

/** Peta panas dari 2 pengelompokan; jam diisi lengkap 00–23 bila kolom kedua = jam. */
export function keMatriks(h: Hasil): Matriks {
	const urut = (xs: string[]) => [...new Set(xs)].sort();
	const kb = urut(h.baris.map((b) => b.k[0]));
	let kk = urut(h.baris.map((b) => b.k[1]));
	const lb = new Map(h.baris.map((b) => [b.k[0], b.l[0]]));
	const lk = new Map(h.baris.map((b) => [b.k[1], b.l[1]]));
	if (h.kolom[1]?.kolom === 'jam' && kk.length) {
		const min = Number(kk[0]);
		const max = Number(kk.at(-1));
		kk = Array.from({ length: max - min + 1 }, (_, i) => String(min + i).padStart(2, '0'));
		for (const k of kk) if (!lk.has(k)) lk.set(k, `${k}.00`);
	}
	const isi = new Map(h.baris.map((b) => [`${b.k[0]}\u0000${b.k[1]}`, Number(b.n[0]) || 0]));
	const nilai = kb.map((b) => kk.map((k) => isi.get(`${b}\u0000${k}`) ?? 0));
	return { baris: kb.map((k) => lb.get(k)!), kolom: kk.map((k) => lk.get(k)!), nilai, maks: Math.max(0, ...nilai.flat()) };
}

/** Garis bantu sumbu nilai yang "bulat" (1, 2, 5 × 10^n), mulai 0. */
export function skala(maks: number, langkahMaks = 4): number[] {
	if (!(maks > 0)) return [0];
	const kasar = maks / langkahMaks;
	const p = 10 ** Math.floor(Math.log10(kasar));
	const langkah = [1, 2, 5, 10].map((m) => m * p).find((x) => x >= kasar)!;
	const hasil: number[] = [];
	for (let v = 0; v < maks + langkah; v += langkah) {
		hasil.push(Math.round(v * 1e6) / 1e6);
		if (v >= maks) break;
	}
	return hasil;
}

/** Angka ringkas: 1.250.000 → "1,25 jt", 12.500 → "12,5 rb". */
export function ringkas(n: number): string {
	const a = Math.abs(n);
	const f = (x: number) => x.toLocaleString('id-ID', { maximumFractionDigits: x < 10 ? 2 : 1 });
	if (a >= 1e9) return `${f(n / 1e9)} M`;
	if (a >= 1e6) return `${f(n / 1e6)} jt`;
	if (a >= 1e4) return `${f(n / 1e3)} rb`;
	return n.toLocaleString('id-ID', { maximumFractionDigits: 3 });
}
