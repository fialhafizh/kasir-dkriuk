import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

let template: Blob | File | null = null;

async function migratedSnapshot(): Promise<Blob | File> {
	if (template) return template;
	const db = new PGlite();
	await db.exec(readFileSync(join(ROOT, 'tests/db/auth-stub.sql'), 'utf8'));
	const dir = join(ROOT, 'supabase/migrations');
	for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
		await db.exec(readFileSync(join(dir, f), 'utf8'));
	}
	template = await db.dumpDataDir();
	await db.close();
	return template;
}

/** Database baru yang sudah dimigrasi; migrasi dijalankan sekali lalu disalin per test. */
export async function freshDb(): Promise<PGlite> {
	return new PGlite({ loadDataDir: await migratedSnapshot() });
}

export interface MetaUser {
	username: string;
	role: 'admin' | 'kasir';
	outlet_kode?: string | null;
	nama_tampilan?: string;
}

const APP_META_BAWAAN = { provider: 'email', providers: ['email'] };

/**
 * Meniru auth.admin.createUser di Supabase Auth (internal/api/admin.go), dalam satu transaksi:
 * 1) INSERT user dengan app_metadata bawaan (provider saja),
 * 2) UPDATE app_metadata dengan data dari admin (peran & outlet).
 * user_metadata opsional untuk menguji bahwa ia diabaikan.
 */
export async function buatUser(db: PGlite, app: MetaUser, userMeta: Record<string, unknown> = {}): Promise<string> {
	const id = crypto.randomUUID();
	await db.transaction(async (tx) => {
		await tx.query('insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3, $4)', [
			id,
			`${app.username}@test.local`,
			JSON.stringify(APP_META_BAWAAN),
			JSON.stringify(userMeta)
		]);
		await tx.query('update auth.users set raw_app_meta_data = raw_app_meta_data || $2::jsonb where id = $1', [
			id,
			JSON.stringify(app)
		]);
	});
	return id;
}

/** Menjalankan fn sebagai user login (role authenticated, auth.uid() = userId). */
export async function sebagai<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
	await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
	await db.exec('set role authenticated');
	try {
		return await fn();
	} finally {
		await db.exec('reset role');
		await db.query(`select set_config('request.jwt.claims', '', false)`);
	}
}

/** Menjalankan fn sebagai pengunjung tanpa login (role anon, kunci publik). */
export async function sebagaiAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
	await db.exec('set role anon');
	try {
		return await fn();
	} finally {
		await db.exec('reset role');
	}
}
