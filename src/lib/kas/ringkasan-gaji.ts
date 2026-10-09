// Ringkasan gaji sebulan (seperti tabel owner): nama, gaji/hari, hari masuk, gaji sebulan, kasbon dipotong, total.
import type { Lembar } from '#lib/ekspor/unduh.ts';
import { formatAngka } from '#lib/master/rupiah.ts';
import { saranPotongan, type RekapGaji } from './gaji.ts';

export interface BarisRingkasGaji {
	nama: string;
	outlet: string;
	upah: number;
	hari: number;
	kotor: number;
	penyesuaian: number;
	kasbon: number;
	total: number;
	dibayar: boolean;
}

/** Sudah dibayar: angka pembayaran. Belum: perkiraan (kasbon dipotong = sisa kasbon sebatas gaji). */
export function ringkasGaji(daftar: { outlet: string; rekap: RekapGaji[] }[]): BarisRingkasGaji[] {
	return daftar.flatMap(({ outlet, rekap }) =>
		rekap
			.filter((r) => r.gaji || r.hari_masuk > 0 || r.aktif)
			.map((r) => {
				if (r.gaji) {
					const kotor = r.gaji.hari_masuk * r.gaji.upah_harian;
					return {
						nama: r.nama,
						outlet,
						upah: r.gaji.upah_harian,
						hari: r.gaji.hari_masuk,
						kotor,
						penyesuaian: r.gaji.penyesuaian,
						kasbon: r.gaji.potongan_kasbon,
						total: r.gaji.dibayar,
						dibayar: true
					};
				}
				const kotor = r.hari_masuk * r.upah_harian;
				const kasbon = saranPotongan(r.sisa_kasbon, kotor);
				return { nama: r.nama, outlet, upah: r.upah_harian, hari: r.hari_masuk, kotor, penyesuaian: 0, kasbon, total: kotor - kasbon, dibayar: false };
			})
	);
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const namaBulan = (bulan: string) => `${BULAN[Number(bulan.slice(5, 7)) - 1]} ${bulan.slice(0, 4)}`;
const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${formatAngka(Math.abs(n))}`;

export function teksGaji(bulan: string, baris: BarisRingkasGaji[], banyakOutlet: boolean): string {
	const isi = baris.map((b) => {
		const tambah = [b.penyesuaian ? `${b.penyesuaian > 0 ? '+' : '−'} ${rp(Math.abs(b.penyesuaian))}` : '', b.kasbon ? `− kasbon ${rp(b.kasbon)}` : '']
			.filter(Boolean)
			.join(' ');
		return `${b.nama}${banyakOutlet ? ` (${b.outlet})` : ''}: ${b.hari} hr × ${rp(b.upah)} = ${rp(b.kotor)}${tambah ? ` ${tambah}` : ''} → ${rp(b.total)}${b.dibayar ? '' : ' (belum dibayar)'}`;
	});
	const total = baris.reduce((t, b) => t + b.total, 0);
	return [`Gaji ${namaBulan(bulan)}`, ...(isi.length ? isi : ['(belum ada karyawan)']), `Total: ${rp(total)}`].join('\n');
}

export function lembarGaji(bulan: string, baris: BarisRingkasGaji[]): Lembar {
	const jumlah = (k: 'kotor' | 'penyesuaian' | 'kasbon' | 'total') => baris.reduce((t, b) => t + b[k], 0);
	return {
		nama: `Gaji ${namaBulan(bulan)}`,
		kolom: ['Nama', 'Outlet', 'Gaji/hari', 'Hari masuk', 'Gaji sebulan', 'Penyesuaian', 'Kasbon dipotong', 'Total', 'Status'],
		baris: [
			...baris.map((b) => [b.nama, b.outlet, b.upah, b.hari, b.kotor, b.penyesuaian, b.kasbon, b.total, b.dibayar ? 'Dibayar' : 'Belum dibayar']),
			['Jumlah', null, null, null, jumlah('kotor'), jumlah('penyesuaian'), jumlah('kasbon'), jumlah('total'), null]
		]
	};
}
