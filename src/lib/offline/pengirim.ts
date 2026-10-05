// Kejadian antrean → RPC *_offline. Galat jaringan/sesi = coba lagi nanti; selainnya = ditolak.
import { galatJaringan } from '#lib/auth/cache-profil.ts';
import { supabase } from '#lib/supabase/client.ts';
import { GalatKirim, type Pengirim } from './antrean.ts';
import type { Kejadian } from './db.ts';
import { pesanSinkron } from './pesan.ts';

type Galat = { code?: string; message?: string; status?: number; name?: string };

function sesiBermasalah(e: Galat): boolean {
	return e.status === 401 || e.code === 'PGRST301' || e.code === 'PGRST303' || (e.status ?? 0) >= 500;
}

export function pengirimSupabase(perangkatId: string): Pengirim {
	return {
		async kirim(k: Kejadian) {
			const dasar = { ...k.data, outlet_id: k.outlet_id, waktu: k.waktu, perangkat_id: perangkatId };
			const panggil = () => {
				switch (k.jenis) {
					case 'buka_shift':
						return supabase.rpc('buka_shift_offline', { p: { ...dasar, id: k.shift_id } });
					case 'jual':
						return supabase.rpc('catat_penjualan_offline', { p: { ...dasar, id: k.id, shift_id: k.shift_id } });
					case 'tutup_shift':
						return supabase.rpc('tutup_shift_offline', { p: { ...dasar, id: k.id, shift_id: k.shift_id } });
					case 'rusak':
						return supabase.rpc('catat_rusak_offline', { p: { ...dasar, id: k.id } });
				}
			};
			let res: { data: unknown; error: Galat | null; status?: number };
			try {
				res = (await panggil()) as typeof res;
			} catch (e) {
				throw new GalatKirim((e as Error).message, true);
			}
			if (res.error) {
				const g = { ...res.error, status: res.error.status ?? res.status };
				if (galatJaringan(g) || sesiBermasalah(g)) throw new GalatKirim('Tidak bisa terhubung ke server.', true);
				throw new GalatKirim(pesanSinkron(g), false);
			}
			return res.data;
		}
	};
}
