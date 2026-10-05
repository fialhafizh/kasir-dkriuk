import { formatAngka } from '#lib/master/rupiah.ts';
import { labelMetode } from './bayar.ts';
import type { Metode } from './types.ts';
import { formatWaktuWib } from './waktu.ts';

export interface DataStruk {
	outlet: { merek: string; nama: string; alamat: string; telepon: string };
	nomor: string;
	waktu: string;
	kasir: string;
	item: { nama: string; harga: number; qty: number }[];
	total: number;
	metode: Metode;
	diterima: number | null;
	kembalian: number | null;
	cetakUlang?: boolean;
	/** Kode pendek permanen untuk menelusuri transaksi (Tahap 4). */
	kodeStruk?: string | null;
	/** Diisi bila struk dicetak sebelum nomor resmi didapat (offline). */
	nomorSementara?: string | null;
	batal?: boolean;
}

/** Printer thermal murah hanya mencetak ASCII. */
export function keAscii(s: string): string {
	return s
		.replace(/[‘’ʼ]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[–—·•]/g, '-')
		.replace(/×/g, 'x')
		.normalize('NFKD')
		.replace(/[^\x20-\x7e]/g, '');
}

function bungkus(teks: string, lebar: number): string[] {
	const hasil: string[] = [];
	let baris = '';
	// Kata yang lebih panjang dari satu baris dipecah per `lebar`, bukan dipotong.
	const kata = keAscii(teks)
		.split(/\s+/)
		.filter(Boolean)
		.flatMap((k) => k.match(new RegExp(`.{1,${lebar}}`, 'g')) ?? []);
	for (const k of kata) {
		if (!baris) baris = k;
		else if (baris.length + 1 + k.length <= lebar) baris += ` ${k}`;
		else {
			hasil.push(baris);
			baris = k;
		}
	}
	if (baris) hasil.push(baris);
	return hasil;
}

const tengah = (s: string, lebar: number) => ' '.repeat(Math.max(0, Math.floor((lebar - s.length) / 2))) + s;
/** Rata kiri-kanan; bila tidak muat satu baris, kanan pindah ke baris berikutnya (rata kanan). */
function kiriKanan(kiri: string, kanan: string, lebar: number): string[] {
	if (kiri.length + 1 + kanan.length <= lebar) return [kiri + ' '.repeat(lebar - kiri.length - kanan.length) + kanan];
	return [...bungkus(kiri, lebar), kanan.slice(0, lebar).padStart(lebar)];
}

export function barisStruk(d: DataStruk, lebar = 32): string[] {
	const garis = '-'.repeat(lebar);
	const b: string[] = [];
	for (const x of bungkus(`${d.outlet.merek} ${d.outlet.nama}`.toUpperCase(), lebar)) b.push(tengah(x, lebar));
	for (const x of bungkus(d.outlet.alamat, lebar)) b.push(tengah(x, lebar));
	for (const x of bungkus(`WA ${d.outlet.telepon}`, lebar)) b.push(tengah(x, lebar));
	if (d.cetakUlang) b.push(tengah('** CETAK ULANG **', lebar));
	if (d.batal) b.push(tengah('** DIBATALKAN **', lebar));
	b.push(garis);
	b.push(...kiriKanan(d.nomor, formatWaktuWib(d.waktu), lebar));
	b.push(...bungkus(`Kasir: ${d.kasir}`, lebar));
	if (d.nomorSementara) b.push(...bungkus('No. sementara - nomor resmi menyusul', lebar));
	if (d.kodeStruk) b.push(...bungkus(`Kode: ${d.kodeStruk}`, lebar));
	b.push(garis);
	for (const i of d.item) {
		b.push(...bungkus(i.nama, lebar));
		b.push(...kiriKanan(`  ${i.qty} x ${formatAngka(i.harga)}`, formatAngka(i.harga * i.qty), lebar));
	}
	b.push(garis);
	b.push(...kiriKanan('TOTAL', formatAngka(d.total), lebar));
	if (d.metode === 'cash' && d.diterima !== null) {
		b.push(...kiriKanan(labelMetode('cash'), formatAngka(d.diterima), lebar));
		b.push(...kiriKanan('Kembali', formatAngka(d.kembalian ?? 0), lebar));
	} else {
		b.push(...kiriKanan(labelMetode(d.metode), formatAngka(d.total), lebar));
	}
	b.push(garis);
	b.push(tengah('Terima kasih!', lebar));
	return b;
}
