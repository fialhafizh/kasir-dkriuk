// Saldo laci untuk layar kasir: dari server (lalu disimpan) atau salinan, ditambah antrean perangkat.
import { galatJaringan } from '#lib/auth/cache-profil.ts';
import { saldoLaciLokal } from '#lib/offline/proyeksi-laci.ts';
import { denganSalinan } from '#lib/offline/salinan.ts';
import { dbKasir } from '#lib/offline/sinkron.svelte.ts';
import { muatSaldoLaci } from './api.ts';

export interface SaldoLaci {
	saldo: number;
	adaAwal: boolean;
	dariSalinan: boolean;
}

/** null bila belum pernah tersimpan dan sedang offline. */
export async function saldoLaciPerangkat(outletId: string): Promise<SaldoLaci | null> {
	let server: Awaited<ReturnType<typeof muatSaldoLaci>> | null = null;
	let disimpanAt: string | null = null;
	let dariSalinan = false;
	try {
		const r = await denganSalinan(dbKasir, `laci:${outletId}`, () => muatSaldoLaci(outletId), (e) => galatJaringan(e as { message?: string }));
		server = r.nilai;
		disimpanAt = r.disimpanAt;
		dariSalinan = r.dariSalinan;
	} catch {
		return null;
	}
	const kejadian = await dbKasir.kejadian.toArray().catch(() => []);
	return { ...saldoLaciLokal(server, kejadian, outletId, disimpanAt), dariSalinan };
}
