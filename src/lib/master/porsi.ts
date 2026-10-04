const bulat4 = (n: number) => Math.round(n * 10000) / 10000;

/** Resep nasi menyimpan kg beras per porsi; admin lebih mudah berpikir "porsi per kg". */
export function porsiPerKg(qtyKg: number): number {
	return qtyKg > 0 ? Math.round(1 / qtyKg) : NaN;
}

export function qtyKgDariPorsi(porsi: number): number {
	return porsi > 0 ? bulat4(1 / porsi) : NaN;
}
