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
