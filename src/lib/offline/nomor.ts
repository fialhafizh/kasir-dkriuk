import type { Penyimpan } from '#lib/auth/cache-profil.ts';

// Tanpa 0/1/I/O supaya tidak tertukar saat dibacakan pelanggan.
const ALFABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Kode struk 6 karakter dari id transaksi (tetap untuk id yang sama). */
export function kodeStruk(id: string): string {
	const hex = id.replace(/-/g, '');
	let n = BigInt(`0x${hex.slice(0, 15)}`);
	let s = '';
	for (let i = 0; i < 6; i++) {
		s += ALFABET[Number(n % 32n)];
		n /= 32n;
	}
	return s;
}

export function nomorSementara(kode: number, urut: number): string {
	return `S${kode}-${String(urut).padStart(3, '0')}`;
}

/** Urutan nomor sementara per perangkat per hari (WIB). */
export function ambilUrutSementara(s: Penyimpan, tanggal: string): number {
	const kunci = `dk-urut-${tanggal}`;
	let n = 0;
	try {
		n = Number(s.getItem(kunci) ?? '0') || 0;
	} catch {
		// abaikan
	}
	n++;
	try {
		s.setItem(kunci, String(n));
	} catch {
		// abaikan
	}
	return n;
}
