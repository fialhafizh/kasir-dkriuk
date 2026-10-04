import { AUTH_EMAIL_DOMAIN } from './domain.js';

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(raw: string): string {
	return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
	const u = normalizeUsername(raw);
	if (u.length === 0) return 'Username wajib diisi.';
	if (!USERNAME_RE.test(u)) return 'Username 3–32 karakter: huruf kecil, angka, titik, minus, atau garis bawah.';
	return null;
}

export function usernameToEmail(raw: string): string {
	return `${normalizeUsername(raw)}@${AUTH_EMAIL_DOMAIN}`;
}
