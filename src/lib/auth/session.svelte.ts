import { supabase } from '#lib/supabase/client.ts';
import { AuthState } from './auth-state.svelte.ts';

/** Satu-satunya status sesi aplikasi, terhubung ke project Supabase sungguhan. */
export const auth = new AuthState(supabase);
