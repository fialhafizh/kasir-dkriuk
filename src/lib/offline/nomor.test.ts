import { describe, expect, it } from 'vitest';
import { ambilUrutSementara, kodeStruk, nomorSementara } from './nomor';

function memori() {
	const isi = new Map<string, string>();
	return { getItem: (k: string) => isi.get(k) ?? null, setItem: (k: string, v: string) => void isi.set(k, v), removeItem: (k: string) => void isi.delete(k) };
}

describe('kode struk & nomor sementara', () => {
	it('kode struk: 6 karakter tanpa 0/1/I/O, tetap untuk id yang sama, berbeda untuk id lain', () => {
		const a = kodeStruk('8f14e45f-ceea-467a-9e2b-1b2a3c4d5e6f');
		expect(a).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
		expect(kodeStruk('8f14e45f-ceea-467a-9e2b-1b2a3c4d5e6f')).toBe(a);
		expect(kodeStruk('00000000-0000-4000-8000-000000000001')).not.toBe(a);
	});
	it('nomor sementara S<kode>-NNN; urut per hari per perangkat', () => {
		expect(nomorSementara(3, 7)).toBe('S3-007');
		const s = memori();
		expect(ambilUrutSementara(s, '2026-10-08')).toBe(1);
		expect(ambilUrutSementara(s, '2026-10-08')).toBe(2);
		expect(ambilUrutSementara(s, '2026-10-09')).toBe(1);
	});
});

describe('review: kode struk dari bagian acak id', () => {
	it('id yang hanya berbeda di bagian akhir menghasilkan kode berbeda', () => {
		expect(kodeStruk('8f14e45f-ceea-467a-9e2b-1b2a3c4d5e6f')).not.toBe(kodeStruk('8f14e45f-ceea-467a-9e2b-ffffffffffff'));
	});
});
