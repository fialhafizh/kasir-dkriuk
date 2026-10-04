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
