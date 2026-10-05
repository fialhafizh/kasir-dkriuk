import { describe, expect, it } from 'vitest';
import { bacaPerangkat, simpanKode } from './perangkat';

function memori() {
	const isi = new Map<string, string>();
	return { getItem: (k: string) => isi.get(k) ?? null, setItem: (k: string, v: string) => void isi.set(k, v), removeItem: (k: string) => void isi.delete(k) };
}

describe('perangkat', () => {
	it('id dibuat sekali lalu tetap; kode tersimpan', () => {
		const s = memori();
		const a = bacaPerangkat(s);
		expect(a.kode).toBeNull();
		expect(bacaPerangkat(s).id).toBe(a.id);
		simpanKode(s, 7);
		expect(bacaPerangkat(s)).toEqual({ id: a.id, kode: 7 });
	});
});
