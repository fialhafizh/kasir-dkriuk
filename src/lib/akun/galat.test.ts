import { describe, expect, it } from 'vitest';
import { bacaGalatFungsi } from './galat';

const res = (status: number, body: unknown) =>
	new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('bacaGalatFungsi', () => {
	it('memakai pesan Indonesia dari fungsi server', async () => {
		expect(await bacaGalatFungsi({ message: 'Edge Function returned a non-2xx status code' }, res(409, { error: 'Username sudah dipakai.' }))).toBe(
			'Username sudah dipakai.'
		);
	});
	it('jaringan putus (tanpa respons) → pesan koneksi', async () => {
		expect(await bacaGalatFungsi({ message: 'Failed to send a request to the Edge Function' }, undefined)).toBe(
			'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.'
		);
	});
	it('respons bukan JSON → pesan umum, tidak melempar', async () => {
		expect(await bacaGalatFungsi({ message: 'x' }, res(502, '<html>Bad gateway</html>'))).toBe(
			'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.'
		);
	});
	it('sesi kedaluwarsa (401) → minta masuk ulang', async () => {
		expect(await bacaGalatFungsi({ message: 'x' }, res(401, { error: 'Sesi tidak sah. Silakan masuk ulang.' }))).toBe(
			'Sesi tidak sah. Silakan masuk ulang.'
		);
	});
});
