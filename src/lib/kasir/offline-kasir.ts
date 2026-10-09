// Membentuk kejadian antrean dari tindakan kasir (logika murni, teruji).
import type { Kejadian } from '#lib/offline/db.ts';
import { kodeStruk } from '#lib/offline/nomor.ts';
import type { AlasanRusak, ItemHitung } from '#lib/stok/types.ts';
import { totalKeranjang } from './keranjang.ts';
import type { BarisKeranjang, Metode } from './types.ts';

type KejadianBaru = Pick<Kejadian, 'id' | 'jenis' | 'outlet_id' | 'shift_id' | 'waktu' | 'data'>;

export function buatKejadianJual(a: {
	id: string;
	outletId: string;
	shiftId: string;
	metode: Metode;
	diterima: number | null;
	keranjang: BarisKeranjang[];
	waktu: Date;
}): { kejadian: KejadianBaru; total: number; kembalian: number | null; kodeStruk: string } {
	const total = totalKeranjang(a.keranjang);
	const cash = a.metode === 'cash';
	const kode = kodeStruk(a.id);
	return {
		total,
		kembalian: cash && a.diterima !== null ? a.diterima - total : null,
		kodeStruk: kode,
		kejadian: {
			id: a.id,
			jenis: 'jual',
			outlet_id: a.outletId,
			shift_id: a.shiftId,
			waktu: a.waktu.toISOString(),
			data: {
				metode: a.metode,
				...(cash && a.diterima !== null ? { diterima: a.diterima, kembalian: a.diterima - total } : {}),
				total,
				kode_struk: kode,
				item: a.keranjang.map((b) => ({ menu_id: b.menu_id, nama: b.nama, harga: b.harga, qty: b.qty }))
			}
		}
	};
}

/** modal = uang laci saat buka (perkiraan perangkat); laciAwal diisi hanya saat outlet belum punya uang laci awal. */
export function buatKejadianBuka(outletId: string, modal: number, waktu: Date, laciAwal?: number): KejadianBaru {
	const shiftId = crypto.randomUUID();
	return {
		id: crypto.randomUUID(),
		jenis: 'buka_shift',
		outlet_id: outletId,
		shift_id: shiftId,
		waktu: waktu.toISOString(),
		data: { shift_id: shiftId, modal: Math.max(0, modal), ...(laciAwal !== undefined ? { laci_awal: laciAwal } : {}) }
	};
}

export function buatKejadianTutup(outletId: string, shiftId: string, uang: number, catatan: string, waktu: Date): KejadianBaru {
	return { id: crypto.randomUUID(), jenis: 'tutup_shift', outlet_id: outletId, shift_id: shiftId, waktu: waktu.toISOString(), data: { uang_fisik: uang, catatan } };
}

export function buatKejadianRusak(outletId: string, alasan: AlasanRusak, item: ItemHitung[], waktu: Date, catatan?: string): KejadianBaru {
	return {
		id: crypto.randomUUID(),
		jenis: 'rusak',
		outlet_id: outletId,
		shift_id: null,
		waktu: waktu.toISOString(),
		data: { alasan, item, ...(catatan ? { catatan } : {}) }
	};
}

/** Batal transaksi; shift_id = shift penjualan supaya ikut tertahan bila buka toko-nya ditolak. */
/** penjualan (metode & total) ikut disimpan supaya saldo laci di perangkat bisa dikurangi sebelum sinkron. */
export function buatKejadianBatal(
	outletId: string,
	shiftId: string | null,
	penjualanId: string,
	alasan: string,
	waktu: Date,
	penjualan?: { metode: Metode; total: number }
): KejadianBaru {
	return {
		id: crypto.randomUUID(),
		jenis: 'batal_jual',
		outlet_id: outletId,
		shift_id: shiftId,
		waktu: waktu.toISOString(),
		data: { penjualan_id: penjualanId, alasan: alasan.trim(), ...(penjualan ? { metode: penjualan.metode, total: penjualan.total } : {}) }
	};
}

/** Pengeluaran kecil dari laci (kategori kasir). */
export function buatKejadianPengeluaran(outletId: string, a: { kategoriId: string; jumlah: number; keterangan?: string }, waktu: Date): KejadianBaru {
	const ket = a.keterangan?.trim();
	return {
		id: crypto.randomUUID(),
		jenis: 'pengeluaran',
		outlet_id: outletId,
		shift_id: null,
		waktu: waktu.toISOString(),
		data: { kategori_id: a.kategoriId, jumlah: a.jumlah, ...(ket ? { keterangan: ket } : {}) }
	};
}

/** Kasbon karyawan dari laci (dipotong saat gajian). */
export function buatKejadianKasbon(outletId: string, a: { karyawanId: string; jumlah: number; keterangan?: string }, waktu: Date): KejadianBaru {
	const ket = a.keterangan?.trim();
	return {
		id: crypto.randomUUID(),
		jenis: 'kasbon',
		outlet_id: outletId,
		shift_id: null,
		waktu: waktu.toISOString(),
		data: { karyawan_id: a.karyawanId, jumlah: a.jumlah, ...(ket ? { keterangan: ket } : {}) }
	};
}

/** Setoran ke owner (uang keluar dari laci). */
export function buatKejadianSetoran(outletId: string, jumlah: number, catatan: string, waktu: Date): KejadianBaru {
	const c = catatan.trim();
	return { id: crypto.randomUUID(), jenis: 'setoran', outlet_id: outletId, shift_id: null, waktu: waktu.toISOString(), data: { jumlah, ...(c ? { catatan: c } : {}) } };
}

/** Kirim ke outlet lain: id kejadian = id transfer (kiriman ulang aman). */
export function buatKejadianKirim(outletId: string, a: { id?: string; keOutletId: string; item: ItemHitung[]; catatan?: string }, waktu: Date): KejadianBaru {
	const catatan = a.catatan?.trim();
	return {
		id: a.id ?? crypto.randomUUID(),
		jenis: 'kirim_transfer',
		outlet_id: outletId,
		shift_id: null,
		waktu: waktu.toISOString(),
		data: { ke_outlet_id: a.keOutletId, item: a.item, ...(catatan ? { catatan } : {}) }
	};
}

export function buatKejadianUbah(outletId: string, transferId: string, item: ItemHitung[], catatan: string | null, waktu: Date): KejadianBaru {
	return {
		id: crypto.randomUUID(),
		jenis: 'ubah_transfer',
		outlet_id: outletId,
		shift_id: null,
		waktu: waktu.toISOString(),
		data: { transfer_id: transferId, item, catatan: catatan?.trim() || null }
	};
}

export function buatKejadianBatalTransfer(outletId: string, transferId: string, alasan: string, waktu: Date): KejadianBaru {
	return {
		id: crypto.randomUUID(),
		jenis: 'batal_transfer',
		outlet_id: outletId,
		shift_id: null,
		waktu: waktu.toISOString(),
		data: { transfer_id: transferId, alasan: alasan.trim() }
	};
}

export function buatKejadianTerima(outletId: string, transferId: string, item: ItemHitung[], waktu: Date): KejadianBaru {
	return { id: crypto.randomUUID(), jenis: 'terima_transfer', outlet_id: outletId, shift_id: null, waktu: waktu.toISOString(), data: { transfer_id: transferId, item } };
}

/** Opname / stok awal: id kejadian = id hitungan di server; berlaku pada jam kasir menghitung. */
export function buatKejadianHitung(jenis: 'opname' | 'stok_awal', outletId: string, item: ItemHitung[], waktu: Date, id: string = crypto.randomUUID()): KejadianBaru {
	return { id, jenis, outlet_id: outletId, shift_id: null, waktu: waktu.toISOString(), data: { item } };
}
