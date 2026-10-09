// Periode dasbor dalam WIB (UTC+7, tanpa musim panas) → rentang jam [dari, sampai).

export const PERIODE = ['hari_ini', 'kemarin', '7_hari', '30_hari', 'bulan_ini', 'bulan_lalu', 'kustom'] as const;
export type Periode = (typeof PERIODE)[number];
export const LABEL_PERIODE: Record<Periode, string> = {
	hari_ini: 'Hari ini',
	kemarin: 'Kemarin',
	'7_hari': '7 hari',
	'30_hari': '30 hari',
	bulan_ini: 'Bulan ini',
	bulan_lalu: 'Bulan lalu',
	kustom: 'Pilih tanggal'
};

export interface Rentang {
	dari: Date;
	sampai: Date;
}

const JAM = 3_600_000;
const HARI = 24 * JAM;
const WIB = 7 * JAM;

/** Tengah malam WIB untuk tanggal 'YYYY-MM-DD'. */
export function awalHariWib(tanggal: string): Date {
	const [y, m, d] = tanggal.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d) - WIB);
}
function tanggalWib(t: Date): { y: number; m: number; d: number } {
	const w = new Date(t.getTime() + WIB);
	return { y: w.getUTCFullYear(), m: w.getUTCMonth(), d: w.getUTCDate() };
}
const tengahMalam = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - WIB);

/** Rentang periode. "7 hari"/"30 hari" = hari ini + hari-hari sebelumnya; bulan ini sampai akhir hari ini. */
export function rentangPeriode(p: Periode, sekarang: Date, kustom?: { dari: string; sampai: string }): Rentang {
	const { y, m, d } = tanggalWib(sekarang);
	const besok = tengahMalam(y, m, d + 1);
	switch (p) {
		case 'hari_ini':
			return { dari: tengahMalam(y, m, d), sampai: besok };
		case 'kemarin':
			return { dari: tengahMalam(y, m, d - 1), sampai: tengahMalam(y, m, d) };
		case '7_hari':
			return { dari: tengahMalam(y, m, d - 6), sampai: besok };
		case '30_hari':
			return { dari: tengahMalam(y, m, d - 29), sampai: besok };
		case 'bulan_ini':
			return { dari: tengahMalam(y, m, 1), sampai: besok };
		case 'bulan_lalu':
			return { dari: tengahMalam(y, m - 1, 1), sampai: tengahMalam(y, m, 1) };
		case 'kustom': {
			if (!kustom) return { dari: tengahMalam(y, m, d), sampai: besok };
			const dari = awalHariWib(kustom.dari);
			return { dari, sampai: new Date(awalHariWib(kustom.sampai).getTime() + HARI) };
		}
	}
}

/** Periode pembanding: panjang sama tepat sebelumnya. "Bulan ini" (sampai hari ini) ↔ tanggal yang sama bulan lalu. */
export function rentangPembanding(p: Periode, r: Rentang): Rentang {
	if (p === 'bulan_ini' || p === 'bulan_lalu') {
		const a = tanggalWib(r.dari);
		const panjangHari = Math.round((r.sampai.getTime() - r.dari.getTime()) / HARI);
		const dari = tengahMalam(a.y, a.m - 1, 1);
		const akhirBulanLalu = tengahMalam(a.y, a.m, 1);
		const sampai = new Date(Math.min(dari.getTime() + panjangHari * HARI, akhirBulanLalu.getTime()));
		return { dari, sampai: p === 'bulan_lalu' ? akhirBulanLalu : sampai };
	}
	const panjang = r.sampai.getTime() - r.dari.getTime();
	return { dari: new Date(r.dari.getTime() - panjang), sampai: r.dari };
}

/** Perubahan persen; null bila pembanding 0. */
export function perubahan(sekarang: number, sebelum: number): number | null {
	if (!sebelum) return null;
	return Math.round(((sekarang - sebelum) / Math.abs(sebelum)) * 1000) / 10;
}
