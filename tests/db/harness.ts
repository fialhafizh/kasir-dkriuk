import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

export async function freshDb(): Promise<PGlite> {
	const db = new PGlite();
	await db.exec(readFileSync(join(ROOT, 'tests/db/auth-stub.sql'), 'utf8'));
	const dir = join(ROOT, 'supabase/migrations');
	for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
		await db.exec(readFileSync(join(dir, f), 'utf8'));
	}
	return db;
}

export interface MetaUser {
	username: string;
	role: 'admin' | 'kasir';
	outlet_kode?: string | null;
	nama_tampilan?: string;
}

/** Meniru pembuatan user oleh Supabase Auth; trigger akan membuat profilnya. */
export async function buatUser(db: PGlite, meta: MetaUser): Promise<string> {
	const id = crypto.randomUUID();
	await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
		id,
		`${meta.username}@test.local`,
		JSON.stringify(meta)
	]);
	return id;
}

/** Menjalankan fn sebagai user login (role authenticated, auth.uid() = userId). */
export async function sebagai<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
	await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
	await db.exec('set role authenticated');
	try {
		return await fn();
	} finally {
		await db.exec('reset role');
		await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
	}
}
