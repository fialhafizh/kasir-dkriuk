// Mengisi harga beli dari data/harga-beli.local.json (diabaikan git). Jalankan:
//   node --env-file=.env.local scripts/seed-harga-beli.ts
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { rencanaHargaBeli } from './lib/harga-beli.ts';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
	auth: { persistSession: false, autoRefreshToken: false }
});
const data = JSON.parse(readFileSync('data/harga-beli.local.json', 'utf8')) as Record<string, Record<string, number>>;
const [{ data: outlets }, { data: satuan }] = await Promise.all([
	db.from('outlets').select('id, kode'),
	db.from('satuan_beli').select('id, kode')
]);
const { baris, error } = rencanaHargaBeli(data, outlets ?? [], satuan ?? []);
if (error.length) {
	console.error(error.join('\n'));
	process.exit(1);
}
const { error: e } = await db.from('harga_beli').upsert(baris.map((b) => ({ ...b, diubah_at: new Date().toISOString() })));
if (e) {
	console.error(`Gagal menyimpan: ${e.message}`);
	process.exit(1);
}
console.log(`Harga beli tersimpan: ${baris.length} baris.`);
