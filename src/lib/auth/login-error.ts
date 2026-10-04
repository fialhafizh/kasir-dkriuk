export function pesanErrorLogin(err: { message?: string; status?: number } | null): string | null {
	if (!err) return null;
	const msg = (err.message ?? '').toLowerCase();
	if (msg.includes('invalid login credentials')) return 'Username atau password salah.';
	if (msg.includes('failed to fetch') || msg.includes('network')) {
		return 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.';
	}
	if (err.status === 429) return 'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.';
	return 'Login gagal. Coba lagi beberapa saat lagi.';
}
