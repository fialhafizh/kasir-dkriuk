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
