// Logika murni fungsi server admin-akun. Tanpa impor: dipakai Deno (Edge Function) dan Vitest.
// Konstanta harus identik dengan src/lib/auth/* — dijaga oleh tests/functions/akun.test.ts.

export const USERNAME_PATTERN_FN = String.raw`^[a-z0-9](?:[a-z0-9_-]|\.(?!\.)){1,30}[a-z0-9]$`;
export const AUTH_EMAIL_DOMAIN_FN = 'kasir-dkriuk.invalid';
/** ban_duration Supabase Auth untuk akun nonaktif (±100 tahun). */
export const BAN_SELAMANYA = '876000h';

const USERNAME_RE = new RegExp(USERNAME_PATTERN_FN);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KODE_OUTLET_RE = /^[A-Z]{2,4}$/;

export type Peran = 'admin' | 'kasir';

export type Perintah =
	| { aksi: 'buat'; username: string; nama_tampilan: string; role: Peran; outlet_kode: string | null }
	| { aksi: 'ubah'; id: string; nama_tampilan?: string; outlet_kode?: string }
	| { aksi: 'reset_password'; id: string }
	| { aksi: 'set_aktif'; id: string; aktif: boolean };

type Hasil = { ok: true; perintah: Perintah } | { ok: false; error: string };
const gagal = (error: string): Hasil => ({ ok: false, error });

export function emailDariUsername(u: string): string {
	return `${u.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN_FN}`;
}

function nama(v: unknown): string | null {
	return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 60 ? v.trim() : null;
}

export function bacaPerintah(body: unknown): Hasil {
	const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
	switch (b.aksi) {
		case 'buat': {
			const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
			if (!USERNAME_RE.test(username)) return gagal('Username tidak sah.');
			const n = nama(b.nama_tampilan);
			if (!n) return gagal('Nama tampilan wajib diisi.');
			if (b.role !== 'admin' && b.role !== 'kasir') return gagal('Peran tidak dikenal.');
			const kode = typeof b.outlet_kode === 'string' && KODE_OUTLET_RE.test(b.outlet_kode) ? b.outlet_kode : null;
			if (b.role === 'kasir' && !kode) return gagal('Akun kasir harus punya outlet.');
			return { ok: true, perintah: { aksi: 'buat', username, nama_tampilan: n, role: b.role, outlet_kode: b.role === 'kasir' ? kode : null } };
		}
		case 'ubah': {
			if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return gagal('ID akun tidak sah.');
			const p: Perintah = { aksi: 'ubah', id: b.id };
			if (b.nama_tampilan !== undefined) {
				const n = nama(b.nama_tampilan);
				if (!n) return gagal('Nama tampilan wajib diisi.');
				p.nama_tampilan = n;
			}
			if (b.outlet_kode !== undefined) {
				if (typeof b.outlet_kode !== 'string' || !KODE_OUTLET_RE.test(b.outlet_kode)) return gagal('Kode outlet tidak sah.');
				p.outlet_kode = b.outlet_kode;
			}
			if (p.nama_tampilan === undefined && p.outlet_kode === undefined) return gagal('Tidak ada yang diubah.');
			return { ok: true, perintah: p };
		}
		case 'reset_password':
			if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return gagal('ID akun tidak sah.');
			return { ok: true, perintah: { aksi: 'reset_password', id: b.id } };
		case 'set_aktif':
			if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return gagal('ID akun tidak sah.');
			if (typeof b.aktif !== 'boolean') return gagal('Status aktif harus ya/tidak.');
			return { ok: true, perintah: { aksi: 'set_aktif', id: b.id, aktif: b.aktif } };
		default:
			return gagal('Aksi tidak dikenal.');
	}
}

export function cekBolehNonaktif(a: { pemanggilId: string; targetId: string; targetRole: Peran; adminAktif: string[] }): string | null {
	if (a.pemanggilId === a.targetId) return 'Anda tidak bisa menonaktifkan akun Anda sendiri.';
	if (a.targetRole === 'admin' && a.adminAktif.filter((id) => id !== a.targetId).length === 0) {
		return 'Minimal harus ada satu admin aktif.';
	}
	return null;
}

/** 9 byte acak → 12 karakter base64url (72 bit), mudah diketik di HP. */
export function passwordDariAcak(bytes: Uint8Array): string {
	let biner = '';
	for (const x of bytes) biner += String.fromCharCode(x);
	return btoa(biner).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
