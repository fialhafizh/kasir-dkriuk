import { auth } from '#lib/auth/session.svelte.ts';
import type { Outlet } from '#lib/types/db.ts';
import { shiftTerbuka } from './api.ts';
import type { Shift } from './types.ts';

const KUNCI = 'dk-outlet-admin';

/** Status bersama halaman kasir: outlet yang dilayani & shift terbukanya. */
class PosState {
	pilihanAdmin = $state<Outlet | null>(null);
	shift = $state<Shift | null>(null);
	status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	pesan = $state('');
	// Hasil muat untuk outlet lama yang telat datang diabaikan (admin berganti outlet dengan cepat).
	#gen = 0;

	/** Kasir: outlet akunnya. Admin: outlet yang dipilih di perangkat ini. */
	get outlet(): Outlet | null {
		return auth.profile?.role === 'kasir' ? auth.outlet : this.pilihanAdmin;
	}

	pilihOutlet(o: Outlet | null) {
		this.pilihanAdmin = o;
		this.shift = null;
		this.status = 'memuat';
		this.pesan = '';
		try {
			if (o) localStorage.setItem(KUNCI, o.id);
			else localStorage.removeItem(KUNCI);
		} catch {
			// abaikan
		}
	}

	outletTersimpan(): string | null {
		try {
			return localStorage.getItem(KUNCI);
		} catch {
			return null;
		}
	}

	async muatShift(): Promise<void> {
		const o = this.outlet;
		if (!o) return;
		const gen = ++this.#gen;
		this.status = 'memuat';
		try {
			const s = await shiftTerbuka(o.id);
			if (gen !== this.#gen) return;
			this.shift = s;
			this.pesan = '';
			this.status = 'siap';
		} catch (e) {
			if (gen !== this.#gen) return;
			this.pesan = (e as Error).message;
			// Shift outlet ini sudah diketahui: gangguan sesaat tidak boleh menutup layar jualan.
			this.status = this.shift?.outlet_id === o.id ? 'siap' : 'gagal';
		}
	}
}

export const pos = new PosState();
