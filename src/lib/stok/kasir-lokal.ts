// Data halaman stok kasir: dari server bila online (lalu disimpan di perangkat), dari salinan bila offline,
// lalu disesuaikan dengan antrean perangkat (rusak, kirim/terima, opname, stok awal, jualan).
import { galatJaringan } from '#lib/auth/cache-profil.ts';
import { muatOutlets, muatResep } from '#lib/master/api.ts';
import type { Kejadian } from '#lib/offline/db.ts';
import { antreanOutlet, hitunganLokal, stokLokal, transferLokal, type TransferLokal } from '#lib/offline/proyeksi-stok.ts';
import { denganSalinan } from '#lib/offline/salinan.ts';
import { dbKasir } from '#lib/offline/sinkron.svelte.ts';
import type { Outlet } from '#lib/types/db.ts';
import { muatOpname, muatTransfer } from './api-lanjut.ts';
import { muatDataStok, muatStok, muatStokAwal, petaStok, type DataStok } from './api.ts';
import type { Opname, StokAwal } from './types.ts';

export interface StokKasir {
	data: DataStok;
	outlets: Outlet[];
	stok: Map<string, number>;
	awal: StokAwal[];
	opname: Opname[];
	transfer: TransferLokal[];
	/** Jam data server tertua yang dipakai bila sebagian dari salinan perangkat; null bila semua baru. */
	salinanAt: string | null;
	/** Jumlah kejadian outlet ini yang belum terkirim (angka stok masih perkiraan). */
	belumTerkirim: number;
}

const jaringan = (e: unknown) => galatJaringan(e as { message?: string });

export async function muatStokKasir(outletId: string): Promise<StokKasir> {
	const ambil = <T>(kunci: string, f: () => Promise<T>) => denganSalinan(dbKasir, kunci, f, jaringan);
	const [data, outlets, resep, stok, awal, opname, transfer] = await Promise.all([
		ambil('data-stok', muatDataStok),
		ambil('outlets', muatOutlets),
		ambil('resep', muatResep),
		ambil(`stok:${outletId}`, () => muatStok(outletId)),
		ambil(`stok-awal:${outletId}`, () => muatStokAwal(outletId)),
		ambil(`opname:${outletId}`, () => muatOpname(outletId)),
		ambil(`transfer:${outletId}`, () => muatTransfer(outletId))
	]);
	let kejadian: Kejadian[] = [];
	try {
		kejadian = await dbKasir.kejadian.toArray();
	} catch {
		// Penyimpanan perangkat tidak tersedia: tampilkan data server saja.
	}
	const dariSalinan = [data, outlets, resep, stok, awal, opname, transfer].filter((x) => x.dariSalinan);
	return {
		data: data.nilai,
		outlets: outlets.nilai,
		stok: stokLokal(petaStok(stok.nilai, outletId), kejadian, resep.nilai, outletId, stok.disimpanAt),
		awal: hitunganLokal(awal.nilai, kejadian, 'stok_awal', outletId, awal.disimpanAt),
		opname: hitunganLokal(opname.nilai, kejadian, 'opname', outletId, opname.disimpanAt),
		transfer: transferLokal(transfer.nilai, kejadian, outletId, transfer.disimpanAt),
		salinanAt: dariSalinan.length ? dariSalinan.map((x) => x.disimpanAt).sort()[0] : null,
		belumTerkirim: antreanOutlet(kejadian, outletId)
	};
}
