import { describe, expect, it } from 'vitest';
import { porsiPerKg, qtyKgDariPorsi } from './porsi';

describe('porsi beras', () => {
	it('0,1 kg per porsi = 10 porsi per kg', () => {
		expect(porsiPerKg(0.1)).toBe(10);
		expect(qtyKgDariPorsi(10)).toBe(0.1);
	});
	it('kalibrasi 14 porsi/kg dibulatkan 4 desimal', () => {
		expect(qtyKgDariPorsi(14)).toBe(0.0714);
		expect(porsiPerKg(0.0714)).toBe(14);
	});
	it('nilai tidak sah menghasilkan NaN agar UI menolak', () => {
		expect(qtyKgDariPorsi(0)).toBeNaN();
		expect(porsiPerKg(0)).toBeNaN();
	});
});

describe('review Tugas 3: porsi per kg dengan 1 desimal', () => {
	it('0,075 kg/porsi = 13,3 porsi/kg, bukan dibulatkan ke 13', () => {
		expect(porsiPerKg(0.075)).toBe(13.3);
	});
	it('bilangan bulat tetap stabil bolak-balik 9–15', () => {
		for (const p of [9, 10, 11, 12, 13, 14, 15]) expect(porsiPerKg(qtyKgDariPorsi(p))).toBe(p);
	});
});
