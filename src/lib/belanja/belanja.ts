// Rencana belanja ke stokis (Tahap 7c): data server + olahan murni (total, teks WA/Telegram, lembar Excel).
import { pesanAnalisis } from '#lib/analisis/api.ts';
import type { Lembar } from '#lib/ekspor/unduh.ts';
import { formatAngka } from '#lib/master/rupiah.ts';
import { labelGrup } from '#lib/stok/tampil.ts';
import { supabase } from '#lib/supabase/client.ts';

export interface PerOutlet {
	stok: number | null;
	pakai_hari: number;
	dari_beli: boolean;
	harga: number | null;
	saran: number;
}
export interface BarisBelanja {
	satuan_beli_id: string;
	nama: string;
	per_outlet: Record<string, PerOutlet>;
}
export interface Rencana {
	hari: number;
	outlet: { id: string; nama: string; kode: string }[];
	barang: BarisBelanja[];
}

const PESAN = /^(Jumlah hari 1–60)/;
export async function muatRencana(hari: number): Promise<Rencana> {
	const { data, error } = await supabase.rpc('rencana_belanja', { p_hari: hari });
	if (error) throw new Error((error.code === '22023' && PESAN.test(error.message) ? `${error.message}.` : pesanAnalisis(error)) ?? 'Gagal memuat data.');
	const r = data as Rencana;
	for (const b of r.barang)
		for (const p of Object.values(b.per_outlet)) {
			p.stok = p.stok === null ? null : Number(p.stok);
			p.pakai_hari = Number(p.pakai_hari);
			p.harga = p.harga === null ? null : Number(p.harga);
			p.saran = Number(p.saran);
		}
	return r;
}

/** Nama barang ringkas: "Pack Ayam Ori (1 kg)" → "Ayam Ori". */
export const namaBarang = (nama: string) => labelGrup(nama);

/** Isian (angka yang diubah admin) per "satuan|outlet"; tanpa isian = saran. */
export type Isian = Record<string, number>;
export const kunciSel = (satuan: string, outlet: string) => `${satuan}|${outlet}`;
export const jumlahSel = (b: BarisBelanja, outlet: string, isian: Isian) => isian[kunciSel(b.satuan_beli_id, outlet)] ?? b.per_outlet[outlet]?.saran ?? 0;

/** Harga satuan barang: harga outlet pertama yang punya harga. */
export function hargaBarang(b: BarisBelanja, outlet: string[]): number | null {
	for (const o of outlet) {
		const h = b.per_outlet[o]?.harga;
		if (h !== null && h !== undefined) return h;
	}
	return null;
}

export interface Ringkas {
	barang: { b: BarisBelanja; nama: string; per: { kode: string; jumlah: number }[]; total: number; harga: number | null; nilai: number | null }[];
	totalNilai: number;
	adaTanpaHarga: boolean;
}

export function ringkas(r: Rencana, isian: Isian): Ringkas {
	const ids = r.outlet.map((o) => o.id);
	const barang = r.barang.map((b) => {
		const per = r.outlet.map((o) => ({ kode: o.kode, jumlah: jumlahSel(b, o.id, isian) }));
		const total = per.reduce((t, x) => t + x.jumlah, 0);
		const harga = hargaBarang(b, ids);
		return { b, nama: namaBarang(b.nama), per, total, harga, nilai: harga === null ? null : harga * total };
	});
	return {
		barang,
		totalNilai: barang.reduce((t, x) => t + (x.nilai ?? 0), 0),
		adaTanpaHarga: barang.some((x) => x.total > 0 && x.nilai === null)
	};
}

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export function judulTanggal(t: Date): string {
	const w = new Date(t.getTime() + 7 * 3_600_000);
	return `${HARI[w.getUTCDay()]} ${String(w.getUTCDate()).padStart(2, '0')}/${String(w.getUTCMonth() + 1).padStart(2, '0')}/${w.getUTCFullYear()}`;
}

/** Teks siap tempel ke WA / dikirim ke Telegram (hanya barang yang dipesan). */
export function teksBelanja(s: Ringkas, tanggal: Date): string {
	const baris = s.barang
		.filter((x) => x.total > 0)
		.map((x) => `${x.nama}: ${x.total} (${x.per.filter((p) => p.jumlah > 0).map((p) => `${p.kode} ${p.jumlah}`).join(' · ')})`);
	return [
		`Belanja stokis — ${judulTanggal(tanggal)}`,
		...(baris.length ? baris : ['(tidak ada yang perlu dibeli)']),
		`Total: Rp${formatAngka(s.totalNilai)}${s.adaTanpaHarga ? ' (sebagian barang belum ada harganya)' : ''}`
	].join('\n');
}

export function lembarBelanja(r: Rencana, s: Ringkas): Lembar {
	return {
		nama: 'Belanja',
		kolom: ['Barang', 'Total pesanan', ...r.outlet.map((o) => o.nama), 'Harga satuan', 'Harga total'],
		baris: [
			...s.barang.map((x) => [x.nama, x.total, ...x.per.map((p) => p.jumlah), x.harga, x.nilai]),
			['Jumlah', null, ...r.outlet.map(() => null), null, s.totalNilai]
		]
	};
}
