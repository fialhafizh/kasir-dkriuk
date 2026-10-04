const BAGIAN = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Asia/Jakarta',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

function bagian(t: string | Date): Record<string, string> {
	return Object.fromEntries(BAGIAN.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
}

/** Waktu pada struk: dd/MM/yy HH:mm:ss (WIB). */
const sah = (t: string | Date) => !Number.isNaN(new Date(t).getTime());

export function formatWaktuWib(t: string | Date): string {
	if (!sah(t)) return '-';
	const b = bagian(t);
	return `${b.day}/${b.month}/${b.year.slice(-2)} ${b.hour}:${b.minute}:${b.second}`;
}

export function tanggalWib(t: string | Date): string {
	const b = bagian(t);
	return `${b.year}-${b.month}-${b.day}`;
}

/** Shift yang dibuka pada hari WIB sebelumnya harus ditutup dulu sebelum jualan hari ini. */
export function shiftKedaluwarsa(dibukaAt: string, sekarang: Date): boolean {
	if (!sah(dibukaAt)) return false;
	return tanggalWib(dibukaAt) < tanggalWib(sekarang);
}
