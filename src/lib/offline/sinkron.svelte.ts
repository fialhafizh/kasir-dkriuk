// Status sinkron untuk layar kasir & pemicunya (online kembali, berkala, layar terlihat, tombol).
import { supabase } from '#lib/supabase/client.ts';
import { bersihkanTerkirim, hitungAntrean, kirimAntrean } from './antrean.ts';
import { bukaDb } from './db.ts';
import { pengirimSupabase } from './pengirim.ts';

export const dbKasir = bukaDb();

class SinkronState {
	menunggu = $state(0);
	ditolak = $state(0);
	sedang = $state(false);
	terakhir = $state<string | null>(null);
	online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
	#perangkat: string | null = null;
	#berjalan: Promise<void> | null = null;
	#mulai = false;

	async segarkan() {
		const h = await hitungAntrean(dbKasir);
		this.menunggu = h.menunggu;
		this.ditolak = h.ditolak;
	}

	/** Kirim antrean sekarang (tidak berjalan dua kali bersamaan). */
	jalankan(): Promise<void> {
		if (!this.#perangkat) return this.segarkan();
		this.#berjalan ??= (async () => {
			this.sedang = true;
			try {
				const r = await kirimAntrean(dbKasir, pengirimSupabase(this.#perangkat!));
				if (r.berhenti === 'selesai') {
					this.terakhir = new Date().toISOString();
					await supabase.rpc('tandai_sinkron', { p_id: this.#perangkat });
					await bersihkanTerkirim(dbKasir, new Date(Date.now() - 3 * 86_400_000));
				}
			} finally {
				this.sedang = false;
				this.#berjalan = null;
				await this.segarkan();
			}
		})();
		return this.#berjalan;
	}

	mulai(perangkatId: string) {
		this.#perangkat = perangkatId;
		if (this.#mulai || typeof window === 'undefined') return;
		this.#mulai = true;
		window.addEventListener('online', () => {
			this.online = true;
			void this.jalankan();
		});
		window.addEventListener('offline', () => (this.online = false));
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') void this.jalankan();
		});
		setInterval(() => void this.jalankan(), 30_000);
		void this.jalankan();
	}
}

export const sinkron = new SinkronState();
