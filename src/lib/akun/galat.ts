import { pesanErrorData } from '#lib/master/pesan.ts';

/** Pesan untuk pengguna dari galat functions.invoke: pakai pesan server bila ada, selain itu pesan umum. */
export async function bacaGalatFungsi(galat: { message?: string }, res: Response | undefined): Promise<string> {
	if (!res) return pesanErrorData({ message: 'Failed to fetch', status: 0 }) ?? 'Gagal menghubungi server.';
	try {
		const isi = (await res.json()) as { error?: unknown };
		if (typeof isi?.error === 'string' && isi.error) return isi.error;
	} catch {
		// bukan JSON (mis. halaman galat gateway)
	}
	return pesanErrorData({ message: galat.message, status: res.status }) ?? 'Gagal menghubungi server.';
}
