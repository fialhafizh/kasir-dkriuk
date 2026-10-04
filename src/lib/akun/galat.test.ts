import { describe, expect, it } from 'vitest';
import { bacaGalatFungsi } from './galat';

// Bentuk galat functions-js: FunctionsHttpError (context = Response), FunctionsFetchError (context = TypeError).
const http = (r: Response) => ({ name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: r });

const res = (status: number, body: unknown) =>
	new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('bacaGalatFungsi', () => {
	it('memakai pesan Indonesia dari fungsi server', async () => {
		expect(await bacaGalatFungsi(http(res(409, { error: 'Username sudah dipakai.' })))).toBe(
			'Username sudah dipakai.'
		);
	});
	it('jaringan putus (FunctionsFetchError, context = TypeError) → pesan koneksi', async () => {
		const galat = { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: new TypeError('Failed to fetch') };
		expect(await bacaGalatFungsi(galat)).toBe(
			'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.'
		);
	});
	it('respons bukan JSON → pesan umum, tidak melempar', async () => {
		expect(await bacaGalatFungsi(http(res(502, '<html>Bad gateway</html>')))).toBe(
			'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.'
		);
	});
	it('sesi kedaluwarsa (401) → minta masuk ulang', async () => {
		expect(await bacaGalatFungsi(http(res(401, { error: 'Sesi tidak sah. Silakan masuk ulang.' })))).toBe(
			'Sesi tidak sah. Silakan masuk ulang.'
		);
	});
});
