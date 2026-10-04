const bulat = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Resep nasi menyimpan kg beras per porsi; admin lebih mudah berpikir "porsi per kg" (1 desimal). */
export function porsiPerKg(qtyKg: number): number {
	return qtyKg > 0 ? bulat(1 / qtyKg, 1) : NaN;
}

export function qtyKgDariPorsi(porsi: number): number {
	return porsi > 0 ? bulat(1 / porsi, 4) : NaN;
}
