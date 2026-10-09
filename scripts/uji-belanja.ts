// E2E rencana belanja & ringkasan (Tahap 7c) terhadap Supabase sungguhan: outlet "UJB", kasir & admin sementara; semua dihapus.
// Notifikasi Telegram dimatikan sementara selama uji lalu dikembalikan.
//   node --env-file=.env.local scripts/uji-belanja.ts
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
const SEMUA_JENIS = ['struk', 'tutup', 'harian', 'batal', 'selisih_kas', 'selisih_setoran', 'stok', 'opname', 'diabaikan', 'ditolak', 'setoran', 'kasbon', 'pengeluaran'];
const matiAwal = ((await svc.from('telegram_pengaturan').select('jenis_mati').eq('id', true).single()).data?.jenis_mati ?? []) as string[];

async function akun(nama: string, role: 'kasir' | 'admin'): Promise<SupabaseClient> {
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.${nama}.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: 'Uji', role, ...(role === 'kasir' ? { outlet_kode: 'UJB' } : {}) }
	});
	if (a.error) throw new Error(a.error.message);
	users.push(a.data.user.id);
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await c.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);
	return c;
}

try {
	await svc.from('telegram_pengaturan').update({ jenis_mati: SEMUA_JENIS }).eq('id', true);
	const o = await svc.from('outlets').insert({ kode: 'UJB', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const k = await akun('kasirb', 'kasir');
	const adm = await akun('adinb', 'admin');
	const { data: menu } = await svc.from('menu').select('id').eq('kode', 'nasi').single();
	await svc.from('harga_jual').upsert({ outlet_id: outletId, menu_id: menu!.id, harga: 4321 });
	const shift = randomUUID();
	await k.rpc('buka_shift_offline', { p: { id: shift, outlet_id: outletId, modal: 0, laci_awal: 0, waktu: new Date(Date.now() - 60_000).toISOString() } });
	// 10 porsi nasi = 1 kg beras terpakai minggu ini; stok beras tidak pernah diisi → saran 7 hari = 1 kg
	const j = await k.rpc('catat_penjualan_offline', {
		p: { id: randomUUID(), outlet_id: outletId, shift_id: shift, metode: 'qris', waktu: new Date().toISOString(), kode_struk: 'UJB001', item: [{ menu_id: menu!.id, qty: 10 }] }
	});
	if (j.error) throw new Error(j.error.message);
	const r = await adm.rpc('rencana_belanja', { p_hari: 7 });
	const beras = (r.data?.barang ?? []).find((b: { nama: string }) => b.nama.startsWith('Beras'));
	cek('rencana belanja: beras terpakai minggu ini → saran 1 kg', beras?.per_outlet?.[outletId]?.saran === 1, JSON.stringify(r.error ?? beras?.per_outlet?.[outletId]));
	cek('rencana belanja memuat semua outlet aktif', (r.data?.outlet ?? []).some((x: { id: string }) => x.id === outletId));
	const kk = await k.rpc('rencana_belanja', { p_hari: 7 });
	cek('kasir tidak bisa membuka rencana belanja', kk.error?.code === '42501', kk.error?.code);
	const kt = await k.rpc('kirim_teks_telegram', { p_jenis: 'belanja', p_teks: 'uji' });
	cek('kasir tidak bisa mengirim teks ke Telegram', kt.error?.code === '42501', kt.error?.code);
	const g = await adm.rpc('hitung_gaji', { p_outlet: outletId, p_bulan: new Date().toISOString().slice(0, 7) + '-01' });
	cek('data ringkasan gaji terbaca', !g.error && Array.isArray(g.data), g.error?.message);
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
		const pj = ((await svc.from('penjualan').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (pj.length) {
			await hapus('gerakan_stok', svc.from('gerakan_stok').delete().in('penjualan_id', pj));
			await hapus('penjualan_item', svc.from('penjualan_item').delete().in('penjualan_id', pj));
			await hapus('penjualan', svc.from('penjualan').delete().in('id', pj));
		}
		await hapus('gerakan_stok outlet', svc.from('gerakan_stok').delete().eq('outlet_id', outletId));
		const sh = ((await svc.from('shift').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (sh.length) await hapus('shift_perangkat', svc.from('shift_perangkat').delete().in('shift_id', sh));
		await hapus('shift', svc.from('shift').delete().eq('outlet_id', outletId));
		await hapus('laci_awal', svc.from('laci_awal').delete().eq('outlet_id', outletId));
		await hapus('nomor_harian', svc.from('nomor_harian').delete().eq('outlet_id', outletId));
		await hapus('harga_jual', svc.from('harga_jual').delete().eq('outlet_id', outletId));
		await hapus('harga_beli', svc.from('harga_beli').delete().eq('outlet_id', outletId));
	}
	for (const u of users) {
		const { error } = await svc.auth.admin.deleteUser(u);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji: ${error.message}`);
		}
	}
	if (outletId) await hapus('outlet', svc.from('outlets').delete().eq('id', outletId));
	await hapus('pengaturan telegram', svc.from('telegram_pengaturan').update({ jenis_mati: matiAwal }).eq('id', true));
	console.log('\nData uji dibersihkan; notifikasi Telegram dikembalikan.');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
