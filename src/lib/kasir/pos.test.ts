import { beforeEach, describe, expect, it, vi } from 'vitest';

const shiftTerbuka = vi.fn();
vi.mock('#lib/auth/session.svelte.ts', () => ({ auth: { profile: { role: 'admin' }, outlet: null } }));
vi.mock('./api.ts', () => ({ shiftTerbuka: (...a: unknown[]) => shiftTerbuka(...a) }));

const { pos } = await import('./pos.svelte.ts');
const outlet = { id: 'o1', kode: 'BL', nama: 'Bukit Lama', merek: "D'Kriuk", alamat: '-', telepon: '-', aktif: true };
const shift = { id: 's1', outlet_id: 'o1', dibuka_at: '2026-10-05T01:00:00Z', modal: 100000 };

describe('pos.muatShift', () => {
	beforeEach(() => {
		shiftTerbuka.mockReset();
		pos.pilihOutlet(outlet);
	});

	it('gagal tanpa shift diketahui → status gagal', async () => {
		shiftTerbuka.mockRejectedValueOnce(new Error('Terjadi kesalahan.'));
		await pos.muatShift();
		expect(pos.status).toBe('gagal');
	});

	it('gagal sesaat padahal shift outlet ini sudah diketahui → layar jualan tetap (siap), pesan disimpan', async () => {
		shiftTerbuka.mockResolvedValueOnce(shift).mockRejectedValueOnce(new Error('Terjadi kesalahan.'));
		await pos.muatShift();
		await pos.muatShift();
		expect(pos.status).toBe('siap');
		expect(pos.shift).toEqual(shift);
		expect(pos.pesan).toBe('Terjadi kesalahan.');
	});
});
