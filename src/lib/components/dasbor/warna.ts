// Warna seri grafik dari tema (src/app.css --dk-seri-1..8; terang & gelap).
export const warnaSeri = (i: number) => `var(--dk-seri-${(i % 8) + 1})`;
