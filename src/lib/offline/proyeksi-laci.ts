// Saldo laci di perangkat = saldo server (salinan) + antrean yang belum tercermin (logika murni, teruji).
import type { Kejadian } from './db.ts';
import { belumTercermin } from './proyeksi.ts';

export interface LaciServer {
	saldo: number;
	ada_awal: boolean;
}

/**
 * Uang fisik yang memang sudah keluar/masuk laci: kejadian menunggu, ditolak (uangnya tetap sudah berpindah),
 * atau terkirim sesudah salinan diambil. Yang diabaikan tidak dihitung.
 */
function berlaku(k: Kejadian, disimpanAt: string | null): boolean {
	return k.status === 'ditolak' || belumTercermin(k, disimpanAt);
}

const angka = (v: unknown) => Number(v ?? 0) || 0;

export function saldoLaciLokal(server: LaciServer | null, kejadian: Kejadian[], outletId: string, disimpanAt: string | null): { saldo: number; adaAwal: boolean } {
	let saldo = server?.saldo ?? 0;
	let adaAwal = server?.ada_awal ?? false;
	const milik = kejadian.filter((k) => k.outlet_id === outletId && berlaku(k, disimpanAt)).sort((a, b) => (a.urut ?? 0) - (b.urut ?? 0));
	const jualDiAntrean = new Set(milik.filter((k) => k.jenis === 'jual').map((k) => k.id));
	const dibatalkan = new Set(milik.filter((k) => k.jenis === 'batal_jual').map((k) => String(k.data.penjualan_id ?? '')));
	for (const k of milik) {
		switch (k.jenis) {
			case 'buka_shift':
				// Uang laci awal hanya berlaku sekali per outlet (server mengabaikan yang kedua).
				if (!adaAwal && k.data.laci_awal !== undefined) {
					saldo = angka(k.data.laci_awal);
					adaAwal = true;
				}
				break;
			case 'jual':
				if (k.data.metode === 'cash' && !dibatalkan.has(k.id)) saldo += angka(k.data.total);
				break;
			case 'batal_jual':
				// Jual & batal sama-sama di antrean: tidak pernah dihitung. Jual sudah di server: kurangi.
				if (k.data.metode === 'cash' && !jualDiAntrean.has(String(k.data.penjualan_id ?? ''))) saldo -= angka(k.data.total);
				break;
			case 'pengeluaran':
			case 'setoran':
				saldo -= angka(k.data.jumlah);
				break;
			case 'tutup_shift':
				// Hitungan tutup toko = jangkar baru.
				saldo = angka(k.data.uang_fisik);
				break;
		}
	}
	return { saldo, adaAwal };
}

/** Pengeluaran & setoran di antrean sejak jam tertentu (untuk ringkasan shift di Tutup toko). */
export function kasAntrean(kejadian: Kejadian[], outletId: string, sejak: string, disimpanAt: string | null): { pengeluaran: number; setoran: number } {
	let pengeluaran = 0;
	let setoran = 0;
	for (const k of kejadian) {
		if (k.outlet_id !== outletId || !berlaku(k, disimpanAt) || k.waktu <= sejak) continue;
		if (k.jenis === 'pengeluaran') pengeluaran += angka(k.data.jumlah);
		if (k.jenis === 'setoran') setoran += angka(k.data.jumlah);
	}
	return { pengeluaran, setoran };
}
