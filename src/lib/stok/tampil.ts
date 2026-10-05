// Menyusun angka buku besar menjadi baris stok yang mudah dibaca kasir/admin (logika murni, teruji).
import { formatQty } from '#lib/master/rupiah.ts';
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import type { BarisStok, JenisGerakan, StatusStok } from './types.ts';

const EPS = 1e-9;
// Sisa pembulatan resep 4 desimal (mis. 12 porsi × 0,0833 kg) di bawah 0,001 dianggap nol: tampilan & tanda sama.
const NOL = 0.001;
const DESIMAL = new Set(['kg', 'liter']);

export const LABEL_JENIS: Record<JenisGerakan, string> = {
	awal: 'Stok awal',
	masuk: 'Barang masuk',
	masuk_batal: 'Batal barang masuk',
	jual: 'Terjual',
	jual_batal: 'Batal jual'
};

/** Paling banyak 2 desimal, koma Indonesia; -0 ditampilkan 0. */
export function angkaStok(n: number): string {
	// Angka sangat kecil (sisa resep 4 desimal) jangan dibulatkan ke 0: minus harus tetap terlihat.
	if (Math.abs(n) < NOL) return '0';
	if (Math.abs(n) < 0.01) return formatQty(n);
	const r = Math.round(n * 100) / 100;
	return formatQty(Object.is(r, -0) ? 0 : r);
}

/** "Pack Ayam Ori (1 kg)" → "Ayam Ori". */
export function labelGrup(namaSatuan: string): string {
	return namaSatuan
		.replace(/^(pack|karung)\s+/i, '')
		.replace(/\s*\(.*\)\s*$/, '')
		.trim();
}

function status(minus: boolean, packSetara: number, ambang: number | null): StatusStok {
	if (minus) return 'minus';
	return ambang != null && packSetara <= ambang + EPS ? 'menipis' : 'aman';
}

interface Anggota {
	b: Bahan;
	isi: number;
	n: number;
}

function barisGrup(g: SatuanBeli, anggota: Anggota[]): BarisStok {
	const utuh = Math.max(0, Math.floor(Math.min(...anggota.map((a) => a.n / a.isi)) + EPS));
	const sisa = anggota.map((a) => ({ nama: a.b.nama, n: a.n - utuh * a.isi })).filter((x) => Math.abs(x.n) >= NOL);
	const bagian = [...(utuh > 0 || sisa.length === 0 ? [`${utuh} pack`] : []), ...sisa.map((x) => `${angkaStok(x.n)} ${x.nama}`)];
	const total = anggota.reduce((t, a) => t + a.n, 0);
	const isiPack = anggota.reduce((t, a) => t + a.isi, 0);
	return {
		kunci: g.id,
		label: labelGrup(g.nama),
		teks: bagian.join(' + '),
		status: status(anggota.some((a) => a.n < -NOL), total / isiPack, g.ambang),
		bahan_id: anggota.map((a) => a.b.id)
	};
}

function barisTunggal(b: Bahan, n: number, t: { s: SatuanBeli; isi: number } | undefined): BarisStok {
	const st = status(n < -NOL, t ? n / t.isi : 0, t?.s.ambang ?? null);
	const dasar = { kunci: b.id, label: b.nama, bahan_id: [b.id], status: st };
	if (!t || t.isi === 1 || DESIMAL.has(b.satuan) || n < 0) return { ...dasar, teks: `${angkaStok(n)} ${b.satuan}` };
	const pack = Math.floor(n / t.isi + EPS);
	const lepas = n - pack * t.isi;
	if (pack === 0) return { ...dasar, teks: `${angkaStok(n)} ${b.satuan}` };
	return { ...dasar, teks: `${pack} pack${Math.abs(lepas) > EPS ? ` + ${angkaStok(lepas)} ${b.satuan}` : ''}` };
}

/**
 * Satuan beli berisi >1 bahan (pack ayam) → satu baris per kelompok; selain itu satu baris per bahan,
 * memakai satuan beli satu-bahan dengan isi terkecil untuk "pack + lepas" & ambang. Hanya bahan aktif.
 */
export function susunStok(bahan: Bahan[], satuan: SatuanBeli[], isi: IsiSatuanBeli[], stok: ReadonlyMap<string, number>): BarisStok[] {
	const aktif = bahan.filter((b) => b.aktif).sort((a, b) => a.urutan - b.urutan);
	const perId = new Map(aktif.map((b) => [b.id, b]));
	const qty = (id: string) => stok.get(id) ?? 0;

	const isiPer = new Map<string, IsiSatuanBeli[]>();
	for (const s of satuan.filter((x) => x.aktif)) {
		const baris = isi.filter((x) => x.satuan_beli_id === s.id && perId.has(x.bahan_id));
		if (baris.length) isiPer.set(s.id, baris);
	}
	const satuanPer = new Map(satuan.map((s) => [s.id, s]));
	const grupBahan = new Map<string, SatuanBeli>();
	const tunggal = new Map<string, { s: SatuanBeli; isi: number }>();
	for (const [sid, baris] of isiPer) {
		const s = satuanPer.get(sid)!;
		if (baris.length > 1) for (const x of baris) grupBahan.set(x.bahan_id, s);
		else {
			const lama = tunggal.get(baris[0].bahan_id);
			if (!lama || baris[0].qty < lama.isi) tunggal.set(baris[0].bahan_id, { s, isi: baris[0].qty });
		}
	}

	const hasil: BarisStok[] = [];
	const sudah = new Set<string>();
	for (const b of aktif) {
		if (sudah.has(b.id)) continue;
		const g = grupBahan.get(b.id);
		if (g) {
			const anggota = isiPer.get(g.id)!.map((x) => ({ b: perId.get(x.bahan_id)!, isi: x.qty, n: qty(x.bahan_id) }));
			for (const a of anggota) sudah.add(a.b.id);
			hasil.push(barisGrup(g, anggota));
		} else {
			sudah.add(b.id);
			hasil.push(barisTunggal(b, qty(b.id), tunggal.get(b.id)));
		}
	}
	return hasil;
}

export function hitungRingkasan(baris: BarisStok[]): { minus: number; menipis: number } {
	return {
		minus: baris.filter((b) => b.status === 'minus').length,
		menipis: baris.filter((b) => b.status === 'menipis').length
	};
}
