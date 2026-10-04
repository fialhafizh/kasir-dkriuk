import { randomBytes } from 'node:crypto';
import { usernameToEmail, validateUsername } from '../../src/lib/auth/username.ts';

export interface AkunAwal {
	username: string;
	nama_tampilan: string;
	role: 'admin' | 'kasir';
	outlet_kode: string | null;
}

export const AKUN_AWAL: readonly AkunAwal[] = [
	{ username: 'admin', nama_tampilan: 'Owner', role: 'admin', outlet_kode: null },
	{ username: 'kasir.bukitlama', nama_tampilan: 'Kasir Bukit Lama', role: 'kasir', outlet_kode: 'BL' },
	{ username: 'kasir.talangkerangga', nama_tampilan: 'Kasir Talang Kerangga', role: 'kasir', outlet_kode: 'TK' },
	{ username: 'kasir.kertapati', nama_tampilan: 'Kasir Kertapati', role: 'kasir', outlet_kode: 'KP' }
];

/** Payload untuk supabase.auth.admin.createUser. Peran di app_metadata: pengguna tidak bisa mengubahnya. */
export function payloadBuatAkun(akun: AkunAwal, password: string) {
	const salah = validateUsername(akun.username);
	if (salah) throw new Error(`Username "${akun.username}" tidak sah: ${salah}`);
	return {
		email: usernameToEmail(akun.username),
		password,
		email_confirm: true,
		app_metadata: {
			username: akun.username,
			nama_tampilan: akun.nama_tampilan,
			role: akun.role,
			outlet_kode: akun.outlet_kode
		}
	};
}

/** 12 karakter acak (72 bit), hanya huruf/angka/-/_ supaya mudah diketik di HP. */
export function buatPassword(): string {
	return randomBytes(9).toString('base64url');
}
