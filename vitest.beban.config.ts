// Uji beban (Tahap 8): di luar tes harian. Jalankan: npm run uji:beban
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: { include: ['tests/beban/**/*.beban.ts'], environment: 'node', testTimeout: 900_000, hookTimeout: 900_000 }
});
