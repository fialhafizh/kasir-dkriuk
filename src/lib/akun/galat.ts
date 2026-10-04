import { pesanErrorData } from '#lib/master/pesan.ts';

/**
 * Pesan untuk pengguna dari galat supabase.functions.invoke.
 * - FunctionsHttpError: context = Response → pakai pesan JSON dari fungsi server bila ada.
 * - FunctionsFetchError (jaringan putus): context = TypeError → pesan koneksi.
 */
export async function bacaGalatFungsi(galat: { name?: string; message?: string; context?: unknown }): Promise<string> {
	const res = galat.context instanceof Response ? galat.context : undefined;
	if (!res || galat.name === 'FunctionsFetchError') {
		return pesanErrorData({ message: 'Failed to fetch', status: 0 }) ?? 'Gagal menghubungi server.';
	}
	try {
		const isi = (await res.json()) as { error?: unknown };
		if (typeof isi?.error === 'string' && isi.error) return isi.error;
	} catch {
		// bukan JSON (mis. halaman galat gateway)
	}
	return pesanErrorData({ message: galat.message, status: res.status }) ?? 'Gagal menghubungi server.';
}
