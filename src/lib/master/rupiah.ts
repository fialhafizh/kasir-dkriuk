const MAKS_RUPIAH = 100_000_000;

export function formatAngka(n: number): string {
	return Math.round(n)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatRupiah(n: number): string {
	return `Rp${formatAngka(n)}`;
}

/** "11.000", "Rp 11.000", "11000" → 11000. Bukan bilangan bulat ≥ 0 yang wajar → null. */
export function parseRupiah(teks: string): number | null {
	const bersih = teks.trim().replace(/^rp\s*/i, '');
	if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(bersih)) return null;
	const n = Number(bersih.replace(/\./g, ''));
	return Number.isSafeInteger(n) && n <= MAKS_RUPIAH ? n : null;
}

export function formatQty(n: number): string {
	return Number(n.toFixed(4)).toString().replace('.', ',');
}

/** "0,1" atau "0.1" → 0.1. Harus > 0, ≤ 4 desimal. */
export function parseQty(teks: string): number | null {
	const bersih = teks.trim().replace(',', '.');
	if (!/^\d+(\.\d{1,4})?$/.test(bersih)) return null;
	const n = Number(bersih);
	return n > 0 && n <= 1_000_000 ? n : null;
}
