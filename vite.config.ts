import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter({ pages: 'build', assets: 'build' }),
			// GitHub Pages menyajikan dari subfolder (/kasir-dkriuk); kosong saat dev lokal.
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` },
			// Hash router: GitHub Pages cukup menyajikan index.html, tanpa trik 404.
			router: { type: 'hash' }
		})
	],
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		environment: 'node',
		testTimeout: 30000
	}
});
