// Kejadian antrean → RPC *_offline. Galat jaringan/sesi = coba lagi nanti; selainnya = ditolak.
import { galatJaringan } from '#lib/auth/cache-profil.ts';
import { supabase } from '#lib/supabase/client.ts';
import { GalatKirim, type Pengirim } from './antrean.ts';
import type { Kejadian } from './db.ts';
import { pesanSinkron } from './pesan.ts';

type Galat = { code?: string; message?: string; status?: number; name?: string };

function sesiBermasalah(e: Galat): boolean {
	// PGRST202: fungsi belum ada di server (aplikasi lebih baru dari database) → tunggu, jangan ditolak.
	return e.status === 401 || e.code === 'PGRST301' || e.code === 'PGRST303' || e.code === 'PGRST202' || (e.status ?? 0) >= 500;
}

export function pengirimSupabase(perangkatId: string): Pengirim {
	return {
		async kirim(k: Kejadian) {
			const dasar = { ...k.data, outlet_id: k.outlet_id, waktu: k.waktu, perangkat_id: perangkatId };
			// Koneksi menggantung tidak boleh menahan sinkron selamanya.
			const batas = AbortSignal.timeout(15_000);
			const panggil = () => {
				switch (k.jenis) {
					case 'buka_shift':
						return supabase.rpc('buka_shift_offline', { p: { ...dasar, id: k.shift_id } }).abortSignal(batas);
					case 'jual':
						return supabase.rpc('catat_penjualan_offline', { p: { ...dasar, id: k.id, shift_id: k.shift_id } }).abortSignal(batas);
					case 'tutup_shift':
						return supabase.rpc('tutup_shift_offline', { p: { ...dasar, id: k.id, shift_id: k.shift_id } }).abortSignal(batas);
					case 'rusak':
						return supabase.rpc('catat_rusak_offline', { p: { ...dasar, id: k.id } }).abortSignal(batas);
					case 'batal_jual':
						return supabase.rpc('void_penjualan_offline', { p: dasar }).abortSignal(batas);
					case 'kirim_transfer':
						return supabase.rpc('kirim_transfer_offline', { p: { ...dasar, id: k.id, dari_outlet_id: k.outlet_id } }).abortSignal(batas);
					case 'ubah_transfer':
						return supabase.rpc('ubah_transfer_offline', { p: dasar }).abortSignal(batas);
					case 'batal_transfer':
						return supabase.rpc('batal_transfer_offline', { p: dasar }).abortSignal(batas);
					case 'terima_transfer':
						return supabase.rpc('terima_transfer_offline', { p: dasar }).abortSignal(batas);
					case 'opname':
						return supabase.rpc('ajukan_opname_offline', { p: { ...dasar, id: k.id } }).abortSignal(batas);
					case 'stok_awal':
						return supabase.rpc('ajukan_stok_awal_offline', { p: { ...dasar, id: k.id } }).abortSignal(batas);
					case 'pengeluaran':
						return supabase.rpc('catat_pengeluaran_offline', { p: { ...dasar, id: k.id } }).abortSignal(batas);
					case 'kasbon':
						return supabase.rpc('catat_kasbon_offline', { p: { ...dasar, id: k.id } }).abortSignal(batas);
					case 'setoran':
						return supabase.rpc('catat_setoran_offline', { p: { ...dasar, id: k.id } }).abortSignal(batas);
					default: {
						const tidakDikenal: never = k.jenis;
						throw new GalatKirim(`Jenis kejadian tidak dikenal: ${String(tidakDikenal)}`, false);
					}
				}
			};
			let res: { data: unknown; error: Galat | null; status?: number };
			try {
				res = (await panggil()) as typeof res;
			} catch (e) {
				if (e instanceof GalatKirim) throw e;
				throw new GalatKirim((e as Error).message, true);
			}
			if (res.error) {
				const g = { ...res.error, status: res.error.status ?? res.status };
				const habisWaktu = g.name === 'AbortError' || g.name === 'TimeoutError' || /abort/i.test(g.message ?? '');
				if (habisWaktu || galatJaringan(g) || sesiBermasalah(g)) throw new GalatKirim('Tidak bisa terhubung ke server.', true);
				throw new GalatKirim(pesanSinkron(g), false);
			}
			return res.data;
		}
	};
}
