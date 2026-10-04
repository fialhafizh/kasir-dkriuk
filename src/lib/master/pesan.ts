// Pesan berbahasa Indonesia dari fungsi SQL kita sendiri (22023) boleh diteruskan apa adanya.
const PESAN_SENDIRI = /^(Resep|Isi satuan beli|Hanya admin)/;

export function pesanErrorData(err: { code?: string; message?: string; status?: number; name?: string } | null): string | null {
	if (!err) return null;
	const msg = err.message ?? '';
	switch (err.code) {
		case '42501':
			return 'Anda tidak punya izin untuk perubahan ini.';
		case '22023':
			return PESAN_SENDIRI.test(msg) ? (msg.endsWith('.') ? msg : `${msg}.`) : 'Isian tidak sah.';
		case '23505':
			return 'Ada data ganda. Periksa isian Anda.';
		case '23514':
			return 'Isian di luar batas yang diizinkan.';
		case '23503':
			return 'Bahan, menu, atau outlet terkait sudah tidak ada. Muat ulang halaman.';
		case 'PGRST116':
			return 'Data tidak ditemukan atau Anda tidak punya izin mengubahnya. Muat ulang halaman.';
		case 'PGRST301':
		case 'PGRST303':
			return 'Sesi berakhir. Silakan keluar lalu masuk lagi.';
	}
	if (/failed to fetch|network|load failed/i.test(msg) || err.status === 0) {
		return 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.';
	}
	return 'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.';
}
