import type { Penyimpan } from '#lib/auth/cache-profil.ts';

export interface Perangkat {
	id: string;
	kode: number | null;
}

const KUNCI = 'dk-perangkat';

/** Identitas perangkat ini: dibuat sekali, tetap selama penyimpanan browser tidak dihapus. */
export function bacaPerangkat(s: Penyimpan): Perangkat {
	try {
		const ada = JSON.parse(s.getItem(KUNCI) ?? 'null') as Perangkat | null;
		if (ada?.id) return ada;
	} catch {
		// rusak → buat baru
	}
	const baru: Perangkat = { id: crypto.randomUUID(), kode: null };
	try {
		s.setItem(KUNCI, JSON.stringify(baru));
	} catch {
		// penyimpanan diblokir: id hanya berlaku di sesi ini
	}
	return baru;
}

export function simpanKode(s: Penyimpan, kode: number): void {
	const p = bacaPerangkat(s);
	try {
		s.setItem(KUNCI, JSON.stringify({ ...p, kode }));
	} catch {
		// abaikan
	}
}
