import { AUTH_EMAIL_DOMAIN } from './domain.js';

/** Sama persis dengan constraint profiles_username_check di database. */
export const USERNAME_PATTERN = String.raw`^[a-z0-9](?:[a-z0-9_-]|\.(?!\.)){1,30}[a-z0-9]$`;
const USERNAME_RE = new RegExp(USERNAME_PATTERN);

export function normalizeUsername(raw: string): string {
	return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
	const u = normalizeUsername(raw);
	if (u.length === 0) return 'Username wajib diisi.';
	if (u.length < 3 || u.length > 32) return 'Username harus 3–32 karakter.';
	if (!USERNAME_RE.test(u)) {
		return 'Username hanya boleh huruf kecil, angka, titik, minus, atau garis bawah, diawali dan diakhiri huruf/angka.';
	}
	return null;
}

export function usernameToEmail(raw: string): string {
	return `${normalizeUsername(raw)}@${AUTH_EMAIL_DOMAIN}`;
}
