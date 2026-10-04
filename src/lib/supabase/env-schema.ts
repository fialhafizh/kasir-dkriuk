// Validator variabel lingkungan Supabase; dipakai src/env.ts saat build.
// Tujuannya: build gagal dengan pesan jelas, bukan aplikasi yang diam-diam rusak di toko.

const PLACEHOLDER = /x{6,}|\.\.\.$/;

export function cekSupabaseUrl(value: string | undefined): string {
	if (!value) throw new Error('PUBLIC_SUPABASE_URL belum diisi di .env.local.');
	if (PLACEHOLDER.test(value)) throw new Error('PUBLIC_SUPABASE_URL masih berisi nilai contoh dari .env.example.');
	if (!value.startsWith('https://')) throw new Error('PUBLIC_SUPABASE_URL harus diawali https://.');
	return value.replace(/\/+$/, '');
}

function peranJwt(token: string): string | null {
	try {
		const payload = token.split('.')[1];
		const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
		return (JSON.parse(json) as { role?: string }).role ?? null;
	} catch {
		return null;
	}
}

export function cekKunciPublik(value: string | undefined): string {
	if (!value) throw new Error('PUBLIC_SUPABASE_ANON_KEY belum diisi di .env.local.');
	if (PLACEHOLDER.test(value)) throw new Error('PUBLIC_SUPABASE_ANON_KEY masih berisi nilai contoh dari .env.example.');
	if (value.startsWith('sb_secret_') || (value.startsWith('eyJ') && peranJwt(value) === 'service_role')) {
		throw new Error('PUBLIC_SUPABASE_ANON_KEY berisi kunci rahasia (service role). Pakai kunci publishable/anon.');
	}
	return value;
}
