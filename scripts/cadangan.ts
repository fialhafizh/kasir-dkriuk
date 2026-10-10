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
	// urutan stabil (kolom pertama baris contoh, biasanya kunci) & jumlah pasti: halaman tidak dobel/terlewat walau batas baris server < 1000
	const contoh = await svc.from(t).select('*', { count: 'exact' }).limit(1);
	if (contoh.error) {
		gagal++;
		console.error(`GAGAL ${t}: ${contoh.error.message}`);
		continue;
	}
	const jumlah = contoh.count ?? 0;
	const urut = Object.keys(contoh.data?.[0] ?? {})[0];
	const semua: unknown[] = [];
	while (semua.length < jumlah) {
		let q = svc.from(t).select('*').range(semua.length, semua.length + 999);
		if (urut) q = q.order(urut, { ascending: true });
		const { data, error } = await q;
		if (error || !data?.length) {
			gagal++;
			console.error(`GAGAL ${t}: ${error?.message ?? 'halaman kosong sebelum semua baris terbaca'}`);
			break;
		}
		semua.push(...data);
	}
	writeFileSync(join(dir, `${t}.json`), JSON.stringify(semua));
	console.log(`${t.padEnd(28)} ${String(semua.length).padStart(7)} baris`);
}
const akun: unknown[] = [];
for (let hal = 1; ; hal++) {
	const { data: u, error } = await svc.auth.admin.listUsers({ page: hal, perPage: 200 });
	if (error) {
		gagal++;
		console.error(`GAGAL akun: ${error.message}`);
		break;
	}
	akun.push(...u.users.map((x) => ({ id: x.id, email: x.email, app_metadata: x.app_metadata, created_at: x.created_at })));
	if (u.users.length < 200) break;
}
writeFileSync(join(dir, '_akun.json'), JSON.stringify(akun));
console.log(`\nCadangan tersimpan di cadangan/${cap} (${tabel.length} tabel)${gagal ? `, ${gagal} gagal` : ''}.`);
process.exit(gagal ? 1 : 0);
