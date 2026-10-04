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
	for (const kata of keAscii(teks).split(/\s+/).filter(Boolean)) {
		if (!baris) baris = kata.slice(0, lebar);
		else if (baris.length + 1 + kata.length <= lebar) baris += ` ${kata}`;
		else {
			hasil.push(baris);
			baris = kata.slice(0, lebar);
		}
	}
	if (baris) hasil.push(baris);
	return hasil;
}

const tengah = (s: string, lebar: number) => ' '.repeat(Math.max(0, Math.floor((lebar - s.length) / 2))) + s;
const kiriKanan = (kiri: string, kanan: string, lebar: number) =>
	kiri + ' '.repeat(Math.max(1, lebar - kiri.length - kanan.length)) + kanan;

export function barisStruk(d: DataStruk, lebar = 32): string[] {
	const garis = '-'.repeat(lebar);
	const b: string[] = [];
	for (const x of bungkus(`${d.outlet.merek} ${d.outlet.nama}`.toUpperCase(), lebar)) b.push(tengah(x, lebar));
	for (const x of bungkus(d.outlet.alamat, lebar)) b.push(tengah(x, lebar));
	b.push(tengah(keAscii(`WA ${d.outlet.telepon}`), lebar));
	if (d.cetakUlang) b.push(tengah('** CETAK ULANG **', lebar));
	if (d.batal) b.push(tengah('** DIBATALKAN **', lebar));
	b.push(garis);
	b.push(kiriKanan(d.nomor, formatWaktuWib(d.waktu), lebar));
	b.push(...bungkus(`Kasir: ${d.kasir}`, lebar));
	b.push(garis);
	for (const i of d.item) {
		b.push(...bungkus(i.nama, lebar));
		b.push(kiriKanan(`  ${i.qty} x ${formatAngka(i.harga)}`, formatAngka(i.harga * i.qty), lebar));
	}
	b.push(garis);
	b.push(kiriKanan('TOTAL', formatAngka(d.total), lebar));
	if (d.metode === 'cash' && d.diterima !== null) {
		b.push(kiriKanan(labelMetode('cash'), formatAngka(d.diterima), lebar));
		b.push(kiriKanan('Kembali', formatAngka(d.kembalian ?? 0), lebar));
	} else {
		b.push(kiriKanan(labelMetode(d.metode), formatAngka(d.total), lebar));
	}
	b.push(garis);
	b.push(tengah('Terima kasih!', lebar));
	return b;
}
