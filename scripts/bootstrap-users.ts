// Membuat 4 akun awal. Jalankan sekali:
//   node --env-file=.env.local scripts/bootstrap-users.ts
// Password ditulis ke akun-awal.txt (diabaikan git), tidak ditampilkan di layar.
import { createClient } from '@supabase/supabase-js';
import { existsSync, writeFileSync } from 'node:fs';
import { AKUN_AWAL, buatPassword, payloadBuatAkun } from './lib/akun-awal.ts';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
	console.error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local terlebih dahulu.');
	process.exit(1);
}

const OUTPUT = 'akun-awal.txt';
if (existsSync(OUTPUT)) {
	console.error(`${OUTPUT} sudah ada. Pindahkan/hapus dulu supaya password lama tidak tertimpa.`);
	process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const baris: string[] = ['Akun awal Kasir D\'Kriuk — simpan di tempat aman, lalu hapus file ini.', ''];
let gagal = 0;

for (const akun of AKUN_AWAL) {
	const password = buatPassword();
	const { error } = await admin.auth.admin.createUser(payloadBuatAkun(akun, password));
	if (error) {
		gagal++;
		console.log(`${akun.username.padEnd(22)} GAGAL: ${error.message}`);
		continue;
	}
	baris.push(`${akun.username.padEnd(22)} ${password}`);
	console.log(`${akun.username.padEnd(22)} dibuat`);
}

if (baris.length > 2) {
	writeFileSync(OUTPUT, baris.join('\n') + '\n', { encoding: 'utf8', flag: 'wx' });
	console.log(`\nPassword tersimpan di ${OUTPUT}.`);
}
process.exit(gagal ? 1 : 0);
