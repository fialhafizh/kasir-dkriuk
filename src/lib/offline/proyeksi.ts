// Tampilan kasir dari data server + antrean di perangkat (logika murni, teruji).
import type { Metode, PenjualanRiwayat, Ringkasan, Shift } from '#lib/kasir/types.ts';
import type { Kejadian } from './db.ts';

/** Shift terbuka menurut perangkat ini: kejadian buka/tutup terakhir menang atas data server. */
export function shiftLokal(server: Shift | null, kejadian: Kejadian[], outletId: string): Shift | null {
	const k = kejadian
		.filter((x) => x.outlet_id === outletId && (x.jenis === 'buka_shift' || x.jenis === 'tutup_shift') && x.status !== 'terkirim')
		.sort((a, b) => (a.urut ?? 0) - (b.urut ?? 0) || a.waktu.localeCompare(b.waktu));
	let s = server;
	for (const x of k) {
		if (x.jenis === 'buka_shift') {
			s = { id: x.shift_id!, outlet_id: outletId, dibuka_at: x.waktu, modal: Number(x.data.modal ?? 0), ditutup_at: null };
		} else if (s && x.shift_id && idSatuShift(kejadian, s.id).has(x.shift_id)) {
			s = null;
		}
	}
	return s;
}

export interface PenjualanLokal extends PenjualanRiwayat {
	kode_struk: string | null;
	nomor_sementara: string | null;
	status_kirim: 'menunggu' | 'ditolak' | 'terkirim' | 'server';
	alasan: string | null;
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
		alasan: k.alasan
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
	const lokal = kejadian.filter((k) => k.jenis === 'jual' && !!k.shift_id && ids.has(k.shift_id) && !ada.has(k.id)).map(dariKejadian);
	const srv: PenjualanLokal[] = server.map((p) => ({
		...p,
		kode_struk: p.kode_struk ?? null,
		nomor_sementara: p.nomor_sementara ?? null,
		status_kirim: 'server',
		alasan: null
	}));
	return [...lokal, ...srv].sort((a, b) => b.waktu.localeCompare(a.waktu));
}

const METODE: Metode[] = ['cash', 'qris', 'gofood', 'grabfood', 'shopeefood'];

/** Ringkasan untuk Tutup toko: ringkasan server (bila ada) + penjualan yang belum ada di server. */
export function ringkasanLokal(dasar: Ringkasan | null, shift: Shift, lokal: PenjualanLokal[]): Ringkasan {
	const per = Object.fromEntries(METODE.map((m) => [m, { ...(dasar?.per_metode[m] ?? { jumlah: 0, total: 0 }) }])) as Ringkasan['per_metode'];
	let jumlah = dasar?.jumlah_transaksi ?? 0;
	let total = dasar?.total ?? 0;
	let cash = (dasar?.cash_seharusnya ?? shift.modal) - shift.modal;
	for (const p of lokal.filter((x) => x.status_kirim !== 'server' && x.status_kirim !== 'terkirim' && !x.void_at)) {
		per[p.metode].jumlah++;
		per[p.metode].total += p.total;
		jumlah++;
		total += p.total;
		if (p.metode === 'cash') cash += p.total;
	}
	return {
		shift_id: shift.id,
		outlet_id: shift.outlet_id,
		modal: shift.modal,
		dibuka_at: shift.dibuka_at,
		ditutup_at: null,
		jumlah_transaksi: jumlah,
		jumlah_void: dasar?.jumlah_void ?? 0,
		total,
		per_metode: per,
		cash_seharusnya: shift.modal + cash,
		uang_fisik: null,
		selisih: null
	};
}

export function cocokCari(p: PenjualanLokal, q: string): boolean {
	const t = q.trim().toUpperCase();
	if (!t) return true;
	return [p.nomor, p.nomor_sementara, p.kode_struk].some((x) => !!x && x.toUpperCase().includes(t));
}
