import { describe, expect, it } from 'vitest';
import { AUTH_EMAIL_DOMAIN } from '../../src/lib/auth/domain.js';
import { USERNAME_PATTERN } from '../../src/lib/auth/username';
import {
	AUTH_EMAIL_DOMAIN_FN,
	bacaPerintah,
	BAN_SELAMANYA,
	cekBolehNonaktif,
	emailDariUsername,
	passwordDariAcak,
	USERNAME_PATTERN_FN
} from '../../supabase/functions/_shared/akun';

const id = '11111111-1111-4111-8111-111111111111';

describe('konstanta sama dengan aplikasi', () => {
	it('pola username & domain email identik', () => {
		expect(USERNAME_PATTERN_FN).toBe(USERNAME_PATTERN);
		expect(AUTH_EMAIL_DOMAIN_FN).toBe(AUTH_EMAIL_DOMAIN);
		expect(emailDariUsername(' Kasir.Baru ')).toBe(`kasir.baru@${AUTH_EMAIL_DOMAIN}`);
	});
});

describe('bacaPerintah', () => {
	it('buat kasir sah (username dinormalisasi)', () => {
		expect(bacaPerintah({ aksi: 'buat', username: ' Kasir.Baru ', nama_tampilan: ' Budi ', role: 'kasir', outlet_kode: 'BL' })).toEqual({
			ok: true,
			perintah: { aksi: 'buat', username: 'kasir.baru', nama_tampilan: 'Budi', role: 'kasir', outlet_kode: 'BL' }
		});
	});
	it('buat admin tanpa outlet', () => {
		const r = bacaPerintah({ aksi: 'buat', username: 'owner2', nama_tampilan: 'Owner 2', role: 'admin', outlet_kode: null });
		expect(r).toEqual({ ok: true, perintah: { aksi: 'buat', username: 'owner2', nama_tampilan: 'Owner 2', role: 'admin', outlet_kode: null } });
	});
	it('menolak kasir tanpa outlet, username tidak sah, nama kosong, peran asing', () => {
		expect(bacaPerintah({ aksi: 'buat', username: 'kasir.x', nama_tampilan: 'X', role: 'kasir', outlet_kode: null })).toEqual({
			ok: false,
			error: 'Akun kasir harus punya outlet.'
		});
		expect(bacaPerintah({ aksi: 'buat', username: 'a..b', nama_tampilan: 'X', role: 'kasir', outlet_kode: 'BL' }).ok).toBe(false);
		expect(bacaPerintah({ aksi: 'buat', username: 'kasir.x', nama_tampilan: '  ', role: 'kasir', outlet_kode: 'BL' })).toEqual({
			ok: false,
			error: 'Nama tampilan wajib diisi.'
		});
		expect(bacaPerintah({ aksi: 'buat', username: 'kasir.x', nama_tampilan: 'X', role: 'owner', outlet_kode: 'BL' })).toEqual({
			ok: false,
			error: 'Peran tidak dikenal.'
		});
	});
	it('ubah, reset, set_aktif butuh id uuid', () => {
		expect(bacaPerintah({ aksi: 'reset_password', id })).toEqual({ ok: true, perintah: { aksi: 'reset_password', id } });
		expect(bacaPerintah({ aksi: 'set_aktif', id, aktif: false })).toEqual({ ok: true, perintah: { aksi: 'set_aktif', id, aktif: false } });
		expect(bacaPerintah({ aksi: 'ubah', id, nama_tampilan: 'Sari', outlet_kode: 'TK' })).toEqual({
			ok: true,
			perintah: { aksi: 'ubah', id, nama_tampilan: 'Sari', outlet_kode: 'TK' }
		});
		expect(bacaPerintah({ aksi: 'reset_password', id: 'bukan-uuid' })).toEqual({ ok: false, error: 'ID akun tidak sah.' });
		expect(bacaPerintah({ aksi: 'set_aktif', id })).toEqual({ ok: false, error: 'Status aktif harus ya/tidak.' });
		expect(bacaPerintah({ aksi: 'ubah', id })).toEqual({ ok: false, error: 'Tidak ada yang diubah.' });
	});
	it('aksi asing dan body rusak ditolak', () => {
		expect(bacaPerintah({ aksi: 'hapus_semua' })).toEqual({ ok: false, error: 'Aksi tidak dikenal.' });
		expect(bacaPerintah(null)).toEqual({ ok: false, error: 'Aksi tidak dikenal.' });
		expect(bacaPerintah('teks')).toEqual({ ok: false, error: 'Aksi tidak dikenal.' });
	});
});

describe('cekBolehNonaktif', () => {
	it('admin tidak boleh menonaktifkan dirinya sendiri', () => {
		expect(cekBolehNonaktif({ pemanggilId: 'a1', targetId: 'a1', targetRole: 'admin', adminAktif: ['a1', 'a2'] })).toBe(
			'Anda tidak bisa menonaktifkan akun Anda sendiri.'
		);
	});
	it('admin aktif terakhir tidak boleh dinonaktifkan', () => {
		expect(cekBolehNonaktif({ pemanggilId: 'a2', targetId: 'a1', targetRole: 'admin', adminAktif: ['a1'] })).toBe(
			'Minimal harus ada satu admin aktif.'
		);
	});
	it('boleh menonaktifkan kasir atau admin lain selama masih ada admin aktif', () => {
		expect(cekBolehNonaktif({ pemanggilId: 'a1', targetId: 'k1', targetRole: 'kasir', adminAktif: ['a1'] })).toBeNull();
		expect(cekBolehNonaktif({ pemanggilId: 'a1', targetId: 'a2', targetRole: 'admin', adminAktif: ['a1', 'a2'] })).toBeNull();
	});
});

describe('password & blokir', () => {
	it('12 karakter base64url dari 9 byte acak', () => {
		expect(passwordDariAcak(new Uint8Array(9).fill(255))).toBe('____________');
		expect(passwordDariAcak(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8]))).toMatch(/^[A-Za-z0-9_-]{12}$/);
	});
	it('blokir "selamanya" ≈ 100 tahun', () => {
		expect(BAN_SELAMANYA).toBe('876000h');
	});
});

import { jalankanSetAktif, kunciServis } from '../../supabase/functions/_shared/akun';

describe('review Tugas 4: kunci servis', () => {
	it('memakai SUPABASE_SERVICE_ROLE_KEY bila ada', () => {
		expect(kunciServis({ SUPABASE_SERVICE_ROLE_KEY: 'lama', SUPABASE_SECRET_KEYS: '{"default":"baru"}' })).toBe('lama');
	});
	it('jatuh ke SUPABASE_SECRET_KEYS (sistem kunci baru)', () => {
		expect(kunciServis({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' })).toBe('sb_secret_x');
	});
	it('tidak ada kunci → null (handler membalas 500 yang jelas)', () => {
		expect(kunciServis({})).toBeNull();
		expect(kunciServis({ SUPABASE_SECRET_KEYS: 'rusak' })).toBeNull();
	});
});

describe('review Tugas 4: urutan aktif/nonaktif', () => {
	function rekam(gagal: Partial<Record<'profil' | 'ban', boolean>> = {}) {
		const log: string[] = [];
		return {
			log,
			ops: {
				ubahProfil: async (aktif: boolean) => {
					log.push(`profil:${aktif}`);
					if (gagal.profil && log.filter((l) => l.startsWith('profil')).length === 1) throw new Error('x');
				},
				ubahBan: async (aktif: boolean) => {
					log.push(`ban:${aktif}`);
					if (gagal.ban) throw new Error('x');
				}
			}
		};
	}

	it('nonaktif: profil dulu (akses langsung terputus), lalu blokir login', async () => {
		const r = rekam();
		expect(await jalankanSetAktif(false, r.ops)).toBeNull();
		expect(r.log).toEqual(['profil:false', 'ban:false']);
	});
	it('nonaktif: blokir gagal → profil dikembalikan aktif, pesan coba lagi', async () => {
		const r = rekam({ ban: true });
		expect(await jalankanSetAktif(false, r.ops)).toBe('Status login gagal diubah. Coba lagi.');
		expect(r.log).toEqual(['profil:false', 'ban:false', 'profil:true']);
	});
	it('aktif: buka blokir dulu, lalu profil', async () => {
		const r = rekam();
		expect(await jalankanSetAktif(true, r.ops)).toBeNull();
		expect(r.log).toEqual(['ban:true', 'profil:true']);
	});
	it('profil gagal diubah → pesan, tanpa memblokir', async () => {
		const r = rekam({ profil: true });
		expect(await jalankanSetAktif(false, r.ops)).toBe('Status akun gagal disimpan. Coba lagi.');
		expect(r.log).toEqual(['profil:false']);
	});
});

describe('review Tugas 4: kasus perintah tambahan', () => {
	it('ubah dengan kode outlet atau nama tidak sah ditolak', () => {
		expect(bacaPerintah({ aksi: 'ubah', id, outlet_kode: 'bl' })).toEqual({ ok: false, error: 'Kode outlet tidak sah.' });
		expect(bacaPerintah({ aksi: 'ubah', id, nama_tampilan: '  ' })).toEqual({ ok: false, error: 'Nama tampilan wajib diisi.' });
		expect(bacaPerintah({ aksi: 'ubah', id, nama_tampilan: 'x'.repeat(61) })).toEqual({ ok: false, error: 'Nama tampilan wajib diisi.' });
	});
	it('admin baru selalu tanpa outlet walau dikirim', () => {
		const r = bacaPerintah({ aksi: 'buat', username: 'owner3', nama_tampilan: 'O', role: 'admin', outlet_kode: 'BL' });
		expect(r.ok && r.perintah.aksi === 'buat' && r.perintah.outlet_kode).toBe(null);
	});
});
