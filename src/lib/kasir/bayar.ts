import type { Metode } from './types.ts';

export const METODE: readonly { kode: Metode; label: string }[] = [
	{ kode: 'cash', label: 'Cash' },
	{ kode: 'qris', label: 'QRIS' },
	{ kode: 'gofood', label: 'GoFood' },
	{ kode: 'grabfood', label: 'GrabFood' },
	{ kode: 'shopeefood', label: 'ShopeeFood' }
];

export function labelMetode(m: Metode): string {
	return METODE.find((x) => x.kode === m)?.label ?? m;
}

export function kembalian(total: number, diterima: number): number | null {
	return diterima >= total ? diterima - total : null;
}

/**
 * Uang pas, lalu jumlah yang biasa diserahkan pembeli, maksimal 4 tombol.
 * Sampai 100rb: dibulatkan ke 5rb/10rb/20rb/50rb/100rb. Di atasnya: kelipatan 50rb dan 100rb.
 */
export function tombolCepat(total: number): number[] {
	if (total <= 0) return [0];
	const pecahan = total > 100000 ? [50000, 100000] : [5000, 10000, 20000, 50000, 100000];
	const naik = pecahan.map((p) => Math.ceil(total / p) * p);
	return [total, ...new Set(naik.filter((n) => n > total))].sort((a, b) => a - b).slice(0, 4);
}
