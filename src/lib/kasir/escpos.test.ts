import { describe, expect, it } from 'vitest';
import { encodeStruk, potong, urlRawBT } from './escpos';

describe('ESC/POS', () => {
	it('diawali inisialisasi printer, tiap baris diakhiri LF, diakhiri umpan kertas', () => {
		const b = encodeStruk(['AB', 'C']);
		expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40]);
		expect([...b.slice(2, 8)]).toEqual([0x41, 0x42, 0x0a, 0x43, 0x0a, 0x1b]);
		expect([...b.slice(-3)]).toEqual([0x1b, 0x64, 4]);
	});
	it('karakter non-ASCII diganti "?" agar printer tidak mencetak sampah', () => {
		expect([...encodeStruk(['é']).slice(2, 4)]).toEqual([0x3f, 0x0a]);
	});
	it('potong menjadi paket BLE berukuran tetap', () => {
		const p = potong(new Uint8Array(250), 100);
		expect(p.map((x) => x.length)).toEqual([100, 100, 50]);
	});
	it('URL RawBT base64', () => {
		expect(urlRawBT(new Uint8Array([0x1b, 0x40]))).toBe('rawbt:base64,G0A=');
	});
});

import { kirimBertahap } from './escpos';

describe('kirimBertahap (BLE printer murah)', () => {
	it('default paket 20 byte, berurutan, dengan jeda di antaranya', async () => {
		const paket: number[] = [];
		const jeda: number[] = [];
		await kirimBertahap(new Uint8Array(45), async (p) => void paket.push(p.length), { tunda: async (ms) => void jeda.push(ms) });
		expect(paket).toEqual([20, 20, 5]);
		expect(jeda).toEqual([15, 15]);
	});
	it('galat menulis dihentikan dan diteruskan', async () => {
		let ke = 0;
		await expect(
			kirimBertahap(new Uint8Array(60), async () => {
				if (++ke === 2) throw new Error('putus');
			}, { tunda: async () => {} })
		).rejects.toThrow('putus');
		expect(ke).toBe(2);
	});
});
