// E2E fungsi admin-akun terhadap Supabase sungguhan. Membuat admin & kasir sementara, menghapusnya di akhir.
// Password hanya ada di memori. Jalankan: node --env-file=.env.local scripts/uji-akun.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { usernameToEmail } from '../src/lib/auth/username.ts';

const url = process.env.SUPABASE_URL!;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY!;
const tag = randomBytes(3).toString('hex');
const hapus: string[] = [];
let gagal = 0;
const cek = (nama: string, ok: boolean, info = '') => {
	if (!ok) gagal++;
	console.log(`${ok ? 'OK   ' : 'GAGAL'} ${nama}${info ? ` — ${info}` : ''}`);
};

async function masuk(username: string, password: string): Promise<{ c: SupabaseClient; error: string | null }> {
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const { error } = await c.auth.signInWithPassword({ email: usernameToEmail(username), password });
	return { c, error: error?.code ?? error?.message ?? null };
}
async function panggil(c: SupabaseClient, body: Record<string, unknown>) {
	const { data, error } = await c.functions.invoke('admin-akun', { body });
	if (!error) return { status: 200, data };
	const res = (error as { context?: Response }).context;
	return { status: res?.status ?? 0, data: await res?.json().catch(() => null) };
}

try {
	const pwAdmin = randomBytes(12).toString('base64url');
	const uAdmin = `uji.admin.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(uAdmin),
		password: pwAdmin,
		email_confirm: true,
		app_metadata: { username: uAdmin, nama_tampilan: 'Uji Admin', role: 'admin', outlet_kode: null }
	});
	if (a.error) throw new Error(a.error.message);
	hapus.push(a.data.user.id);
	const { c: admin, error: eAdmin } = await masuk(uAdmin, pwAdmin);
	if (eAdmin) throw new Error(`admin sementara gagal login: ${eAdmin}`);

	const tanpaSesi = createClient(url, anonKey, { auth: { persistSession: false } });
	const anonim = await panggil(tanpaSesi, { aksi: 'reset_password', id: a.data.user.id });
	cek('tanpa login → 401', anonim.status === 401, String(anonim.status));

	const uKasir = `uji.kasir.${tag}`;
	const buat = await panggil(admin, { aksi: 'buat', username: uKasir, nama_tampilan: 'Uji Kasir', role: 'kasir', outlet_kode: 'KP' });
	cek('admin membuat kasir', buat.status === 200 && typeof buat.data?.password === 'string', String(buat.status));
	if (buat.data?.id) hapus.push(buat.data.id);
	if (buat.status !== 200) throw new Error('langkah buat gagal; pemeriksaan berikutnya dilewati');

	const dobel = await panggil(admin, { aksi: 'buat', username: uKasir, nama_tampilan: 'X', role: 'kasir', outlet_kode: 'KP' });
	cek('username ganda ditolak 409', dobel.status === 409, String(dobel.status));

	const k1 = await masuk(uKasir, buat.data.password);
	cek('kasir baru bisa login', k1.error === null, k1.error ?? '');
	const prof = await k1.c.from('profiles').select('role, outlets(kode)').single();
	cek('kasir baru terikat ke KP', prof.data?.role === 'kasir' && (prof.data as any)?.outlets?.kode === 'KP');

	const olehKasir = await panggil(k1.c, { aksi: 'reset_password', id: hapus[0] });
	cek('kasir memanggil fungsi → 403', olehKasir.status === 403, String(olehKasir.status));

	// Kunci profil (migrasi 0006) di server sungguhan: klien kasir & admin tidak bisa menulis profil langsung.
	const kasirTulis = await k1.c.from('profiles').update({ role: 'admin' }).eq('id', buat.data.id);
	const adminTulis = await admin.from('profiles').update({ aktif: false }).eq('id', buat.data.id);
	const sesudah = await svc.from('profiles').select('role, aktif').eq('id', buat.data.id).single();
	cek(
		'profil tidak bisa diubah langsung lewat API (kasir & admin → 42501)',
		kasirTulis.error?.code === '42501' && adminTulis.error?.code === '42501' && sesudah.data?.role === 'kasir' && sesudah.data?.aktif === true,
		`${kasirTulis.error?.code}/${adminTulis.error?.code}`
	);

	const pindah = await panggil(admin, { aksi: 'ubah', id: buat.data.id, outlet_kode: 'TK', nama_tampilan: 'Uji Kasir TK' });
	const prof2 = await svc.from('profiles').select('nama_tampilan, outlets(kode)').eq('id', buat.data.id).single();
	cek('admin memindah outlet & nama', pindah.status === 200 && (prof2.data as any)?.outlets?.kode === 'TK');

	const reset = await panggil(admin, { aksi: 'reset_password', id: buat.data.id });
	const lama = await masuk(uKasir, buat.data.password);
	const baru = await masuk(uKasir, reset.data?.password ?? '');
	cek('reset password: lama ditolak, baru diterima', lama.error === 'invalid_credentials' && baru.error === null, `${lama.error}/${baru.error}`);

	const nonaktif = await panggil(admin, { aksi: 'set_aktif', id: buat.data.id, aktif: false });
	const diblokir = await masuk(uKasir, reset.data.password);
	cek('nonaktif langsung tidak bisa login (user_banned)', nonaktif.status === 200 && diblokir.error === 'user_banned', diblokir.error ?? '');

	const aktif = await panggil(admin, { aksi: 'set_aktif', id: buat.data.id, aktif: true });
	const lagi = await masuk(uKasir, reset.data.password);
	cek('aktif lagi bisa login', aktif.status === 200 && lagi.error === null, lagi.error ?? '');

	const diriSendiri = await panggil(admin, { aksi: 'set_aktif', id: hapus[0], aktif: false });
	cek('admin tidak bisa menonaktifkan dirinya', diriSendiri.status === 400, String(diriSendiri.status));

	const rusak = await panggil(admin, { aksi: 'hapus_semua' });
	cek('aksi asing ditolak 400', rusak.status === 400, String(rusak.status));
} finally {
	let sisa = 0;
	for (const id of hapus.reverse()) {
		const { error } = await svc.auth.admin.deleteUser(id);
		if (error) {
			sisa++;
			gagal++;
			console.error(`GAGAL menghapus akun sementara ${id}: ${error.message} — hapus manual di Supabase Studio!`);
		}
	}
	console.log(`\nAkun sementara dihapus: ${hapus.length - sisa} dari ${hapus.length}`);
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
