import { defineEnvVars } from '@sveltejs/kit/env';
import { cekKunciPublik, cekSupabaseUrl } from './lib/supabase/env-schema.ts';

// Situs statis (GitHub Pages): nilai publik ditanam saat build.
export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: {
		public: true,
		static: true,
		schema: cekSupabaseUrl,
		description: 'URL project Supabase, mis. https://abcd.supabase.co'
	},
	PUBLIC_SUPABASE_ANON_KEY: {
		public: true,
		static: true,
		schema: cekKunciPublik,
		description: 'Kunci publishable/anon Supabase (aman publik karena dilindungi RLS)'
	}
});
