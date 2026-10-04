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

	/** Kasir: outlet akunnya. Admin: outlet yang dipilih di perangkat ini. */
	get outlet(): Outlet | null {
		return auth.profile?.role === 'kasir' ? auth.outlet : this.pilihanAdmin;
	}

	pilihOutlet(o: Outlet | null) {
		this.pilihanAdmin = o;
		this.shift = null;
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
		this.status = 'memuat';
		try {
			this.shift = await shiftTerbuka(o.id);
			this.status = 'siap';
		} catch (e) {
			this.pesan = (e as Error).message;
			this.status = 'gagal';
		}
	}
}

export const pos = new PosState();
