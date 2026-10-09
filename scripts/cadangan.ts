// Cadangan data server (Tahap 8): semua tabel public → cadangan/<tanggal-jam>/<tabel>.json (folder TIDAK di-commit).
//   npm run cadangan
// Isi cadangan = data bisnis (harga, gaji, penjualan): simpan di tempat aman, jangan dibagikan.
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const akar = join(import.meta.dirname, '..');
const svc = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const tabel = [
	...new Set(
		readdirSync(join(akar, 'supabase/migrations'))
			.filter((f) => f.endsWith('.sql'))
			.flatMap((f) => [...readFileSync(join(akar, 'supabase/migrations', f), 'utf8').matchAll(/create table public\.(\w+)/g)].map((m) => m[1]))
	)
].sort();
const cap = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 16).replace(/[:T]/g, '-');
const dir = join(akar, 'cadangan', cap);
mkdirSync(dir, { recursive: true });
let gagal = 0;
for (const t of tabel) {
	const semua: unknown[] = [];
	for (let dari = 0; ; dari += 1000) {
		const { data, error } = await svc.from(t).select('*').range(dari, dari + 999);
		if (error) {
			gagal++;
			console.error(`GAGAL ${t}: ${error.message}`);
			break;
		}
		semua.push(...data);
		if (data.length < 1000) break;
	}
	writeFileSync(join(dir, `${t}.json`), JSON.stringify(semua));
	console.log(`${t.padEnd(28)} ${String(semua.length).padStart(7)} baris`);
}
const { data: u } = await svc.auth.admin.listUsers({ perPage: 1000 });
writeFileSync(join(dir, '_akun.json'), JSON.stringify((u?.users ?? []).map((x) => ({ id: x.id, email: x.email, app_metadata: x.app_metadata, created_at: x.created_at }))));
console.log(`\nCadangan tersimpan di cadangan/${cap} (${tabel.length} tabel)${gagal ? `, ${gagal} gagal` : ''}.`);
process.exit(gagal ? 1 : 0);
