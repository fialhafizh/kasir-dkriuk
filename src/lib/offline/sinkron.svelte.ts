// Status sinkron untuk layar kasir & pemicunya (online kembali, berkala, layar terlihat, tombol).
import { auth } from '#lib/auth/session.svelte.ts';
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
	/** Naik setiap ada kejadian terkirim (dan sekali saat sinkron pertama): pemicu muat ulang halaman. */
	versi = $state(0);
	online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
	#perangkat: string | null = null;
	#berjalan: Promise<void> | null = null;
	#mulai = false;
	#tandaiAt = 0;

	async segarkan() {
		const h = await hitungAntrean(dbKasir, auth.profile?.id ?? null);
		this.menunggu = h.menunggu;
		this.ditolak = h.ditolak;
	}

	/** Kirim antrean sekarang (tidak berjalan dua kali bersamaan). */
	jalankan(): Promise<void> {
		if (!this.#perangkat) return this.segarkan();
		this.#berjalan ??= (async () => {
			this.sedang = true;
			try {
				// Dua tab aplikasi tidak boleh mengirim antrean yang sama bersamaan.
				const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
				if (locks) await locks.request('dk-sinkron', { ifAvailable: true }, async (kunci) => (kunci ? this.#kirim() : undefined));
				else await this.#kirim();
			} catch {
				// Galat tak terduga (mis. penyimpanan): dicoba lagi pada pemicu berikutnya.
			} finally {
				this.sedang = false;
				this.#berjalan = null;
				await this.segarkan();
			}
		})();
		return this.#berjalan;
	}

	async #kirim() {
		const r = await kirimAntrean(dbKasir, pengirimSupabase(this.#perangkat!), auth.profile?.id ?? null);
		if (r.berhenti !== 'selesai') return;
		this.terakhir = new Date().toISOString();
		// Sinkron berkala (30 detik) dengan antrean kosong tidak boleh memicu muat ulang & tulis server terus-menerus.
		const pertama = this.versi === 0;
		if (r.terkirim > 0 || pertama) {
			this.versi++;
			await bersihkanTerkirim(dbKasir, new Date(Date.now() - 3 * 86_400_000));
		}
		if (r.terkirim > 0 || Date.now() - this.#tandaiAt > 5 * 60_000) {
			this.#tandaiAt = Date.now();
			await supabase.rpc('tandai_sinkron', { p_id: this.#perangkat });
		}
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
