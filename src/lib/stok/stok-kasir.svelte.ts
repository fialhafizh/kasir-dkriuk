// Status data halaman stok kasir: dimuat saat outlet berganti dan setiap antrean berubah/terkirim.
import { galatJaringan } from '#lib/auth/cache-profil.ts';
import { pos } from '#lib/kasir/pos.svelte.ts';
import { sinkron } from '#lib/offline/sinkron.svelte.ts';
import { muatStokKasir, type StokKasir } from './kasir-lokal.ts';

export interface StatusStokKasir {
	nilai: StokKasir | null;
	status: 'memuat' | 'siap' | 'gagal';
	pesan: string;
	ulang: number;
}

/** Dipanggil saat komponen dibuat (memakai $effect). */
export function stokKasir(): StatusStokKasir {
	const st = $state<StatusStokKasir>({ nilai: null, status: 'memuat', pesan: '', ulang: 0 });
	let outletTerakhir: string | null = null;
	$effect(() => {
		const o = pos.outlet;
		void sinkron.versi;
		void sinkron.menunggu;
		void st.ulang;
		if (!o) return;
		if (o.id !== outletTerakhir) {
			// Data outlet lain tidak boleh tampil sebagai outlet ini.
			outletTerakhir = o.id;
			st.nilai = null;
			st.status = 'memuat';
		}
		// "Coba lagi" setelah gagal: tampilkan Memuat.
		if (!st.nilai) st.status = 'memuat';
		let batal = false;
		muatStokKasir(o.id)
			.then((v) => {
				if (batal) return;
				st.nilai = v;
				st.pesan = '';
				st.status = 'siap';
			})
			.catch((e) => {
				if (batal) return;
				const m = (e as Error).message;
				st.pesan = galatJaringan(e as Error) ? `${m} Halaman ini perlu dibuka sekali saat online supaya bisa dipakai tanpa internet.` : m;
				// Data yang sudah tampil tetap dipakai; gangguan sesaat tidak mengosongkan layar.
				if (!st.nilai) st.status = 'gagal';
			});
		return () => {
			batal = true;
		};
	});
	return st;
}
