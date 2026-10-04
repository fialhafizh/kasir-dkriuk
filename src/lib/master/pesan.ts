export function pesanErrorData(err: { code?: string; message?: string; status?: number; name?: string } | null): string | null {
	if (!err) return null;
	const msg = err.message ?? '';
	if (err.code === '42501') return 'Anda tidak punya izin untuk perubahan ini.';
	if (err.code === '22023' && msg) return msg.endsWith('.') ? msg : `${msg}.`;
	if (err.code === '23505') return 'Ada data ganda. Periksa isian Anda.';
	if (err.code === '23514') return 'Isian di luar batas yang diizinkan.';
	if (/failed to fetch|network|load failed/i.test(msg) || err.status === 0) {
		return 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.';
	}
	return 'Gagal menyimpan. Coba lagi beberapa saat lagi.';
}
