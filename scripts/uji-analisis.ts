// E2E analisis (Tahap 7b) terhadap Supabase sungguhan: outlet "UJA", kasir & admin sementara; semua dihapus.
// Notifikasi Telegram dimatikan sementara selama uji lalu dikembalikan.
//   node --env-file=.env.local scripts/uji-analisis.ts
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
const batasAwal = Number((await svc.from('analisis_pengaturan').select('batas_untung').eq('id', true).single()).data?.batas_untung ?? 30);
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
		app_metadata: { username: u, nama_tampilan: 'Uji', role, ...(role === 'kasir' ? { outlet_kode: 'UJA' } : {}) }
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
	const o = await svc.from('outlets').insert({ kode: 'UJA', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const k = await akun('kasira', 'kasir');
	const adm = await akun('adina', 'admin');
	const { data: menu } = await svc.from('menu').select('id').eq('kode', 'nasi').single();
	const sat = async (kode: string) => (await svc.from('satuan_beli').select('id').eq('kode', kode).single()).data!.id as string;
	await svc.from('harga_jual').upsert({ outlet_id: outletId, menu_id: menu!.id, harga: 4321 });
	await svc.from('harga_beli').insert([
		{ outlet_id: outletId, satuan_beli_id: await sat('beras_kg'), harga: 12345 },
		{ outlet_id: outletId, satuan_beli_id: await sat('pack_kertas_nasi'), harga: 4321 }
	]);
	const shift = randomUUID();
	await k.rpc('buka_shift_offline', { p: { id: shift, outlet_id: outletId, modal: 0, laci_awal: 0, waktu: new Date(Date.now() - 60_000).toISOString() } });
	const j = await k.rpc('catat_penjualan_offline', {
		p: { id: randomUUID(), outlet_id: outletId, shift_id: shift, metode: 'qris', waktu: new Date().toISOString(), kode_struk: 'UJA001', item: [{ menu_id: menu!.id, qty: 3 }] }
	});
	if (j.error) throw new Error(j.error.message);
	const r = { p_dari: new Date(Date.now() - 3_600_000).toISOString(), p_sampai: new Date(Date.now() + 3_600_000).toISOString() };
	const u = await adm.rpc('untung_menu', { p_outlet: outletId, ...r });
	const nasi = (u.data?.menu ?? []).find((m: { nama: string }) => m.nama === 'Nasi');
	const modal = Math.round(0.1 * 12345 + 43.21);
	cek('untung per menu: modal resep & untung periode', !!nasi && Number(nasi.modal) === modal && Number(nasi.untung_periode) === Math.round(3 * 4321 - 3 * (0.1 * 12345 + 43.21)), JSON.stringify(u.error ?? nasi));
	const st = await adm.rpc('susut_terbuang', { p_outlet: outletId, ...r });
	cek('susut & terbuang terbaca', !st.error && Array.isArray(st.data?.susut), st.error?.message);
	const mt = await adm.rpc('minyak_tepung', { p_outlet: outletId, ...r });
	cek('minyak & tepung terbaca', !mt.error && mt.data?.length === 1, mt.error?.message);
	const pr = await adm.rpc('proyeksi_bulan', { p_outlet: outletId });
	cek('proyeksi bulan berjalan', !pr.error && Number(pr.data?.omzet) === 3 * 4321, JSON.stringify(pr.error ?? pr.data));
	const d = await adm.rpc('agregasi_dasbor', { p_spek: { jenis: 'angka', sumber: 'untung_menu', ukuran: ['untung'] }, p_outlet: outletId, ...r });
	cek('sumber dasbor untung per menu', !d.error && Number(d.data?.baris?.[0]?.n?.[0]) === Number(nasi?.untung_periode), JSON.stringify(d.error ?? d.data));
	const kk = await k.rpc('untung_menu', { p_outlet: outletId, ...r });
	cek('kasir tidak bisa membuka analisis', kk.error?.code === '42501', kk.error?.code);
	const sb = await adm.rpc('simpan_batas_untung', { p_batas: 25 });
	cek('batas untung bisa diubah admin', !sb.error, sb.error?.message);
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
	await hapus('batas untung', svc.from('analisis_pengaturan').update({ batas_untung: batasAwal }).eq('id', true));
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
