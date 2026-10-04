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
