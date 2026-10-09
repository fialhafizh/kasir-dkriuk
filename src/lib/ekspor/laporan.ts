// Lembar Excel untuk laporan yang sudah ada (Laba-rugi, Kas harian).
import type { HariKas } from '#lib/kas/admin.ts';
import type { LaporanKeuangan } from '#lib/kas/laporan.ts';
import { labelMetode, METODE } from '#lib/kasir/bayar.ts';
import type { Lembar, Sel } from './xlsx.ts';

/** Laba-rugi: satu kolom per outlet / semua. */
export function lembarLabaRugi(data: { judul: string; r: LaporanKeuangan }[]): Lembar {
	const kolom = ['Pos', ...data.map((d) => d.judul)];
	const baris: Sel[][] = [];
	const tambah = (pos: string, f: (r: LaporanKeuangan) => number | null) => baris.push([pos, ...data.map((d) => f(d.r))]);
	tambah('Omzet', (r) => Number(r.omzet));
	for (const m of METODE) tambah(`  ${labelMetode(m.kode)}`, (r) => Number(r.per_metode[m.kode]?.total ?? 0));
	tambah('Belanja bahan', (r) => -Number(r.belanja_bahan));
	tambah('Gaji', (r) => -Number(r.gaji));
	tambah('Sewa', (r) => -Number(r.sewa));
	const kategori = [...new Set(data.flatMap((d) => d.r.pengeluaran_lain.map((p) => p.kategori)))];
	for (const k of kategori) tambah(`Pengeluaran: ${k}`, (r) => -Number(r.pengeluaran_lain.find((p) => p.kategori === k)?.jumlah ?? 0));
	tambah('Laba', (r) => Number(r.laba));
	tambah('Setoran diterima', (r) => Number(r.setoran_diterima));
	tambah('Selisih setoran', (r) => Number(r.selisih_setoran));
	return { nama: 'Laba-rugi', kolom, baris };
}

/** Kas harian: satu baris per outlet per tanggal. */
export function lembarKas(data: { outlet: { nama: string }; hari: HariKas[] }[]): Lembar {
	return {
		nama: 'Kas harian',
		kolom: ['Outlet', 'Tanggal', ...METODE.map((m) => labelMetode(m.kode)), 'Total', 'Batal', 'Pengeluaran laci', 'Pengeluaran luar', 'Belanja bahan', 'Setoran', 'Laci awal', 'Laci akhir', 'Selisih'],
		baris: data.flatMap((d) =>
			d.hari.map((h) => [
				d.outlet.nama,
				h.tanggal,
				...METODE.map((m) => Number(h.per_metode[m.kode]?.total ?? 0)),
				Number(h.total),
				Number(h.jumlah_batal),
				h.pengeluaran_laci.reduce((t, p) => t + Number(p.jumlah), 0),
				h.pengeluaran_luar.reduce((t, p) => t + Number(p.jumlah), 0),
				Number(h.belanja_bahan),
				Number(h.setoran),
				Number(h.saldo_awal),
				Number(h.saldo_akhir),
				Number(h.selisih)
			])
		)
	};
}
