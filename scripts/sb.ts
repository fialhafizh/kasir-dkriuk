// Menjalankan Supabase CLI dengan kredensial dari .env.local tanpa menampilkannya.
//   npm run sb -- db push --dry-run
//   npm run sb -- functions deploy admin-akun --use-api
import { spawnSync } from 'node:child_process';

const rahasia = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS']
	.map((k) => process.env[k])
	.filter((v): v is string => !!v)
	.flatMap((v) => [v, ...(v.match(/sb_secret_[\w-]+/g) ?? [])]);
const args = process.argv
	.slice(2)
	.map((a) => a.replaceAll('{REF}', process.env.SUPABASE_PROJECT_REF ?? ''))
	.map((a) => (/[\s"]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a));
const r = spawnSync(['npx', 'supabase', ...args].join(' '), { shell: true, encoding: 'utf8', env: process.env });
let out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
for (const s of rahasia) out = out.split(s).join('***').split(encodeURIComponent(s)).join('***');
process.stdout.write(out);
process.exit(r.status ?? 1);
