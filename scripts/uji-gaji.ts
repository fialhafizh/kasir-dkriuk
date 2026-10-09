// E2E gaji & laba-rugi (Tahap 5b) terhadap Supabase sungguhan: outlet "UJG", kasir & admin sementara; semua dihapus.
//   node --env-file=.env.local scripts/uji-gaji.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { usernameToEmail } from '../src/lib/auth/username.ts';

const url = process.env.SUPABASE_URL!;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY!;
let gagal = 0;
const cek = (nama: string, ok: boolean, info = '') => {
	if (!ok) gagal++;
	console.log(`${ok ? 'OK   ' : 'GAGAL'} ${nama}${info ? ` — ${info}` : ''}`);
};
const tag = randomBytes(3).toString('hex');
let outletId = '';
const users: string[] = [];
const jam = (mundurMenit: number) => new Date(Date.now() - mundurMenit * 60_000).toISOString();
// Bulan lalu menurut WIB: 'YYYY-MM'.
const wib = new Date(Date.now() + 7 * 3_600_000);
const lalu = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - 1, 1));
const bulan = lalu.toISOString().slice(0, 7);
const akhirBulan = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 0)).toISOString().slice(0, 10);

async function akun(nama: string, role: 'kasir' | 'admin'): Promise<SupabaseClient> {
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.${nama}.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: 'Uji', role, ...(role === 'kasir' ? { outlet_kode: 'UJG' } : {}) }
	});
	if (a.error) throw new Error(a.error.message);
	users.push(a.data.user.id);
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await c.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);
	return c;
}

try {
	const o = await svc.from('outlets').insert({ kode: 'UJG', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const k = await akun('kasirg', 'kasir');
	const adm = await akun('ading', 'admin');
	const saldo = async () => Number((await k.rpc('saldo_laci', { p_outlet: outletId })).data?.saldo);

	const kid = (await adm.rpc('simpan_karyawan', { p: { outlet_id: outletId, nama: 'Uji Budi', upah_harian: 70000 } })).data as string;
	const daftar = await k.rpc('karyawan_outlet', { p_outlet: outletId });
	cek('kasir melihat nama karyawan tanpa upah', daftar.data?.length === 1 && !('upah_harian' in (daftar.data?.[0] ?? {})), JSON.stringify(daftar.error ?? daftar.data));
	const baca = await k.from('karyawan').select('id');
	cek('kasir tidak membaca tabel karyawan', (baca.data ?? []).length === 0);

	for (const h of ['01', '02', '03']) await adm.rpc('atur_kehadiran', { p_karyawan: kid, p_tanggal: `${bulan}-${h}`, p_hadir: true });
	await k.rpc('buka_shift_offline', { p: { id: randomUUID(), outlet_id: outletId, modal: 300000, laci_awal: 300000, waktu: jam(30) } });
	const kb = await k.rpc('catat_kasbon_offline', { p: { id: randomUUID(), outlet_id: outletId, karyawan_id: kid, jumlah: 50000, waktu: jam(20) } });
	cek('kasbon dari laci mengurangi saldo', !kb.error && (await saldo()) === 250000, kb.error?.message);

	const gid = randomUUID();
	const bg = await adm.rpc('bayar_gaji', { p: { id: gid, karyawan_id: kid, bulan: `${bulan}-01`, penyesuaian: 0, potongan_kasbon: 50000, sumber: 'luar' } });
	cek('bayar gaji: 3 hari × upah − kasbon', bg.data?.dibayar === 3 * 70000 - 50000, JSON.stringify(bg.error ?? bg.data));
	const kh = await adm.rpc('atur_kehadiran', { p_karyawan: kid, p_tanggal: `${bulan}-04`, p_hadir: true });
	cek('kehadiran bulan yang sudah dibayar terkunci', /sudah dibayar/.test(kh.error?.message ?? ''), kh.error?.message);

	await adm.rpc('simpan_biaya_tetap', { p: { outlet_id: outletId, per_tahun: 36500000, mulai: `${bulan}-01` } });
	const lr = await adm.rpc('laporan_keuangan', { p_outlet: outletId, p_dari: `${bulan}-01`, p_sampai: akhirBulan });
	const hari = Number(akhirBulan.slice(-2));
	cek(
		'laba-rugi bulan lalu: gaji akrual & sewa per hari',
		Number(lr.data?.gaji) === 210000 && Number(lr.data?.sewa) === 100000 * hari && Number(lr.data?.laba) === -(210000 + 100000 * hari),
		JSON.stringify(lr.error ?? { gaji: lr.data?.gaji, sewa: lr.data?.sewa, laba: lr.data?.laba })
	);
	const bt = await adm.rpc('batal_gaji', { p_id: gid, p_alasan: 'uji batal' });
	const kh2 = await adm.rpc('atur_kehadiran', { p_karyawan: kid, p_tanggal: `${bulan}-04`, p_hadir: true });
	cek('batal gaji membuka kehadiran lagi', !bt.error && !kh2.error, bt.error?.message ?? kh2.error?.message);
	const lk = await k.rpc('laporan_keuangan', { p_outlet: outletId, p_dari: `${bulan}-01`, p_sampai: akhirBulan });
	cek('kasir tidak bisa membuka laporan keuangan', lk.error?.code === '42501', lk.error?.code);
} catch (e) {
	gagal++;
	console.error(`GAGAL langkah: ${(e as Error).message}`);
} finally {
	const hapus = async (nama: string, q: PromiseLike<{ error: { message: string } | null }>) => {
		const { error } = await q;
		if (error) {
			gagal++;
			console.error(`GAGAL membersihkan ${nama}: ${error.message}`);
		}
	};
	if (outletId) {
		const ks = ((await svc.from('karyawan').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (ks.length) {
			await hapus('gaji', svc.from('gaji').delete().in('karyawan_id', ks));
			await hapus('kehadiran', svc.from('kehadiran').delete().in('karyawan_id', ks));
		}
		await hapus('pengeluaran', svc.from('pengeluaran').delete().eq('outlet_id', outletId));
		await hapus('karyawan', svc.from('karyawan').delete().eq('outlet_id', outletId));
		await hapus('biaya_tetap', svc.from('biaya_tetap').delete().eq('outlet_id', outletId));
		const sh = ((await svc.from('shift').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (sh.length) await hapus('shift_perangkat', svc.from('shift_perangkat').delete().in('shift_id', sh));
		await hapus('shift', svc.from('shift').delete().eq('outlet_id', outletId));
		await hapus('laci_awal', svc.from('laci_awal').delete().eq('outlet_id', outletId));
	}
	for (const u of users) {
		const { error } = await svc.auth.admin.deleteUser(u);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji: ${error.message}`);
		}
	}
	if (outletId) await hapus('outlet', svc.from('outlets').delete().eq('id', outletId));
	console.log('\nData uji dibersihkan.');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
