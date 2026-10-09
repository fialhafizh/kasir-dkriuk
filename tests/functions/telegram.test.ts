import { describe, expect, it } from 'vitest';
import { badanPesan, bacaPerintah, calonGrup, nilaiBalasan, TOPIK, topikKurang } from '../../supabase/functions/_shared/telegram';

describe('Edge Function telegram (logika murni)', () => {
	it('bacaPerintah: aksi dikenal, chat_id harus bilangan bulat', () => {
		expect(bacaPerintah({ aksi: 'kirim' })).toEqual({ ok: true, perintah: { aksi: 'kirim' } });
		expect(bacaPerintah({ aksi: 'uji' })).toEqual({ ok: true, perintah: { aksi: 'uji' } });
		expect(bacaPerintah({ aksi: 'hubungkan' })).toEqual({ ok: true, perintah: { aksi: 'hubungkan' } });
		expect(bacaPerintah({ aksi: 'hubungkan', chat_id: -1001 })).toEqual({ ok: true, perintah: { aksi: 'hubungkan', chat_id: -1001 } });
		expect(bacaPerintah({ aksi: 'hubungkan', chat_id: '-1001' }).ok).toBe(false);
		expect(bacaPerintah({ aksi: 'hapus' }).ok).toBe(false);
		expect(bacaPerintah(null).ok).toBe(false);
	});

	it('badanPesan: HTML, topik bila ada, tanpa pratinjau tautan', () => {
		expect(badanPesan(-1001, 5, 'x')).toEqual({ chat_id: -1001, message_thread_id: 5, text: 'x', parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
		expect(badanPesan(-1001, null, 'x')).not.toHaveProperty('message_thread_id');
	});

	it('nilaiBalasan: sukses, galat biasa, batas kecepatan', () => {
		expect(nilaiBalasan(200, { ok: true })).toEqual({ ok: true });
		expect(nilaiBalasan(400, { ok: false, error_code: 400, description: 'Bad Request: message thread not found' })).toEqual({
			ok: false,
			galat: '400: Bad Request: message thread not found'
		});
		expect(nilaiBalasan(429, { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 7.2 } })).toMatchObject({
			ok: false,
			tundaDetik: 8
		});
		expect(nilaiBalasan(502, null)).toEqual({ ok: false, galat: '502: tidak diketahui' });
	});

	it('calonGrup: hanya supergrup, tanpa duplikat', () => {
		const upd = [
			{ message: { chat: { id: -1001, type: 'supergroup', title: 'Backup Dkriuk' } } },
			{ my_chat_member: { chat: { id: -1001, type: 'supergroup', title: 'Backup Dkriuk' } } },
			{ message: { chat: { id: -5, type: 'group', title: 'Lama' } } },
			{ message: { chat: { id: 9, type: 'private' } } }
		];
		expect(calonGrup(upd)).toEqual([{ chat_id: -1001, judul: 'Backup Dkriuk' }]);
		expect(calonGrup(undefined)).toEqual([]);
	});

	it('topikKurang: hanya yang belum punya id', () => {
		expect(topikKurang({ struk: 2, kas: 5 }).map((t) => t.kunci)).toEqual(['harian', 'peringatan']);
		expect(topikKurang(null)).toHaveLength(TOPIK.length);
	});
});
