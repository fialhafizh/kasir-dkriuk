/** Opsi client Supabase. Aplikasi tidak memakai magic link/OAuth, jadi token di URL tidak pernah dibaca. */
export const CLIENT_OPTIONS = {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: false,
		storageKey: 'dk-auth'
	}
} as const;
