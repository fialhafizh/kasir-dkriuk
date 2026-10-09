// E2E fungsi offline terhadap Supabase sungguhan: outlet "UJO", kasir sementara, dua perangkat; semua dihapus di akhir.
//   node --env-file=.env.local scripts/uji-offline.ts
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
let userId = '';
const P1 = randomUUID();
const P2 = randomUUID();
const jam = (mundurMenit: number) => new Date(Date.now() - mundurMenit * 60_000).toISOString();

try {
	const o = await svc.from('outlets').insert({ kode: 'UJO', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const menu = (await svc.from('menu').select('id, kode')).data ?? [];
	await svc.from('harga_jual').insert(menu.map((m) => ({ outlet_id: outletId, menu_id: m.id, harga: 5000 })));
	const dada = menu.find((m) => m.kode === 'ori_dada')!.id;
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.offline.${tag}`;
	const a = await svc.auth.admin.createUser({ email: usernameToEmail(u), password: pw, email_confirm: true, app_metadata: { username: u, nama_tampilan: 'Uji', role: 'kasir', outlet_kode: 'UJO' } });
	if (a.error) throw new Error(a.error.message);
	userId = a.data.user.id;
	const k: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await k.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);

	const k1 = await k.rpc('daftar_perangkat', { p_id: P1, p_outlet: outletId });
	const k2 = await k.rpc('daftar_perangkat', { p_id: P2, p_outlet: outletId });
	cek('dua perangkat terdaftar dengan kode', typeof k1.data === 'number' && k2.data === k1.data + 1, JSON.stringify([k1.data, k2.data]));

	const s1 = randomUUID();
	const b1 = await k.rpc('buka_shift_offline', { p: { id: s1, outlet_id: outletId, modal: 100000, waktu: jam(180), perangkat_id: P1 } });
	const b2 = await k.rpc('buka_shift_offline', { p: { id: randomUUID(), outlet_id: outletId, modal: 50000, waktu: jam(150), perangkat_id: P2 } });
	cek('dua perangkat membuka → satu shift', !b1.error && b2.data === b1.data, b2.error?.message);

	const jid = randomUUID();
	const j = { id: jid, outlet_id: outletId, shift_id: s1, metode: 'cash', diterima: 20000, waktu: jam(120), perangkat_id: P1, kode_struk: 'UJ2KQ7', nomor_sementara: 'S1-001', item: [{ menu_id: dada, qty: 2 }] };
	const j1 = await k.rpc('catat_penjualan_offline', { p: j });
	const j2 = await k.rpc('catat_penjualan_offline', { p: j });
	cek('jual offline: nomor resmi & kirim ulang sama', /^UJO-\d{6}-001$/.test(j1.data?.nomor ?? '') && j2.data?.nomor === j1.data?.nomor, JSON.stringify(j1.data ?? j1.error));

	const t = await k.rpc('tutup_shift_offline', { p: { id: randomUUID(), shift_id: s1, uang_fisik: 110000, catatan: 'uji', waktu: jam(60) } });
	cek('tutup offline', !t.error, t.error?.message);
	const telat = await k.rpc('catat_penjualan_offline', { p: { ...j, id: randomUUID(), kode_struk: 'UJ3KQ8', nomor_sementara: 'S2-001', perangkat_id: P2, waktu: jam(90) } });
	const r = await k.rpc('ringkasan_shift', { p_shift: b1.data });
	cek('penjualan telat masuk shift-nya & ditandai', !telat.error && r.data?.jual_setelah_tutup === 1 && r.data?.jumlah_transaksi === 2, JSON.stringify(r.data ?? r.error));

	const cari = await k.from('penjualan').select('nomor').eq('kode_struk', 'UJ2KQ7').single();
	cek('kode struk bisa ditelusuri ke nomor resmi', cari.data?.nomor === j1.data?.nomor);
} catch (e) {
	gagal++;
	console.error(`GAGAL langkah: ${(e as Error).message}`);
} finally {
	if (outletId) {
		await svc.from('gerakan_stok').delete().eq('outlet_id', outletId);
		const ids = ((await svc.from('penjualan').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (ids.length) await svc.from('penjualan_item').delete().in('penjualan_id', ids);
		await svc.from('penjualan').delete().eq('outlet_id', outletId);
		const sh = ((await svc.from('shift').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (sh.length) await svc.from('shift_perangkat').delete().in('shift_id', sh);
		await svc.from('shift').delete().eq('outlet_id', outletId);
		await svc.from('laci_awal').delete().eq('outlet_id', outletId);
		await svc.from('nomor_harian').delete().eq('outlet_id', outletId);
		await svc.from('perangkat').delete().eq('outlet_id', outletId);
	}
	if (userId) {
		const { error } = await svc.auth.admin.deleteUser(userId);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji: ${error.message}`);
		}
	}
	if (outletId) {
		const { error } = await svc.from('outlets').delete().eq('id', outletId);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus outlet uji: ${error.message}`);
		}
	}
	console.log('\nData uji dibersihkan.');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
