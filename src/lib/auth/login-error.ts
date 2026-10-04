/** Bentuk error dari @supabase/auth-js (AuthApiError / AuthRetryableFetchError). */
export interface AuthErrorLike {
	message?: string;
	status?: number;
	code?: string;
	name?: string;
}

export function pesanErrorLogin(err: AuthErrorLike | null): string | null {
	if (!err) return null;
	const msg = (err.message ?? '').toLowerCase();

	if (err.code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
		return 'Username atau password salah.';
	}
	if (err.code === 'user_banned' || err.code === 'email_not_confirmed') {
		return 'Akun ini tidak bisa dipakai masuk. Hubungi admin.';
	}
	if (err.status === 429 || err.code === 'over_request_rate_limit') {
		return 'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.';
	}
	const gagalJaringan = err.name === 'AuthRetryableFetchError' || err.status === 0;
	if ((gagalJaringan && !err.status) || msg.includes('failed to fetch') || msg.includes('network')) {
		return 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.';
	}
	if (gagalJaringan) return 'Server sedang gangguan. Coba lagi beberapa saat lagi.';
	return 'Login gagal. Coba lagi beberapa saat lagi.';
}
