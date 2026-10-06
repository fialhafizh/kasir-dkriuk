// Layar stok kasir dari data server (salinan) + antrean perangkat (logika murni, teruji).
import type { ItemHitung, Transfer } from '#lib/stok/types.ts';
import type { Kejadian } from './db.ts';
import { belumTercermin } from './proyeksi.ts';

export interface BarisResep {
	menu_id: string;
	bahan_id: string;
	qty: number;
}

const item = (k: Kejadian): ItemHitung[] => (Array.isArray(k.data.item) ? (k.data.item as ItemHitung[]) : []);
const urut = (xs: Kejadian[]) => [...xs].sort((a, b) => (a.urut ?? 0) - (b.urut ?? 0));

/** Penjualan yang dibatalkan lewat antrean (menunggu/terkirim): stoknya tidak dipotong di perangkat. */
function jualDibatalkan(kejadian: Kejadian[]): Set<string> {
	return new Set(
		kejadian.filter((k) => k.jenis === 'batal_jual' && (k.status === 'menunggu' || k.status === 'terkirim')).map((k) => String(k.data.penjualan_id ?? ''))
	);
}

/**
 * Stok perangkat = stok server + kejadian outlet ini yang belum tercermin: jual (menurut resep), rusak (−),
 * terima kiriman (+). Kirim tidak mengubah stok sampai diterima; batal atas transaksi server menunggu sinkron.
 */
export function stokLokal(server: Map<string, number>, kejadian: Kejadian[], resep: BarisResep[], outletId: string, disimpanAt: string | null): Map<string, number> {
	const hasil = new Map(server);
	const ubah = (bahan: string, qty: number) => hasil.set(bahan, (hasil.get(bahan) ?? 0) + qty);
	const perMenu = new Map<string, BarisResep[]>();
	for (const r of resep) perMenu.set(r.menu_id, [...(perMenu.get(r.menu_id) ?? []), r]);
	const batal = jualDibatalkan(kejadian);
	for (const k of kejadian) {
		if (k.outlet_id !== outletId || !belumTercermin(k, disimpanAt)) continue;
		if (k.jenis === 'jual' && !batal.has(k.id)) {
			for (const i of (k.data.item as { menu_id: string; qty: number }[] | undefined) ?? []) {
				for (const r of perMenu.get(i.menu_id) ?? []) ubah(r.bahan_id, -i.qty * r.qty);
			}
		} else if (k.jenis === 'rusak') {
			for (const i of item(k)) ubah(i.bahan_id, -i.qty);
		} else if (k.jenis === 'terima_transfer') {
			for (const i of item(k)) ubah(i.bahan_id, i.qty);
		}
	}
	return hasil;
}

export type TransferLokal = Transfer & { lokal: boolean };

/** Daftar transfer outlet ini setelah kirim/ubah/batal/terima di antrean diterapkan. */
export function transferLokal(server: Transfer[], kejadian: Kejadian[], outletId: string, disimpanAt: string | null): TransferLokal[] {
	const per = new Map<string, TransferLokal>(server.map((t) => [t.id, { ...t, lokal: false }]));
	for (const k of urut(kejadian)) {
		if (k.outlet_id !== outletId || !belumTercermin(k, disimpanAt)) continue;
		const id = k.jenis === 'kirim_transfer' ? k.id : String(k.data.transfer_id ?? '');
		const t = per.get(id);
		if (k.jenis === 'kirim_transfer' && !t) {
			per.set(id, {
				id,
				dari_outlet_id: outletId,
				ke_outlet_id: String(k.data.ke_outlet_id),
				status: 'dikirim',
				catatan: (k.data.catatan as string | undefined) ?? null,
				dikirim_at: k.waktu,
				diterima_at: null,
				batal_alasan: null,
				item: item(k),
				lokal: true
			});
		} else if (t && k.jenis === 'ubah_transfer') {
			per.set(id, { ...t, item: item(k), catatan: (k.data.catatan as string | null) ?? t.catatan, lokal: true });
		} else if (t && k.jenis === 'batal_transfer') {
			per.set(id, { ...t, status: 'dibatalkan', batal_alasan: String(k.data.alasan ?? ''), lokal: true });
		} else if (t && k.jenis === 'terima_transfer') {
			per.set(id, { ...t, status: 'diterima', diterima_at: k.waktu, lokal: true });
		}
	}
	return [...per.values()].sort((a, b) => b.dikirim_at.localeCompare(a.dikirim_at));
}

/** Opname / stok awal yang sudah dihitung di perangkat tampil "diajukan" (menunggu admin). */
export function hitunganLokal<T extends { id: string; outlet_id: string; status: string; dihitung_at: string; catatan: string | null }>(
	server: T[],
	kejadian: Kejadian[],
	jenis: 'opname' | 'stok_awal',
	outletId: string,
	disimpanAt: string | null
): T[] {
	const ada = new Set(server.map((x) => x.id));
	const baru = kejadian
		.filter((k) => k.jenis === jenis && k.outlet_id === outletId && !ada.has(k.id) && belumTercermin(k, disimpanAt))
		.map(
			(k) =>
				({
					id: k.id,
					outlet_id: outletId,
					status: 'diajukan',
					dihitung_at: k.waktu,
					catatan: null,
					// Stok awal menampilkan isiannya; opname tidak punya kolom item di daftar.
					...(jenis === 'stok_awal' ? { item: item(k).map((i) => ({ bahan_id: i.bahan_id, qty_hitung: i.qty })) } : {})
				}) as unknown as T
		);
	return [...baru, ...server].sort((a, b) => b.dihitung_at.localeCompare(a.dihitung_at));
}

/** Ada kejadian outlet ini yang belum terkirim → angka stok di layar masih perkiraan. */
export function antreanOutlet(kejadian: Kejadian[], outletId: string): number {
	return kejadian.filter((k) => k.outlet_id === outletId && k.status === 'menunggu').length;
}
