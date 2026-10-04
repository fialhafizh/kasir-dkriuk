import { supabase } from '#lib/supabase/client.ts';
import { AuthState } from './auth-state.svelte.ts';

const penyimpan = typeof localStorage === 'undefined' ? null : localStorage;

/** Satu-satunya status sesi aplikasi, terhubung ke project Supabase sungguhan. */
export const auth = new AuthState(supabase, penyimpan);

if (typeof window !== 'undefined') {
	window.addEventListener('online', () => auth.cobaLagi());
}
