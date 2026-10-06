// Tampilan kasir dari data server + antrean di perangkat (logika murni, teruji).
import type { Metode, PenjualanRiwayat, Ringkasan, Shift } from '#lib/kasir/types.ts';
import type { Kejadian } from './db.ts';

/**
 * Kejadian yang belum tercermin di data server: masih menunggu, atau sudah terkirim SESUDAH data server
 * (salinan) itu diambil. Tanpa disimpanAt (data server baru diambil) hanya yang menunggu.
 */
export function belumTercermin(k: Kejadian, disimpanAt?: string | null): boolean {
	if (k.status === 'menunggu') return true;
	return k.status === 'terkirim' && !!disimpanAt && !!k.terkirim_at && k.terkirim_at > disimpanAt;
}

/** Shift terbuka menurut perangkat ini: kejadian buka/tutup terakhir menang atas data server. */
export function shiftLokal(server: Shift | null, kejadian: Kejadian[], outletId: string, disimpanAt?: string | null): Shift | null {
	const k = kejadian
		// Buka/tutup yang ditolak tidak berlaku; yang sudah tercermin di data server tidak diterapkan lagi.
		.filter((x) => x.outlet_id === outletId && (x.jenis === 'buka_shift' || x.jenis === 'tutup_shift') && belumTercermin(x, disimpanAt))
		.sort((a, b) => (a.urut ?? 0) - (b.urut ?? 0) || a.waktu.localeCompare(b.waktu));
	let s = server;
	for (const x of k) {
		if (x.jenis === 'buka_shift') {
			// Buka yang sudah terkirim: hasilnya id shift sebenarnya (bisa digabung ke shift lain).
			const id = x.status === 'terkirim' && typeof x.hasil === 'string' ? x.hasil : x.shift_id!;
			s = { id, outlet_id: outletId, dibuka_at: x.waktu, modal: Number(x.data.modal ?? 0), ditutup_at: null };
		} else if (s && x.shift_id && idSatuShift(kejadian, s.id).has(x.shift_id)) {
			s = null;
		}
	}
	return s;
}

export interface PenjualanLokal extends PenjualanRiwayat {
	kode_struk: string | null;
	nomor_sementara: string | null;
	status_kirim: 'menunggu' | 'ditolak' | 'terkirim' | 'diabaikan' | 'server';
	alasan: string | null;
	/** Batal dari antrean perangkat: 'menunggu' belum terkirim, 'ditolak' ditolak server (transaksi tetap berlaku). */
	batal_kirim: 'menunggu' | 'ditolak' | null;
	/** Dibatalkan lewat antrean sementara data server yang dipakai belum mencatat batalnya. */
	batal_lokal: boolean;
	alasan_batal_ditolak?: string | null;
}

function dariKejadian(k: Kejadian): PenjualanLokal {
	const d = k.data as {
		metode: Metode;
		total: number;
		diterima?: number | null;
		kembalian?: number | null;
		kode_struk?: string;
		nomor_sementara?: string | null;
		item: { nama: string; harga: number; qty: number }[];
	};
	const hasil = k.hasil as { nomor?: string; total?: number } | null;
	return {
		id: k.id,
		nomor: hasil?.nomor ?? d.nomor_sementara ?? '-',
		waktu: k.waktu,
		metode: d.metode,
		total: hasil?.total ?? d.total,
		diterima: d.diterima ?? null,
		kembalian: d.kembalian ?? null,
		void_at: null,
		void_alasan: null,
		item: d.item ?? [],
		kode_struk: d.kode_struk ?? null,
		nomor_sementara: d.nomor_sementara ?? null,
		status_kirim: k.status,
		alasan: k.alasan,
		batal_kirim: null,
		batal_lokal: false
	};
}

/**
 * Semua id yang berarti shift yang sama: id perangkat dan id shift server bisa berbeda bila
 * shift digabung saat sinkron (hasil kejadian buka = id shift sebenarnya).
 */
export function idSatuShift(kejadian: Kejadian[], shiftId: string): Set<string> {
	const ids = new Set([shiftId]);
	for (const k of kejadian) {
		if (k.jenis !== 'buka_shift' || typeof k.hasil !== 'string' || !k.shift_id) continue;
		if (k.hasil === shiftId || k.shift_id === shiftId) {
			ids.add(k.hasil);
			ids.add(k.shift_id);
		}
	}
	return ids;
}

/** Penjualan shift ini: dari server + yang masih di perangkat (tanpa dobel), terbaru di atas. */
export function gabungRiwayat(server: PenjualanRiwayat[], kejadian: Kejadian[], shiftId: string): PenjualanLokal[] {
	const ada = new Set(server.map((p) => p.id));
	const ids = idSatuShift(kejadian, shiftId);
	const lokal = kejadian
		.filter((k) => k.jenis === 'jual' && k.status !== 'diabaikan' && !!k.shift_id && ids.has(k.shift_id) && !ada.has(k.id))
		.map(dariKejadian);
	const srv: PenjualanLokal[] = server.map((p) => ({
		...p,
		kode_struk: p.kode_struk ?? null,
		nomor_sementara: p.nomor_sementara ?? null,
		status_kirim: 'server',
		alasan: null,
		batal_kirim: null,
		batal_lokal: false
	}));
	const semua = [...lokal, ...srv];
	terapkanBatal(semua, kejadian);
	return semua.sort((a, b) => b.waktu.localeCompare(a.waktu));
}

/** Batal transaksi yang masih di antrean / baru terkirim ditampilkan seolah sudah tercatat. */
function terapkanBatal(baris: PenjualanLokal[], kejadian: Kejadian[]) {
	const per = new Map(baris.map((p) => [p.id, p]));
	const batal = kejadian.filter((k) => k.jenis === 'batal_jual' && k.status !== 'diabaikan').sort((a, b) => (a.urut ?? 0) - (b.urut ?? 0));
	for (const k of batal) {
		const p = per.get(String(k.data.penjualan_id ?? ''));
		if (!p) continue;
		if (k.status === 'ditolak') {
			if (!p.void_at) {
				p.batal_kirim = 'ditolak';
				p.alasan_batal_ditolak = k.alasan;
			}
			continue;
		}
		if (p.void_at) continue;
		p.void_at = k.waktu;
		p.void_alasan = String(k.data.alasan ?? '');
		p.batal_lokal = p.status_kirim === 'server';
		p.batal_kirim = k.status === 'menunggu' ? 'menunggu' : null;
	}
}

const METODE: Metode[] = ['cash', 'qris', 'gofood', 'grabfood', 'shopeefood'];

/** Ringkasan untuk Tutup toko: ringkasan server (bila ada) + penjualan yang belum ada di server. */
export function ringkasanLokal(dasar: Ringkasan | null, shift: Shift, lokal: PenjualanLokal[]): Ringkasan {
	const per = Object.fromEntries(METODE.map((m) => [m, { ...(dasar?.per_metode[m] ?? { jumlah: 0, total: 0 }) }])) as Ringkasan['per_metode'];
	let jumlah = dasar?.jumlah_transaksi ?? 0;
	let total = dasar?.total ?? 0;
	let cash = (dasar?.cash_seharusnya ?? shift.modal) - shift.modal;
	let jumlahVoid = dasar?.jumlah_void ?? 0;
	let jumlahDitolak = 0;
	let totalDitolak = 0;
	const tambah = (p: PenjualanLokal, arah: 1 | -1) => {
		per[p.metode].jumlah += arah;
		per[p.metode].total += arah * p.total;
		jumlah += arah;
		total += arah * p.total;
		if (p.metode === 'cash') cash += arah * p.total;
	};
	for (const p of lokal) {
		if (p.status_kirim === 'server') {
			// Sudah dihitung di ringkasan server, tetapi batalnya baru ada di antrean.
			if (p.batal_lokal) {
				tambah(p, -1);
				jumlahVoid++;
			}
			continue;
		}
		// Baris 'terkirim' yang tidak ada di daftar server = terkirim setelah salinan server dibuat: tetap dihitung.
		if (p.void_at) {
			jumlahVoid++;
			continue;
		}
		tambah(p, 1);
		// Uangnya ada di laci walau ditolak server: tetap dihitung, tetapi ditampilkan terpisah.
		if (p.status_kirim === 'ditolak') {
			jumlahDitolak++;
			totalDitolak += p.total;
		}
	}
	return {
		shift_id: shift.id,
		outlet_id: shift.outlet_id,
		modal: shift.modal,
		dibuka_at: shift.dibuka_at,
		ditutup_at: null,
		jumlah_transaksi: jumlah,
		jumlah_void: jumlahVoid,
		total,
		per_metode: per,
		cash_seharusnya: shift.modal + cash,
		uang_fisik: null,
		selisih: null,
		digabung: dasar?.digabung,
		jual_setelah_tutup: dasar?.jual_setelah_tutup,
		batal_setelah_tutup: dasar?.batal_setelah_tutup,
		dibuka_lagi_setelah: dasar?.dibuka_lagi_setelah,
		jumlah_ditolak: jumlahDitolak,
		total_ditolak: totalDitolak
	};
}

export function cocokCari(p: PenjualanLokal, q: string): boolean {
	const t = q.trim().toUpperCase();
	if (!t) return true;
	return [p.nomor, p.nomor_sementara, p.kode_struk].some((x) => !!x && x.toUpperCase().includes(t));
}
