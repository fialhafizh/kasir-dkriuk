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

/** Uang pas, lalu pecahan yang biasa diterima (dibulatkan ke 5rb/10rb/20rb/50rb/100rb), maksimal 4 tombol. */
export function tombolCepat(total: number): number[] {
	if (total <= 0) return [0];
	const naik = [5000, 10000, 20000, 50000, 100000].map((p) => Math.ceil(total / p) * p);
	return [total, ...new Set(naik.filter((n) => n > total))].sort((a, b) => a - b).slice(0, 4);
}
