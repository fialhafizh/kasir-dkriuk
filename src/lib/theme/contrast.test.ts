import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Menjaga keterbacaan di tablet kasir yang terkena cahaya terang (WCAG 2.1).
const css = readFileSync(join(import.meta.dirname, '..', '..', 'app.css'), 'utf8');

function tokens(selector: string): Record<string, string> {
	const start = css.indexOf(`${selector} {`);
	const block = css.slice(start, css.indexOf('}', start));
	return Object.fromEntries([...block.matchAll(/--dk-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const TEKS = 4.5;
const UI = 3;
const pasangan: [string, string, number][] = [
	['fg', 'bg', TEKS],
	['fg', 'surface-2', TEKS],
	['muted', 'bg', TEKS],
	['muted', 'surface', TEKS],
	['on-brand', 'brand', TEKS],
	['on-brand', 'brand-ink', TEKS],
	['on-accent', 'accent', TEKS],
	['danger', 'bg', TEKS],
	['danger', 'surface', TEKS],
	['ok', 'bg', TEKS],
	['warn', 'bg', TEKS],
	['focus', 'bg', UI],
	['focus', 'surface', UI],
	['line-strong', 'bg', UI],
	['line-strong', 'surface', UI]
];

describe.each([
	['terang', ':root'],
	['gelap', ":root[data-theme='dark']"]
])('kontras tema %s', (_nama, selector) => {
	const t = tokens(selector);
	it.each(pasangan)('%s di atas %s ≥ %d:1', (depan, latar, minimal) => {
		expect(t[depan], `token --dk-${depan} belum ada`).toBeDefined();
		expect(t[latar], `token --dk-${latar} belum ada`).toBeDefined();
		expect(ratio(t[depan], t[latar])).toBeGreaterThanOrEqual(minimal);
	});
});
