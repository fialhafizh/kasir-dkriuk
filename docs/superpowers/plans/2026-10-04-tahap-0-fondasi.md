# Tahap 0 — Fondasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kerangka aplikasi Kasir D'Kriuk yang bisa dibuka di HP/tablet: tema merah–kuning terang/gelap, login username + password, dan pengalihan halaman sesuai peran (admin / kasir), dengan database Supabase yang aturan aksesnya sudah teruji.

**Architecture:** SvelteKit SPA (adapter-static, hash router supaya jalan di GitHub Pages tanpa trik 404) memanggil Supabase langsung lewat `@supabase/supabase-js`. Keamanan dijaga Row Level Security di Postgres. Login memakai email sintetis `<username>@kasir-dkriuk.app` karena Supabase Auth berbasis email. Profil (peran + outlet) dibuat otomatis oleh trigger saat user Auth dibuat. Migrasi SQL diuji lokal dengan PGlite (Postgres WASM) karena Docker tidak tersedia.

**Tech Stack:** Node 24, SvelteKit 2 + Svelte 5 (runes), TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), `@supabase/supabase-js` v2, Vitest, `@electric-sql/pglite`, `@fontsource/lilita-one`, `@fontsource-variable/plus-jakarta-sans`, Supabase CLI via `npx supabase`.

**Spec:** `docs/superpowers/specs/2026-10-04-kasir-dkriuk-design.md` (§2 Outlet & akun, §10 Arsitektur, §13 Tahap 0). Roadmap: `docs/superpowers/plans/2026-10-04-00-roadmap.md`.

## Global Constraints

- Semua teks antarmuka berbahasa Indonesia.
- Maksimal 1000 baris per file; satu file satu tanggung jawab; struktur per fitur di `src/lib/<fitur>/`.
- Repo akan open source: **jangan pernah commit** `.env*` (kecuali `.env.example`), file `.xlsx`, `.txt` data bisnis, atau foto di root. Anon key Supabase boleh publik; service role key hanya di `.env.local` lokal.
- Login: **username + password**. Username dinormalisasi ke huruf kecil, pola `^[a-z0-9._-]{3,32}$`.
- Peran: `admin` (owner, semua outlet) dan `kasir` (terikat ke satu outlet). Akun kasir terikat ke outlet, bukan ke orang.
- Admin juga boleh membuka halaman kasir (spec §2: admin bisa input penjualan dengan memilih outlet). Kasir tidak boleh membuka halaman admin.
- Outlet: `BL` = D'Kriuk Bukit Lama, `TK` = D'Kriuk Talang Kerangga, `KP` = D'Krizzpy Kertapati. WA semua outlet: `+62 821-8388-6369`.
- Zona waktu bisnis: Asia/Jakarta (WIB).
- Tema: merah–kuning D'Kriuk, mode terang dan gelap, plus mode "Otomatis" mengikuti sistem.
- Tampilan harus nyaman di HP (≥360 px) dan tablet landscape. Target sentuh minimal 48 px.
- Git commit diakhiri baris: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Username diketik dengan huruf besar atau spasi (`" Kasir.BukitLama "`) → tetap bisa login sebagai `kasir.bukitlama`. Diuji di Task 4 (`username.test.ts`).
2. Kasir mengetik alamat `#/admin` secara manual → dialihkan ke `/kasir`, bukan melihat halaman admin. Diuji di Task 4 (`guard.test.ts`).
3. Kasir mencoba menaikkan perannya sendiri ke `admin` lewat API dengan anon key → ditolak database. Diuji di Task 3 (`core.test.ts`).
4. Akun yang dinonaktifkan admin (`aktif = false`) → tidak lagi dianggap admin di database, dan dikeluarkan dari aplikasi. Diuji di Task 3 (`is_admin` nonaktif) dan Task 4 (`cekAkses` profil nonaktif).
5. Login gagal karena internet putus → pesan "Tidak bisa terhubung ke server…", bukan "password salah". Diuji di Task 4 (`login-error.test.ts`).

---

## File Structure

```
kasir-dkriuk/
├─ package.json, svelte.config.js, vite.config.ts, tsconfig.json
├─ .env.example                      # PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
├─ README.md                         # cara setup & menjalankan (Bahasa Indonesia)
├─ scripts/bootstrap-users.mjs       # membuat 4 akun awal (pakai service role, dijalankan lokal)
├─ static/favicon.jpg
├─ src/
│  ├─ app.html                       # skrip anti-kedip tema
│  ├─ app.css                        # Tailwind + token warna terang/gelap
│  ├─ app.d.ts
│  ├─ lib/
│  │  ├─ assets/brand/logo-icon.jpg, logo-wordmark.jpg
│  │  ├─ nav.ts                      # href('/x') → '#/x' (hash router)
│  │  ├─ types/db.ts                 # Role, Outlet, Profile
│  │  ├─ supabase/client.ts
│  │  ├─ theme/theme.ts              # fungsi murni tema (+ test)
│  │  ├─ theme/theme.svelte.ts       # state tema (runes)
│  │  ├─ auth/domain.js              # AUTH_EMAIL_DOMAIN (dipakai app & script)
│  │  ├─ auth/username.ts            # normalisasi/validasi/email (+ test)
│  │  ├─ auth/login-error.ts         # pesan error login (+ test)
│  │  ├─ auth/guard.ts               # cekAkses, homePathFor (+ test)
│  │  ├─ auth/session.svelte.ts      # state sesi (runes)
│  │  └─ components/
│  │     ├─ ui/Button.svelte, TextField.svelte
│  │     ├─ brand/Logo.svelte
│  │     ├─ theme/ThemeToggle.svelte
│  │     └─ layout/AppShell.svelte, SplashScreen.svelte
│  └─ routes/
│     ├─ +layout.ts, +layout.svelte, +page.svelte
│     ├─ login/+page.svelte
│     ├─ admin/+page.svelte
│     └─ kasir/+page.svelte
├─ supabase/
│  ├─ config.toml                    # dari `supabase init`
│  └─ migrations/
│     ├─ 20261004000001_core.sql     # enum, outlets, profiles, fungsi, trigger, RLS
│     └─ 20261004000002_seed_outlets.sql
└─ tests/db/
   ├─ auth-stub.sql                  # tiruan skema auth & role Supabase untuk PGlite
   ├─ harness.ts
   └─ core.test.ts
```

---

### Task 1: Scaffold SvelteKit + Tailwind + Vitest

**Files:**
- Create: `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, `src/app.d.ts`, `src/app.css`, `src/routes/+layout.ts`, `src/routes/+layout.svelte`, `src/routes/+page.svelte`, `.env.example`, `src/lib/nav.ts`
- Modify: `.gitignore`
- Test: `src/lib/nav.test.ts`

**Interfaces:**
- Produces: `href(path: string): string` di `src/lib/nav.ts`; skrip npm `dev`, `build`, `check`, `test`.

- [ ] **Step 1: Buat `package.json`**

```json
{
  "name": "kasir-dkriuk",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "prepare": "svelte-kit sync || echo ''",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Pasang dependensi**

Run:
```bash
npm install -D @sveltejs/kit @sveltejs/adapter-static @sveltejs/vite-plugin-svelte svelte svelte-check typescript vite vitest tailwindcss @tailwindcss/vite @electric-sql/pglite
npm install @supabase/supabase-js @fontsource/lilita-one @fontsource-variable/plus-jakarta-sans
```
Expected: selesai tanpa error; `node_modules/` terbentuk.

- [ ] **Step 3: Tulis konfigurasi**

`svelte.config.js`:
```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ pages: 'build', assets: 'build' }),
		// Hash router: GitHub Pages cukup menyajikan index.html, tanpa trik 404.
		router: { type: 'hash' }
	}
};
```

`vite.config.ts`:
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		environment: 'node',
		testTimeout: 30000
	}
});
```

`tsconfig.json`:
```json
{
	"extends": "./.svelte-kit/tsconfig.json",
	"compilerOptions": {
		"allowJs": true,
		"checkJs": true,
		"esModuleInterop": true,
		"forceConsistentCasingInFileNames": true,
		"resolveJsonModule": true,
		"skipLibCheck": true,
		"sourceMap": true,
		"strict": true,
		"moduleResolution": "bundler"
	}
}
```

`src/app.d.ts`:
```ts
declare global {
	namespace App {}
}
export {};
```

`.env.example`:
```bash
# Dipakai aplikasi (boleh publik, dilindungi RLS)
PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Hanya untuk script lokal (JANGAN commit nilai aslinya)
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Salin `.env.example` menjadi `.env.local` (sudah diabaikan git) supaya build lokal punya nilai placeholder:
```bash
cp .env.example .env.local
```

- [ ] **Step 4: Tambah aturan `.gitignore` untuk aset brand**

Ganti isi `.gitignore` menjadi:
```gitignore
# Data bisnis & materi referensi owner (jangan masuk repo publik)
*.xlsx
*.txt
/referensi/
*.jpg
!static/**/*.jpg
!src/lib/assets/**/*.jpg
.env
.env.*
!.env.example
node_modules/
.svelte-kit/
build/
supabase/.temp/
```

- [ ] **Step 5: Tulis kerangka halaman**

`src/app.html` (skrip kecil menerapkan tema sebelum render supaya tidak berkedip):
```html
<!doctype html>
<html lang="id">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
		<meta name="theme-color" content="#E3191F" />
		<link rel="icon" href="%sveltekit.assets%/favicon.jpg" />
		<title>Kasir D'Kriuk</title>
		<script>
			(function () {
				try {
					var p = localStorage.getItem('dk-theme') || 'system';
					var d = p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
					document.documentElement.dataset.theme = d ? 'dark' : 'light';
				} catch (e) {
					document.documentElement.dataset.theme = 'light';
				}
			})();
		</script>
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

`src/app.css` (sementara, token lengkap di Task 2):
```css
@import 'tailwindcss';
```

`src/routes/+layout.ts`:
```ts
export const ssr = false;
export const prerender = true;
```

`src/routes/+layout.svelte`:
```svelte
<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

{@render children()}
```

`src/routes/+page.svelte`:
```svelte
<h1 class="p-6 text-2xl font-bold">Kasir D'Kriuk</h1>
```

- [ ] **Step 6: Tulis test `href` yang gagal**

`src/lib/nav.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { href } from './nav';

describe('href', () => {
	it('mengubah path menjadi tautan hash', () => {
		expect(href('/admin')).toBe('#/admin');
	});
	it('menambahkan garis miring bila lupa', () => {
		expect(href('kasir')).toBe('#/kasir');
	});
});
```

- [ ] **Step 7: Jalankan test, pastikan gagal**

Run: `npx vitest run src/lib/nav.test.ts`
Expected: FAIL, `Failed to resolve import "./nav"`.

- [ ] **Step 8: Implementasi `href`**

`src/lib/nav.ts`:
```ts
/** Tautan untuk hash router SvelteKit: '/admin' → '#/admin'. */
export function href(path: string): string {
	return `#${path.startsWith('/') ? path : `/${path}`}`;
}
```

- [ ] **Step 9: Jalankan test, build, dan check**

Run: `npm test && npm run build && npm run check`
Expected: test PASS (2), build menghasilkan `build/index.html`, `svelte-check found 0 errors`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold SvelteKit + Tailwind + Vitest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Pastikan `git status` sebelum commit tidak memuat `.env.local`, `*.xlsx`, `*.txt`, atau `*.jpg` di root.

---

### Task 2: Tema D'Kriuk, aset brand, dan komponen dasar

**Files:**
- Create: `src/lib/theme/theme.ts`, `src/lib/theme/theme.svelte.ts`, `src/lib/components/theme/ThemeToggle.svelte`, `src/lib/components/brand/Logo.svelte`, `src/lib/components/ui/Button.svelte`, `src/lib/components/ui/TextField.svelte`, `src/lib/assets/brand/logo-icon.jpg`, `src/lib/assets/brand/logo-wordmark.jpg`, `static/favicon.jpg`
- Modify: `src/app.css`, `src/routes/+layout.svelte`, `src/routes/+page.svelte`
- Test: `src/lib/theme/theme.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type ThemePref = 'light' | 'dark' | 'system'`; `THEME_KEY = 'dk-theme'`; `parseThemePref(v: string | null): ThemePref`; `resolveTheme(pref: ThemePref, prefersDark: boolean): 'light' | 'dark'`; `nextThemePref(p: ThemePref): ThemePref`; `themeLabel(p: ThemePref): string`
  - `theme` (instance `ThemeState`: `pref`, `init()`, `set(p)`, `cycle()`)
  - Komponen: `<Button variant="primary|secondary|ghost" loading>`, `<TextField id label bind:value error type>`, `<Logo size="sm|md|lg" wordmark>`, `<ThemeToggle />`
  - Kelas Tailwind dari token: `bg-bg`, `bg-surface`, `bg-surface-2`, `text-fg`, `text-muted`, `border-line`, `bg-brand`, `text-brand`, `bg-brand-ink`, `text-on-brand`, `bg-accent`, `text-on-accent`, `text-danger`, `text-ok`, `text-warn`, `font-display`, `font-sans`

- [ ] **Step 1: Tulis test tema yang gagal**

`src/lib/theme/theme.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { nextThemePref, parseThemePref, resolveTheme, themeLabel } from './theme';

describe('parseThemePref', () => {
	it('menerima nilai yang dikenal', () => {
		expect(parseThemePref('dark')).toBe('dark');
		expect(parseThemePref('light')).toBe('light');
		expect(parseThemePref('system')).toBe('system');
	});
	it('nilai kosong atau rusak jadi system', () => {
		expect(parseThemePref(null)).toBe('system');
		expect(parseThemePref('ungu')).toBe('system');
	});
});

describe('resolveTheme', () => {
	it('system mengikuti preferensi perangkat', () => {
		expect(resolveTheme('system', true)).toBe('dark');
		expect(resolveTheme('system', false)).toBe('light');
	});
	it('pilihan eksplisit mengabaikan perangkat', () => {
		expect(resolveTheme('light', true)).toBe('light');
		expect(resolveTheme('dark', false)).toBe('dark');
	});
});

describe('nextThemePref & themeLabel', () => {
	it('berputar system → light → dark → system', () => {
		expect(nextThemePref('system')).toBe('light');
		expect(nextThemePref('light')).toBe('dark');
		expect(nextThemePref('dark')).toBe('system');
	});
	it('label berbahasa Indonesia', () => {
		expect(themeLabel('system')).toBe('Otomatis');
		expect(themeLabel('light')).toBe('Terang');
		expect(themeLabel('dark')).toBe('Gelap');
	});
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/lib/theme/theme.test.ts`
Expected: FAIL, `Failed to resolve import "./theme"`.

- [ ] **Step 3: Implementasi fungsi tema**

`src/lib/theme/theme.ts`:
```ts
export type ThemePref = 'light' | 'dark' | 'system';
export const THEME_KEY = 'dk-theme';

export function parseThemePref(v: string | null): ThemePref {
	return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

export function resolveTheme(pref: ThemePref, prefersDark: boolean): 'light' | 'dark' {
	if (pref === 'system') return prefersDark ? 'dark' : 'light';
	return pref;
}

export function nextThemePref(p: ThemePref): ThemePref {
	return p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system';
}

export function themeLabel(p: ThemePref): string {
	return p === 'system' ? 'Otomatis' : p === 'light' ? 'Terang' : 'Gelap';
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/lib/theme/theme.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: State tema (runes)**

`src/lib/theme/theme.svelte.ts`:
```ts
import { THEME_KEY, nextThemePref, parseThemePref, resolveTheme, type ThemePref } from './theme';

class ThemeState {
	pref = $state<ThemePref>('system');
	#mql: MediaQueryList | null = null;

	init() {
		try {
			this.pref = parseThemePref(localStorage.getItem(THEME_KEY));
		} catch {
			this.pref = 'system';
		}
		this.#mql = matchMedia('(prefers-color-scheme: dark)');
		this.#mql.addEventListener('change', () => this.#apply());
		this.#apply();
	}

	set(p: ThemePref) {
		this.pref = p;
		try {
			localStorage.setItem(THEME_KEY, p);
		} catch {
			// penyimpanan diblokir: tema tetap berlaku sampai halaman ditutup
		}
		this.#apply();
	}

	cycle() {
		this.set(nextThemePref(this.pref));
	}

	#apply() {
		document.documentElement.dataset.theme = resolveTheme(this.pref, this.#mql?.matches ?? false);
	}
}

export const theme = new ThemeState();
```

- [ ] **Step 6: Token warna dan font di `src/app.css`**

Warna diambil dari logo (`4.jpg` merah #FF0000/kuning #FFF200, `5.jpg` merah #E42127). Merah dibuat sedikit lebih dalam supaya teks putih di atasnya tetap terbaca.

```css
@import 'tailwindcss';

@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));

:root {
	--dk-bg: #fff8ec;
	--dk-surface: #ffffff;
	--dk-surface-2: #fff0d1;
	--dk-fg: #2a1712;
	--dk-muted: #7a5b4f;
	--dk-line: #ead9bf;
	--dk-brand: #e3191f;
	--dk-brand-ink: #b5121a;
	--dk-on-brand: #ffffff;
	--dk-accent: #ffd60a;
	--dk-on-accent: #2a1712;
	--dk-danger: #c6281f;
	--dk-ok: #1f8a4c;
	--dk-warn: #b86e00;
	color-scheme: light;
}

:root[data-theme='dark'] {
	--dk-bg: #160d0a;
	--dk-surface: #22140f;
	--dk-surface-2: #2e1b13;
	--dk-fg: #fcefe2;
	--dk-muted: #c2a291;
	--dk-line: #3d2a1f;
	--dk-brand: #ff4136;
	--dk-brand-ink: #ff6b61;
	--dk-on-brand: #1a0b07;
	--dk-accent: #ffd23f;
	--dk-on-accent: #1a0b07;
	--dk-danger: #ff6a5e;
	--dk-ok: #4cc97e;
	--dk-warn: #f2b13c;
	color-scheme: dark;
}

@theme inline {
	--color-bg: var(--dk-bg);
	--color-surface: var(--dk-surface);
	--color-surface-2: var(--dk-surface-2);
	--color-fg: var(--dk-fg);
	--color-muted: var(--dk-muted);
	--color-line: var(--dk-line);
	--color-brand: var(--dk-brand);
	--color-brand-ink: var(--dk-brand-ink);
	--color-on-brand: var(--dk-on-brand);
	--color-accent: var(--dk-accent);
	--color-on-accent: var(--dk-on-accent);
	--color-danger: var(--dk-danger);
	--color-ok: var(--dk-ok);
	--color-warn: var(--dk-warn);
	--font-display: 'Lilita One', 'Arial Black', system-ui, sans-serif;
	--font-sans: 'Plus Jakarta Sans Variable', system-ui, -apple-system, 'Segoe UI', sans-serif;
}

html,
body {
	background: var(--dk-bg);
	color: var(--dk-fg);
}

body {
	font-family: var(--font-sans);
	-webkit-tap-highlight-color: transparent;
	min-height: 100dvh;
}

.tabular {
	font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		animation-duration: 0.01ms !important;
		transition-duration: 0.01ms !important;
	}
}
```

- [ ] **Step 7: Salin aset brand**

```bash
mkdir -p src/lib/assets/brand static
cp 4.jpg src/lib/assets/brand/logo-icon.jpg
cp 5.jpg src/lib/assets/brand/logo-wordmark.jpg
cp 4.jpg static/favicon.jpg
```

- [ ] **Step 8: Komponen brand dan UI**

`src/lib/components/brand/Logo.svelte`:
```svelte
<script lang="ts">
	import logoIcon from '$lib/assets/brand/logo-icon.jpg';
	import logoWordmark from '$lib/assets/brand/logo-wordmark.jpg';

	let { size = 'md', wordmark = false }: { size?: 'sm' | 'md' | 'lg'; wordmark?: boolean } = $props();
	const px = { sm: 36, md: 56, lg: 96 } as const;
</script>

{#if wordmark}
	<img src={logoWordmark} alt="D'Kriuk Fried Chicken" width={px[size] * 2} height={px[size] * 2} class="rounded-2xl" />
{:else}
	<img src={logoIcon} alt="Logo D'Kriuk" width={px[size]} height={px[size]} class="rounded-full" />
{/if}
```

`src/lib/components/ui/Button.svelte`:
```svelte
<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'ghost';
	let {
		variant = 'primary',
		loading = false,
		disabled,
		class: cls = '',
		children,
		...rest
	}: HTMLButtonAttributes & { variant?: Variant; loading?: boolean } = $props();

	const styles: Record<Variant, string> = {
		primary: 'bg-brand text-on-brand hover:bg-brand-ink',
		secondary: 'bg-surface-2 text-fg hover:bg-line',
		ghost: 'bg-transparent text-fg hover:bg-surface-2'
	};
</script>

<button
	{...rest}
	disabled={disabled || loading}
	aria-busy={loading || undefined}
	class="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 {styles[variant]} {cls}"
>
	{#if loading}
		<span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>
	{/if}
	{@render children?.()}
</button>
```

`src/lib/components/ui/TextField.svelte`:
```svelte
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		id,
		label,
		value = $bindable(''),
		error = '',
		...rest
	}: Omit<HTMLInputAttributes, 'value'> & { id: string; label: string; value?: string; error?: string } = $props();
</script>

<div class="grid gap-1.5">
	<label for={id} class="text-sm font-semibold">{label}</label>
	<input
		{id}
		{...rest}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${id}-error` : undefined}
		class="min-h-12 rounded-xl border border-line bg-surface px-4 text-base text-fg placeholder:text-muted focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none"
	/>
	{#if error}
		<p id="{id}-error" class="text-sm text-danger">{error}</p>
	{/if}
</div>
```

`src/lib/components/theme/ThemeToggle.svelte`:
```svelte
<script lang="ts">
	import { themeLabel } from '$lib/theme/theme';
	import { theme } from '$lib/theme/theme.svelte';
</script>

<button
	type="button"
	onclick={() => theme.cycle()}
	class="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-fg hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-accent"
	aria-label="Ganti tema, sekarang {themeLabel(theme.pref)}"
>
	<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
		{#if theme.pref === 'dark'}
			<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
		{:else if theme.pref === 'light'}
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
		{:else}
			<rect x="3" y="4" width="18" height="12" rx="2" />
			<path d="M8 20h8M12 16v4" />
		{/if}
	</svg>
	<span class="hidden sm:inline">{themeLabel(theme.pref)}</span>
</button>
```

- [ ] **Step 9: Pasang font & tema di layout, dan halaman contoh**

`src/routes/+layout.svelte`:
```svelte
<script lang="ts">
	import '../app.css';
	import '@fontsource/lilita-one';
	import '@fontsource-variable/plus-jakarta-sans';
	import { onMount } from 'svelte';
	import { theme } from '$lib/theme/theme.svelte';

	let { children } = $props();
	onMount(() => theme.init());
</script>

{@render children()}
```

`src/routes/+page.svelte` (sementara, diganti di Task 5):
```svelte
<script lang="ts">
	import Logo from '$lib/components/brand/Logo.svelte';
	import ThemeToggle from '$lib/components/theme/ThemeToggle.svelte';
	import Button from '$lib/components/ui/Button.svelte';
</script>

<main class="grid min-h-dvh place-items-center gap-6 p-6">
	<Logo size="lg" />
	<h1 class="font-display text-4xl text-brand">Kasir D'Kriuk</h1>
	<div class="flex gap-3"><Button>Utama</Button><Button variant="secondary">Kedua</Button><ThemeToggle /></div>
</main>
```

- [ ] **Step 10: Verifikasi**

Run: `npm test && npm run check && npm run build`
Expected: semua test PASS, `svelte-check found 0 errors`, build sukses.

Lalu `npm run dev`, buka URL yang ditampilkan, tekan tombol tema tiga kali: Otomatis → Terang → Gelap → Otomatis. Background dan tombol harus berganti warna, dan reload tidak berkedip ke tema lain.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: tema merah-kuning D'Kriuk terang/gelap, logo, komponen dasar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Skema database inti + RLS, diuji dengan PGlite

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/20261004000001_core.sql`, `supabase/migrations/20261004000002_seed_outlets.sql`, `tests/db/auth-stub.sql`, `tests/db/harness.ts`
- Test: `tests/db/core.test.ts`

**Interfaces:**
- Produces (SQL):
  - `public.user_role` enum `('admin','kasir')`
  - `public.outlets(id uuid, kode text unique, nama text, merek text, alamat text, telepon text, aktif bool, created_at)`
  - `public.profiles(id uuid → auth.users, username text unique, nama_tampilan text, role user_role, outlet_id uuid → outlets, aktif bool, created_at)`
  - `public.is_admin() returns boolean`, `public.my_outlet_id() returns uuid`
  - Trigger `on_auth_user_created`: membaca `raw_user_meta_data` `{username, nama_tampilan, role, outlet_kode}` dan membuat baris `profiles`.
- Produces (test helper): `freshDb(): Promise<PGlite>`, `buatUser(db, meta): Promise<string>`, `sebagai(db, userId, fn)`

- [ ] **Step 1: Inisialisasi folder Supabase**

Run: `npx supabase init`
Expected: terbentuk `supabase/config.toml`. Jika ditanya soal VS Code/IntelliJ settings, jawab `N`.

- [ ] **Step 2: Tulis tiruan skema auth untuk PGlite**

`tests/db/auth-stub.sql`:
```sql
-- Meniru bagian Supabase yang dipakai migrasi kita, supaya bisa diuji tanpa Docker.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
```

- [ ] **Step 3: Tulis harness test**

`tests/db/harness.ts`:
```ts
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

export async function freshDb(): Promise<PGlite> {
	const db = new PGlite();
	await db.exec(readFileSync(join(ROOT, 'tests/db/auth-stub.sql'), 'utf8'));
	const dir = join(ROOT, 'supabase/migrations');
	for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
		await db.exec(readFileSync(join(dir, f), 'utf8'));
	}
	return db;
}

export interface MetaUser {
	username: string;
	role: 'admin' | 'kasir';
	outlet_kode?: string | null;
	nama_tampilan?: string;
}

/** Meniru pembuatan user oleh Supabase Auth; trigger akan membuat profilnya. */
export async function buatUser(db: PGlite, meta: MetaUser): Promise<string> {
	const id = crypto.randomUUID();
	await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
		id,
		`${meta.username}@test.local`,
		JSON.stringify(meta)
	]);
	return id;
}

/** Menjalankan fn sebagai user login (role authenticated, auth.uid() = userId). */
export async function sebagai<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
	await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
	await db.exec('set role authenticated');
	try {
		return await fn();
	} finally {
		await db.exec('reset role');
		await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
	}
}
```

- [ ] **Step 4: Tulis test database yang gagal**

`tests/db/core.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai } from './harness';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin', nama_tampilan: 'Owner' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
});

describe('seed outlet', () => {
	it('berisi tiga outlet dengan merek yang benar', async () => {
		const { rows } = await db.query<{ kode: string; merek: string; nama: string }>(
			'select kode, merek, nama from public.outlets order by kode'
		);
		expect(rows).toEqual([
			{ kode: 'BL', merek: "D'Kriuk", nama: 'Bukit Lama' },
			{ kode: 'KP', merek: "D'Krizzpy", nama: 'Kertapati' },
			{ kode: 'TK', merek: "D'Kriuk", nama: 'Talang Kerangga' }
		]);
	});
});

describe('trigger profil', () => {
	it('membuat profil kasir yang terikat ke outlet', async () => {
		const { rows } = await db.query<{ username: string; role: string; kode: string }>(
			`select p.username, p.role, o.kode from public.profiles p join public.outlets o on o.id = p.outlet_id where p.id = $1`,
			[kasirBL]
		);
		expect(rows).toEqual([{ username: 'kasir.bukitlama', role: 'kasir', kode: 'BL' }]);
	});

	it('nama_tampilan default ke username', async () => {
		const { rows } = await db.query<{ nama_tampilan: string }>('select nama_tampilan from public.profiles where id = $1', [kasirBL]);
		expect(rows[0].nama_tampilan).toBe('kasir.bukitlama');
	});

	it('menolak kasir tanpa outlet', async () => {
		await expect(buatUser(db, { username: 'kasir.tanpaoutlet', role: 'kasir' })).rejects.toThrow();
	});

	it('menolak username dengan huruf besar', async () => {
		await expect(buatUser(db, { username: 'Kasir.Besar', role: 'admin' })).rejects.toThrow();
	});
});

describe('RLS profiles', () => {
	it('kasir hanya melihat profilnya sendiri', async () => {
		const rows = await sebagai(db, kasirBL, async () => (await db.query<{ id: string }>('select id from public.profiles')).rows);
		expect(rows.map((r) => r.id)).toEqual([kasirBL]);
	});

	it('admin melihat semua profil', async () => {
		const rows = await sebagai(db, adminId, async () => (await db.query('select id from public.profiles')).rows);
		expect(rows).toHaveLength(3);
	});

	it('kasir tidak bisa menaikkan perannya menjadi admin', async () => {
		await sebagai(db, kasirBL, async () => {
			await db.query(`update public.profiles set role = 'admin' where id = $1`, [kasirBL]);
		});
		const { rows } = await db.query<{ role: string }>('select role from public.profiles where id = $1', [kasirBL]);
		expect(rows[0].role).toBe('kasir');
	});

	it('admin bisa menonaktifkan kasir', async () => {
		await sebagai(db, adminId, async () => {
			await db.query('update public.profiles set aktif = false where id = $1', [kasirTK]);
		});
		const { rows } = await db.query<{ aktif: boolean }>('select aktif from public.profiles where id = $1', [kasirTK]);
		expect(rows[0].aktif).toBe(false);
	});
});

describe('RLS outlets', () => {
	it('kasir bisa membaca semua outlet (untuk transfer stok nanti)', async () => {
		const rows = await sebagai(db, kasirBL, async () => (await db.query('select id from public.outlets')).rows);
		expect(rows).toHaveLength(3);
	});

	it('kasir tidak bisa mengubah outlet', async () => {
		await sebagai(db, kasirBL, async () => {
			await db.query(`update public.outlets set nama = 'Diretas' where kode = 'BL'`);
		});
		const { rows } = await db.query<{ nama: string }>(`select nama from public.outlets where kode = 'BL'`);
		expect(rows[0].nama).toBe('Bukit Lama');
	});

	it('admin bisa mengubah outlet', async () => {
		await sebagai(db, adminId, async () => {
			await db.query(`update public.outlets set telepon = '+62 800' where kode = 'KP'`);
		});
		const { rows } = await db.query<{ telepon: string }>(`select telepon from public.outlets where kode = 'KP'`);
		expect(rows[0].telepon).toBe('+62 800');
	});
});

describe('fungsi bantu', () => {
	it('is_admin benar untuk admin aktif, salah untuk kasir', async () => {
		const a = await sebagai(db, adminId, async () => (await db.query<{ v: boolean }>('select public.is_admin() as v')).rows[0].v);
		const k = await sebagai(db, kasirBL, async () => (await db.query<{ v: boolean }>('select public.is_admin() as v')).rows[0].v);
		expect(a).toBe(true);
		expect(k).toBe(false);
	});

	it('is_admin salah bila admin dinonaktifkan', async () => {
		await db.query('update public.profiles set aktif = false where id = $1', [adminId]);
		const a = await sebagai(db, adminId, async () => (await db.query<{ v: boolean }>('select public.is_admin() as v')).rows[0].v);
		expect(a).toBe(false);
	});

	it('my_outlet_id mengembalikan outlet kasir', async () => {
		const id = await sebagai(db, kasirTK, async () => (await db.query<{ v: string }>('select public.my_outlet_id() as v')).rows[0].v);
		const { rows } = await db.query<{ id: string }>(`select id from public.outlets where kode = 'TK'`);
		expect(id).toBe(rows[0].id);
	});
});
```

- [ ] **Step 5: Jalankan test, pastikan gagal**

Run: `npx vitest run tests/db/core.test.ts`
Expected: FAIL, error membaca folder `supabase/migrations` yang belum ada atau tabel `public.outlets` tidak ada.

- [ ] **Step 6: Tulis migrasi inti**

`supabase/migrations/20261004000001_core.sql`:
```sql
-- Fondasi: peran, outlet, profil pengguna, fungsi bantu, dan aturan akses (RLS).

create type public.user_role as enum ('admin', 'kasir');

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique check (kode ~ '^[A-Z]{2,4}$'),
  nama text not null,
  merek text not null,
  alamat text not null,
  telepon text not null,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  nama_tampilan text not null,
  role public.user_role not null,
  outlet_id uuid references public.outlets (id),
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  constraint kasir_punya_outlet check (role = 'admin' or outlet_id is not null)
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and aktif
  )
$$;

create function public.my_outlet_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select outlet_id from public.profiles where id = auth.uid() and aktif
$$;

-- Profil dibuat otomatis dari metadata saat akun Auth dibuat (oleh script atau Edge Function admin).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, nama_tampilan, role, outlet_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    coalesce(new.raw_user_meta_data ->> 'nama_tampilan', new.raw_user_meta_data ->> 'username'),
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    (select o.id from public.outlets o where o.kode = new.raw_user_meta_data ->> 'outlet_kode')
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.outlets enable row level security;
alter table public.profiles enable row level security;

create policy outlets_baca on public.outlets
  for select to authenticated using (true);

create policy outlets_admin_tulis on public.outlets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy profiles_baca on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

-- Tambah/hapus akun hanya lewat service role (Edge Function admin di Tahap 1).
create policy profiles_admin_ubah on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
```

`supabase/migrations/20261004000002_seed_outlets.sql`:
```sql
insert into public.outlets (kode, nama, merek, alamat, telepon) values
  ('BL', 'Bukit Lama', 'D''Kriuk',
   'Jl. Sultan M. Mansyur No.1137, RT.14 RW.05, Bukit Lama, Kec. Ilir Barat I, Kota Palembang, Sumatera Selatan 30136',
   '+62 821-8388-6369'),
  ('TK', 'Talang Kerangga', 'D''Kriuk',
   'Jl. Ki Rangga Wirasantika, Talang Kerangga, Palembang',
   '+62 821-8388-6369'),
  ('KP', 'Kertapati', 'D''Krizzpy',
   'Jl. KH. Moh. Asyik, 3-4 Ulu, Kec. Seberang Ulu I, Kota Palembang, Sumatera Selatan 30254',
   '+62 821-8388-6369');
```

- [ ] **Step 7: Jalankan test, pastikan lulus**

Run: `npx vitest run tests/db/core.test.ts`
Expected: PASS (15 test).

Jika `set role authenticated` gagal di PGlite dengan error permission, tambahkan `grant authenticated to current_user;` dan `grant anon to current_user;` di akhir `tests/db/auth-stub.sql`, lalu jalankan ulang.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): skema outlet & profil, trigger akun, RLS + test PGlite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Logika autentikasi murni (username, pesan error, hak akses)

**Files:**
- Create: `src/lib/auth/domain.js`, `src/lib/auth/username.ts`, `src/lib/auth/login-error.ts`, `src/lib/auth/guard.ts`, `src/lib/types/db.ts`
- Test: `src/lib/auth/username.test.ts`, `src/lib/auth/login-error.test.ts`, `src/lib/auth/guard.test.ts`

**Interfaces:**
- Produces:
  - `AUTH_EMAIL_DOMAIN = 'kasir-dkriuk.app'` (`domain.js`, JS biasa supaya bisa diimpor script Node)
  - `normalizeUsername(raw: string): string`; `validateUsername(raw: string): string | null`; `usernameToEmail(raw: string): string`
  - `pesanErrorLogin(err: { message?: string; status?: number } | null): string | null`
  - `type Role = 'admin' | 'kasir'`; `interface Outlet { id; kode; nama; merek; alamat; telepon; aktif }`; `interface Profile { id; username; nama_tampilan; role; outlet_id: string | null; aktif }`
  - `homePathFor(role: Role): '/admin' | '/kasir'`; `type AksesKeputusan = { ok: true } | { ok: false; redirect: string }`; `cekAkses(path: string, profile: Pick<Profile, 'role' | 'aktif'> | null): AksesKeputusan`

- [ ] **Step 1: Tulis test yang gagal**

`src/lib/auth/username.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalizeUsername, usernameToEmail, validateUsername } from './username';

describe('username', () => {
	it('dinormalisasi: spasi dibuang, huruf kecil', () => {
		expect(normalizeUsername('  Kasir.BukitLama ')).toBe('kasir.bukitlama');
	});
	it('diubah ke email sintetis', () => {
		expect(usernameToEmail(' Kasir.BukitLama ')).toBe('kasir.bukitlama@kasir-dkriuk.app');
	});
	it('kosong ditolak dengan pesan jelas', () => {
		expect(validateUsername('   ')).toBe('Username wajib diisi.');
	});
	it('karakter tidak sah ditolak', () => {
		expect(validateUsername('kasir bukit')).toMatch(/3–32 karakter/);
		expect(validateUsername('ab')).toMatch(/3–32 karakter/);
	});
	it('username sah lolos', () => {
		expect(validateUsername('Kasir.Kertapati')).toBeNull();
	});
});
```

`src/lib/auth/login-error.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pesanErrorLogin } from './login-error';

describe('pesanErrorLogin', () => {
	it('tanpa error → null', () => {
		expect(pesanErrorLogin(null)).toBeNull();
	});
	it('kredensial salah', () => {
		expect(pesanErrorLogin({ message: 'Invalid login credentials', status: 400 })).toBe('Username atau password salah.');
	});
	it('internet putus bukan dianggap password salah', () => {
		expect(pesanErrorLogin({ message: 'Failed to fetch' })).toBe(
			'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.'
		);
	});
	it('terlalu banyak percobaan', () => {
		expect(pesanErrorLogin({ message: 'Request rate limit reached', status: 429 })).toBe(
			'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.'
		);
	});
	it('error lain → pesan umum', () => {
		expect(pesanErrorLogin({ message: 'boom', status: 500 })).toBe('Login gagal. Coba lagi beberapa saat lagi.');
	});
});
```

`src/lib/auth/guard.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cekAkses, homePathFor } from './guard';

const admin = { role: 'admin' as const, aktif: true };
const kasir = { role: 'kasir' as const, aktif: true };

describe('homePathFor', () => {
	it('admin ke /admin, kasir ke /kasir', () => {
		expect(homePathFor('admin')).toBe('/admin');
		expect(homePathFor('kasir')).toBe('/kasir');
	});
});

describe('cekAkses', () => {
	it('tamu hanya boleh di /login', () => {
		expect(cekAkses('/login', null)).toEqual({ ok: true });
		expect(cekAkses('/admin', null)).toEqual({ ok: false, redirect: '/login' });
		expect(cekAkses('/', null)).toEqual({ ok: false, redirect: '/login' });
	});
	it('yang sudah login diarahkan dari / dan /login ke berandanya', () => {
		expect(cekAkses('/', kasir)).toEqual({ ok: false, redirect: '/kasir' });
		expect(cekAkses('/login', admin)).toEqual({ ok: false, redirect: '/admin' });
	});
	it('kasir yang mengetik #/admin dialihkan ke /kasir', () => {
		expect(cekAkses('/admin', kasir)).toEqual({ ok: false, redirect: '/kasir' });
		expect(cekAkses('/admin/akun', kasir)).toEqual({ ok: false, redirect: '/kasir' });
	});
	it('admin boleh membuka halaman kasir', () => {
		expect(cekAkses('/kasir', admin)).toEqual({ ok: true });
		expect(cekAkses('/admin', admin)).toEqual({ ok: true });
	});
	it('profil nonaktif diperlakukan seperti tamu', () => {
		expect(cekAkses('/kasir', { role: 'kasir', aktif: false })).toEqual({ ok: false, redirect: '/login' });
		expect(cekAkses('/login', { role: 'kasir', aktif: false })).toEqual({ ok: true });
	});
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `npx vitest run src/lib/auth`
Expected: FAIL, modul `./username`, `./login-error`, `./guard` belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/auth/domain.js`:
```js
/** Domain email sintetis: Supabase Auth butuh email, pengguna cukup mengetik username. */
export const AUTH_EMAIL_DOMAIN = 'kasir-dkriuk.app';
```

`src/lib/auth/username.ts`:
```ts
import { AUTH_EMAIL_DOMAIN } from './domain.js';

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(raw: string): string {
	return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
	const u = normalizeUsername(raw);
	if (u.length === 0) return 'Username wajib diisi.';
	if (!USERNAME_RE.test(u)) return 'Username 3–32 karakter: huruf kecil, angka, titik, minus, atau garis bawah.';
	return null;
}

export function usernameToEmail(raw: string): string {
	return `${normalizeUsername(raw)}@${AUTH_EMAIL_DOMAIN}`;
}
```

`src/lib/auth/login-error.ts`:
```ts
export function pesanErrorLogin(err: { message?: string; status?: number } | null): string | null {
	if (!err) return null;
	const msg = (err.message ?? '').toLowerCase();
	if (msg.includes('invalid login credentials')) return 'Username atau password salah.';
	if (msg.includes('failed to fetch') || msg.includes('network')) {
		return 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.';
	}
	if (err.status === 429) return 'Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.';
	return 'Login gagal. Coba lagi beberapa saat lagi.';
}
```

`src/lib/types/db.ts`:
```ts
export type Role = 'admin' | 'kasir';

export interface Outlet {
	id: string;
	kode: string;
	nama: string;
	merek: string;
	alamat: string;
	telepon: string;
	aktif: boolean;
}

export interface Profile {
	id: string;
	username: string;
	nama_tampilan: string;
	role: Role;
	outlet_id: string | null;
	aktif: boolean;
}
```

`src/lib/auth/guard.ts`:
```ts
import type { Profile, Role } from '$lib/types/db';

export type AksesKeputusan = { ok: true } | { ok: false; redirect: string };

export function homePathFor(role: Role): '/admin' | '/kasir' {
	return role === 'admin' ? '/admin' : '/kasir';
}

export function cekAkses(path: string, profile: Pick<Profile, 'role' | 'aktif'> | null): AksesKeputusan {
	const diLogin = path === '/login';
	if (!profile || !profile.aktif) return diLogin ? { ok: true } : { ok: false, redirect: '/login' };

	const beranda = homePathFor(profile.role);
	if (diLogin || path === '/') return { ok: false, redirect: beranda };
	if (path.startsWith('/admin') && profile.role !== 'admin') return { ok: false, redirect: beranda };
	return { ok: true };
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `npx vitest run src/lib/auth`
Expected: PASS (16 test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth): normalisasi username, pesan error login, aturan akses halaman

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sesi Supabase, halaman login, dan beranda per peran

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/auth/session.svelte.ts`, `src/lib/components/layout/SplashScreen.svelte`, `src/lib/components/layout/AppShell.svelte`, `src/routes/login/+page.svelte`, `src/routes/admin/+page.svelte`, `src/routes/kasir/+page.svelte`
- Modify: `src/routes/+layout.svelte`, `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `href` (Task 1); `theme`, `Button`, `TextField`, `Logo`, `ThemeToggle` (Task 2); `usernameToEmail`, `validateUsername`, `pesanErrorLogin`, `cekAkses`, `Profile`, `Outlet` (Task 4); tabel `profiles`, `outlets` (Task 3)
- Produces:
  - `supabase` (client)
  - `auth` (instance `AuthState`): `status: 'loading' | 'guest' | 'ready'`, `profile: Profile | null`, `outlet: Outlet | null`, `notice: string | null`, `start()`, `signIn(username, password): Promise<string | null>`, `signOut(): Promise<void>`
  - `<AppShell title>` dengan slot `children`; `<SplashScreen />`

- [ ] **Step 1: Client Supabase**

`src/lib/supabase/client.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
	auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dk-auth' }
});
```

- [ ] **Step 2: State sesi**

`src/lib/auth/session.svelte.ts`:
```ts
import type { Session } from '@supabase/supabase-js';
import { supabase } from '$lib/supabase/client';
import type { Outlet, Profile } from '$lib/types/db';
import { pesanErrorLogin } from './login-error';
import { usernameToEmail } from './username';

type Status = 'loading' | 'guest' | 'ready';

class AuthState {
	status = $state<Status>('loading');
	profile = $state<Profile | null>(null);
	outlet = $state<Outlet | null>(null);
	/** Pesan untuk ditampilkan di halaman login (mis. akun dinonaktifkan). */
	notice = $state<string | null>(null);
	#started = false;

	start() {
		if (this.#started) return;
		this.#started = true;
		supabase.auth.onAuthStateChange((_event, session) => {
			// Ditunda: memanggil Supabase langsung di dalam callback ini bisa macet.
			setTimeout(() => void this.#apply(session), 0);
		});
	}

	async #apply(session: Session | null) {
		if (!session) {
			this.profile = null;
			this.outlet = null;
			this.status = 'guest';
			return;
		}
		const { data: profile, error } = await supabase
			.from('profiles')
			.select('id, username, nama_tampilan, role, outlet_id, aktif')
			.eq('id', session.user.id)
			.maybeSingle<Profile>();

		if (error) {
			this.notice = pesanErrorLogin(error);
			this.status = 'guest';
			return;
		}
		if (!profile || !profile.aktif) {
			this.notice = profile ? 'Akun ini dinonaktifkan. Hubungi admin.' : 'Profil akun tidak ditemukan. Hubungi admin.';
			await supabase.auth.signOut();
			return;
		}

		let outlet: Outlet | null = null;
		if (profile.outlet_id) {
			const res = await supabase
				.from('outlets')
				.select('id, kode, nama, merek, alamat, telepon, aktif')
				.eq('id', profile.outlet_id)
				.maybeSingle<Outlet>();
			outlet = res.data ?? null;
		}
		this.profile = profile;
		this.outlet = outlet;
		this.notice = null;
		this.status = 'ready';
	}

	async signIn(username: string, password: string): Promise<string | null> {
		this.notice = null;
		const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
		return pesanErrorLogin(error);
	}

	async signOut() {
		await supabase.auth.signOut();
	}
}

export const auth = new AuthState();
```

- [ ] **Step 3: Komponen layout**

`src/lib/components/layout/SplashScreen.svelte`:
```svelte
<script lang="ts">
	import Logo from '$lib/components/brand/Logo.svelte';
</script>

<div class="grid min-h-dvh place-items-center bg-bg" role="status" aria-live="polite">
	<div class="grid justify-items-center gap-4">
		<Logo size="lg" />
		<p class="text-sm font-semibold text-muted">Memuat…</p>
	</div>
</div>
```

`src/lib/components/layout/AppShell.svelte`:
```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { auth } from '$lib/auth/session.svelte';
	import Logo from '$lib/components/brand/Logo.svelte';
	import ThemeToggle from '$lib/components/theme/ThemeToggle.svelte';

	let { title, children }: { title: string; children: Snippet } = $props();

	const lingkup = $derived(
		auth.profile?.role === 'admin' ? 'Admin · Semua outlet' : auth.outlet ? `${auth.outlet.merek} ${auth.outlet.nama}` : ''
	);
</script>

<div class="min-h-dvh bg-bg">
	<header
		class="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur"
	>
		<div class="flex min-h-16 flex-1 items-center gap-3">
			<Logo size="sm" />
			<div class="min-w-0">
				<p class="font-display text-xl leading-none text-brand">{title}</p>
				<p class="truncate text-xs font-semibold text-muted">{lingkup}</p>
			</div>
		</div>
		<ThemeToggle />
		<button
			type="button"
			onclick={() => auth.signOut()}
			class="min-h-12 rounded-xl px-3 text-sm font-semibold text-fg hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-accent"
		>
			Keluar
		</button>
	</header>
	<main class="mx-auto w-full max-w-6xl px-4 py-6">
		{@render children()}
	</main>
</div>
```

- [ ] **Step 4: Layout akar dengan penjaga akses**

`src/routes/+layout.svelte`:
```svelte
<script lang="ts">
	import '../app.css';
	import '@fontsource/lilita-one';
	import '@fontsource-variable/plus-jakarta-sans';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { cekAkses } from '$lib/auth/guard';
	import { auth } from '$lib/auth/session.svelte';
	import SplashScreen from '$lib/components/layout/SplashScreen.svelte';
	import { href } from '$lib/nav';
	import { theme } from '$lib/theme/theme.svelte';

	let { children } = $props();

	onMount(() => {
		theme.init();
		auth.start();
	});

	const keputusan = $derived(auth.status === 'loading' ? null : cekAkses(page.url.pathname, auth.profile));

	$effect(() => {
		if (keputusan && !keputusan.ok) goto(href(keputusan.redirect), { replaceState: true });
	});
</script>

{#if keputusan?.ok}
	{@render children()}
{:else}
	<SplashScreen />
{/if}
```

`src/routes/+page.svelte` (beranda kosong; penjaga akses langsung mengalihkan):
```svelte
<!-- Dialihkan ke /login, /admin, atau /kasir oleh +layout.svelte -->
```

- [ ] **Step 5: Halaman login**

`src/routes/login/+page.svelte`:
```svelte
<script lang="ts">
	import { auth } from '$lib/auth/session.svelte';
	import { validateUsername } from '$lib/auth/username';
	import Logo from '$lib/components/brand/Logo.svelte';
	import ThemeToggle from '$lib/components/theme/ThemeToggle.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';

	let username = $state('');
	let password = $state('');
	let lihatPassword = $state(false);
	let errUsername = $state('');
	let errPassword = $state('');
	let errUmum = $state<string | null>(null);
	let memproses = $state(false);

	async function masuk(e: SubmitEvent) {
		e.preventDefault();
		errUsername = validateUsername(username) ?? '';
		errPassword = password.length === 0 ? 'Password wajib diisi.' : '';
		errUmum = null;
		if (errUsername || errPassword) return;
		memproses = true;
		errUmum = await auth.signIn(username, password);
		memproses = false;
	}
</script>

<svelte:head><title>Masuk · Kasir D'Kriuk</title></svelte:head>

<div class="grid min-h-dvh bg-brand lg:grid-cols-2">
	<section class="hidden flex-col justify-between p-10 text-on-brand lg:flex">
		<Logo size="lg" wordmark />
		<p class="font-display text-5xl leading-tight">Ayam kriuk,<br />catatan rapi.</p>
		<p class="text-sm opacity-80">Bukit Lama · Talang Kerangga · Kertapati</p>
	</section>

	<section class="grid place-items-center bg-bg px-4 py-10 lg:rounded-l-[2rem]">
		<div class="w-full max-w-sm">
			<div class="mb-8 flex items-center justify-between">
				<div class="flex items-center gap-3 lg:hidden">
					<Logo size="md" />
					<span class="font-display text-2xl text-brand">Kasir D'Kriuk</span>
				</div>
				<span class="hidden font-display text-2xl text-brand lg:inline">Masuk</span>
				<ThemeToggle />
			</div>

			{#if auth.notice}
				<p class="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">
					{auth.notice}
				</p>
			{/if}

			<form class="grid gap-5" onsubmit={masuk} novalidate>
				<TextField
					id="username"
					label="Username"
					bind:value={username}
					error={errUsername}
					autocomplete="username"
					autocapitalize="none"
					spellcheck={false}
					placeholder="contoh: kasir.bukitlama"
				/>
				<div class="grid gap-2">
					<TextField
						id="password"
						label="Password"
						type={lihatPassword ? 'text' : 'password'}
						bind:value={password}
						error={errPassword}
						autocomplete="current-password"
					/>
					<label class="flex min-h-10 items-center gap-2 text-sm text-muted">
						<input id="lihat-password" type="checkbox" bind:checked={lihatPassword} class="size-4 accent-brand" />
						Tampilkan password
					</label>
				</div>

				{#if errUmum}
					<p class="text-sm font-semibold text-danger" role="alert">{errUmum}</p>
				{/if}

				<Button type="submit" loading={memproses} class="text-lg">Masuk</Button>
			</form>
		</div>
	</section>
</div>
```

- [ ] **Step 6: Beranda admin dan kasir (sementara)**

`src/routes/admin/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '$lib/auth/session.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import { supabase } from '$lib/supabase/client';
	import type { Outlet } from '$lib/types/db';

	let outlets = $state<Outlet[]>([]);
	let gagal = $state<string | null>(null);

	onMount(async () => {
		const { data, error } = await supabase
			.from('outlets')
			.select('id, kode, nama, merek, alamat, telepon, aktif')
			.order('kode');
		if (error) gagal = 'Daftar outlet tidak bisa dimuat. Periksa koneksi, lalu muat ulang.';
		else outlets = data ?? [];
	});
</script>

<svelte:head><title>Admin · Kasir D'Kriuk</title></svelte:head>

<AppShell title="Admin">
	<h1 class="font-display text-3xl">Halo, {auth.profile?.nama_tampilan}</h1>
	<p class="mt-1 text-muted">Dashboard lengkap dibangun di Tahap 7. Untuk sekarang, ini outlet yang terdaftar.</p>

	{#if gagal}
		<p class="mt-6 text-danger" role="alert">{gagal}</p>
	{/if}

	<ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each outlets as o (o.id)}
			<li class="rounded-2xl border border-line bg-surface p-5">
				<span class="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">{o.kode}</span>
				<p class="mt-3 font-display text-xl">{o.merek} {o.nama}</p>
				<p class="mt-1 text-sm text-muted">{o.alamat}</p>
			</li>
		{/each}
	</ul>
</AppShell>
```

`src/routes/kasir/+page.svelte`:
```svelte
<script lang="ts">
	import { auth } from '$lib/auth/session.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
</script>

<svelte:head><title>Kasir · Kasir D'Kriuk</title></svelte:head>

<AppShell title="Kasir">
	{#if auth.outlet}
		<h1 class="font-display text-3xl">{auth.outlet.merek} {auth.outlet.nama}</h1>
		<p class="mt-1 text-muted">Layar jualan dibangun di Tahap 2.</p>
	{:else}
		<h1 class="font-display text-3xl">Pilih outlet</h1>
		<p class="mt-1 text-muted">Admin akan bisa memilih outlet untuk berjualan di Tahap 2.</p>
	{/if}
</AppShell>
```

- [ ] **Step 7: Verifikasi**

Run: `npm test && npm run check && npm run build`
Expected: semua test PASS, `svelte-check found 0 errors`, build sukses. (Build memakai nilai placeholder dari `.env.local`; login sungguhan diuji di Task 6.)

Jika `svelte-check` mengeluhkan `type` dinamis dengan `bind:value` di `TextField`, ubah `TextField` agar menerima prop `type` secara eksplisit (`type = 'text'`) dan teruskan `{type}` sebelum `bind:value`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: login username+password, penjaga akses, beranda admin & kasir

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Hubungkan ke Supabase online, buat akun awal, uji end-to-end

**Files:**
- Create: `scripts/bootstrap-users.mjs`, `README.md`
- Modify: `.env.local` (lokal saja, tidak di-commit)

**Interfaces:**
- Consumes: `AUTH_EMAIL_DOMAIN` (`src/lib/auth/domain.js`); trigger `on_auth_user_created` (Task 3)
- Produces: project Supabase online dengan migrasi terpasang dan 4 akun: `admin`, `kasir.bukitlama`, `kasir.talangkerangga`, `kasir.kertapati`

- [ ] **Step 1: Owner membuat project Supabase (langkah manual owner)**

1. Daftar/masuk di https://supabase.com, lalu **New project**. Nama `kasir-dkriuk`, region **Southeast Asia (Singapore)**. Simpan database password.
2. **Authentication → Sign In / Providers**: matikan **Allow new users to sign up**. Ini wajib, karena anon key bersifat publik.
3. **Project Settings → API**: salin `Project URL`, `anon public` key, dan `service_role` key.
4. Isi `.env.local`:
```bash
PUBLIC_SUPABASE_URL=<Project URL>
PUBLIC_SUPABASE_ANON_KEY=<anon public>
SUPABASE_URL=<Project URL>
SUPABASE_SERVICE_ROLE_KEY=<service_role>
```

- [ ] **Step 2: Pasang migrasi ke project**

Owner menjalankan login CLI di prompt (interaktif): `! npx supabase login`

Lalu:
```bash
npx supabase link --project-ref <ref dari Project URL>
npx supabase db push
```
Expected: `Applying migration 20261004000001_core.sql...`, `...000002_seed_outlets.sql`, `Finished supabase db push.`

- [ ] **Step 3: Script akun awal**

`scripts/bootstrap-users.mjs`:
```js
// Membuat 4 akun awal. Jalankan sekali: node --env-file=.env.local scripts/bootstrap-users.mjs
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { AUTH_EMAIL_DOMAIN } from '../src/lib/auth/domain.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local terlebih dahulu.');
	process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const akun = [
	{ username: 'admin', nama_tampilan: 'Owner', role: 'admin', outlet_kode: null },
	{ username: 'kasir.bukitlama', nama_tampilan: 'Kasir Bukit Lama', role: 'kasir', outlet_kode: 'BL' },
	{ username: 'kasir.talangkerangga', nama_tampilan: 'Kasir Talang Kerangga', role: 'kasir', outlet_kode: 'TK' },
	{ username: 'kasir.kertapati', nama_tampilan: 'Kasir Kertapati', role: 'kasir', outlet_kode: 'KP' }
];

console.log('Simpan password di bawah ini; tidak akan ditampilkan lagi.\n');
for (const a of akun) {
	const password = randomBytes(9).toString('base64url');
	const { error } = await admin.auth.admin.createUser({
		email: `${a.username}@${AUTH_EMAIL_DOMAIN}`,
		password,
		email_confirm: true,
		user_metadata: a
	});
	if (error) {
		console.log(`${a.username.padEnd(22)} dilewati: ${error.message}`);
		continue;
	}
	console.log(`${a.username.padEnd(22)} ${password}`);
}
```

Run: `node --env-file=.env.local scripts/bootstrap-users.mjs`
Expected: 4 baris `username  password`. Owner menyimpan password ini (password bisa diganti dari menu akun di Tahap 1).

- [ ] **Step 4: Uji manual di browser (HP/tablet atau DevTools mode perangkat)**

Run: `npm run dev -- --host`, lalu buka alamat Network yang ditampilkan dari HP di Wi-Fi yang sama.

Checklist (semua harus sesuai):
1. Membuka `/` tanpa login → diarahkan ke halaman Masuk.
2. Login `admin` → beranda Admin menampilkan 3 kartu outlet (BL, TK, KP).
3. Login dengan username `  Kasir.BukitLama ` (spasi & huruf besar) → masuk ke halaman Kasir "D'Kriuk Bukit Lama".
4. Sebagai kasir, ubah alamat menjadi `#/admin` → kembali ke `#/kasir`.
5. Password salah → "Username atau password salah."
6. Matikan Wi-Fi, lalu coba login → "Tidak bisa terhubung ke server…".
7. Di Supabase **Table Editor → profiles**, set `aktif = false` untuk `kasir.kertapati`, lalu login sebagai akun itu → "Akun ini dinonaktifkan. Hubungi admin." Kembalikan ke `true`.
8. Tombol tema: Otomatis → Terang → Gelap. Tampilan tetap terbaca di kedua mode, di HP (portrait) dan tablet (landscape).
9. Tombol Keluar → kembali ke halaman Masuk.

- [ ] **Step 5: README**

`README.md`:
```markdown
# Kasir D'Kriuk

Aplikasi kasir, stok bahan baku, dan keuangan untuk outlet D'Kriuk Bukit Lama, D'Kriuk Talang Kerangga, dan D'Krizzpy Kertapati.

## Teknologi
SvelteKit (Svelte 5) + Tailwind CSS v4, di-hosting statis (GitHub Pages). Data, login, dan aturan akses di Supabase.

## Menjalankan di komputer
1. `npm install`
2. Salin `.env.example` ke `.env.local`, isi dengan kunci project Supabase.
3. `npm run dev`

## Perintah
| Perintah | Fungsi |
|---|---|
| `npm run dev` | server pengembangan |
| `npm test` | semua test (logika + database via PGlite) |
| `npm run check` | pemeriksaan tipe Svelte/TypeScript |
| `npm run build` | build statis ke `build/` |
| `npx supabase db push` | pasang migrasi ke project Supabase |
| `node --env-file=.env.local scripts/bootstrap-users.mjs` | buat 4 akun awal (sekali saja) |

## Keamanan
- Jangan commit `.env.local`, file harga/HPP, atau data bisnis lain.
- Anon key aman berada di aplikasi karena semua tabel dilindungi Row Level Security.
- Pendaftaran akun publik harus dimatikan di Supabase; akun dibuat oleh admin.

## Dokumen
- Rancangan: `docs/superpowers/specs/2026-10-04-kasir-dkriuk-design.md`
- Rencana per tahap: `docs/superpowers/plans/`
```

- [ ] **Step 6: Perbarui roadmap & commit**

Di `docs/superpowers/plans/2026-10-04-00-roadmap.md`, ubah status Tahap 0 menjadi `selesai`.

```bash
git status   # pastikan .env.local, *.xlsx, *.txt, dan foto root TIDAK ikut
git add -A
git commit -m "feat: script akun awal, README, Tahap 0 selesai

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
