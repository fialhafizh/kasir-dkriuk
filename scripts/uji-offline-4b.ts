// E2E fungsi offline Tahap 4b terhadap Supabase sungguhan: outlet "UJA" & "UJB", dua kasir & satu admin
// sementara; semua dihapus di akhir.
//   node --env-file=.env.local scripts/uji-offline-4b.ts
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
const outlets: string[] = [];
const users: string[] = [];
const jam = (mundurMenit: number) => new Date(Date.now() - mundurMenit * 60_000).toISOString();

async function outlet(kode: string): Promise<string> {
	const o = await svc.from('outlets').insert({ kode, nama: `Uji ${kode} ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outlets.push(o.data.id);
	return o.data.id;
}
async function akun(nama: string, role: 'kasir' | 'admin', outletKode?: string): Promise<SupabaseClient> {
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.${nama}.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: 'Uji', role, ...(outletKode ? { outlet_kode: outletKode } : {}) }
	});
	if (a.error) throw new Error(a.error.message);
	users.push(a.data.user.id);
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await c.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);
	return c;
}
// stok_outlet adalah view security_invoker: dibaca lewat akun admin uji (bukan service role).
let pembaca: SupabaseClient;
const stok = async (outletId: string, bahanId: string) =>
	Number((await pembaca.from('stok_outlet').select('qty').eq('outlet_id', outletId).eq('bahan_id', bahanId).maybeSingle()).data?.qty ?? 0);

try {
	const A = await outlet('UJA');
	const B = await outlet('UJB');
	const menu = (await svc.from('menu').select('id, kode')).data ?? [];
	await svc.from('harga_jual').insert([A, B].flatMap((o) => menu.map((m) => ({ outlet_id: o, menu_id: m.id, harga: 5000 }))));
	const dada = menu.find((m) => m.kode === 'ori_dada')!.id;
	const ayam = (await svc.from('bahan').select('id').eq('kode', 'ori_dada').single()).data!.id;
	const ka = await akun('kasira', 'kasir', 'UJA');
	const kb = await akun('kasirb', 'kasir', 'UJB');
	const adm = await akun('admin', 'admin');
	pembaca = adm;

	// Stok awal offline (dua kali → satu), disetujui admin.
	const sa = randomUUID();
	const p1 = await ka.rpc('ajukan_stok_awal_offline', { p: { id: sa, outlet_id: A, waktu: jam(240), item: [{ bahan_id: ayam, qty: 20 }] } });
	const p2 = await ka.rpc('ajukan_stok_awal_offline', { p: { id: sa, outlet_id: A, waktu: jam(240), item: [{ bahan_id: ayam, qty: 20 }] } });
	cek('stok awal offline idempoten', p1.data === sa && p2.data === sa, p1.error?.message ?? p2.error?.message);
	const ok = await adm.rpc('putuskan_stok_awal', { p_id: sa, p_setuju: true, p_item: null, p_catatan: null });
	cek('stok awal disetujui', !ok.error && (await stok(A, ayam)) === 20, ok.error?.message);

	// Jual lalu batal offline (dua kali → sekali).
	const s = randomUUID();
	await ka.rpc('buka_shift_offline', { p: { id: s, outlet_id: A, modal: 0, waktu: jam(200) } });
	const jid = randomUUID();
	const j = await ka.rpc('catat_penjualan_offline', { p: { id: jid, outlet_id: A, shift_id: s, metode: 'qris', waktu: jam(190), kode_struk: 'UJ4B01', item: [{ menu_id: dada, qty: 2 }] } });
	cek('jual offline', !j.error && (await stok(A, ayam)) === 18, j.error?.message);
	const v1 = await ka.rpc('void_penjualan_offline', { p: { penjualan_id: jid, alasan: 'uji batal', waktu: jam(185) } });
	const v2 = await ka.rpc('void_penjualan_offline', { p: { penjualan_id: jid, alasan: 'uji batal', waktu: jam(185) } });
	cek('batal offline idempoten & stok kembali', v1.data?.sudah_dibatalkan === false && v2.data?.sudah_dibatalkan === true && (await stok(A, ayam)) === 20, JSON.stringify(v1.error ?? v2.error));

	// Kirim A→B offline; terima beda ditolak, sama diterima (dua kali aman).
	const t = randomUUID();
	const kr = { id: t, outlet_id: A, dari_outlet_id: A, ke_outlet_id: B, waktu: jam(170), item: [{ bahan_id: ayam, qty: 5 }] };
	await ka.rpc('kirim_transfer_offline', { p: kr });
	const kr2 = await ka.rpc('kirim_transfer_offline', { p: kr });
	cek('kirim offline idempoten', kr2.data === t, kr2.error?.message);
	const ub = await ka.rpc('ubah_transfer_offline', { p: { transfer_id: t, item: [{ bahan_id: ayam, qty: 4 }], catatan: null, waktu: jam(165) } });
	cek('ubah kiriman offline', !ub.error, ub.error?.message);
	const beda = await kb.rpc('terima_transfer_offline', { p: { transfer_id: t, outlet_id: B, waktu: jam(160), item: [{ bahan_id: ayam, qty: 5 }] } });
	cek('terima jumlah beda ditolak', /Ada perbedaan jumlah/.test(beda.error?.message ?? ''), beda.error?.message);
	const tr1 = await kb.rpc('terima_transfer_offline', { p: { transfer_id: t, outlet_id: B, waktu: jam(160), item: [{ bahan_id: ayam, qty: 4 }] } });
	const tr2 = await kb.rpc('terima_transfer_offline', { p: { transfer_id: t, outlet_id: B, waktu: jam(160), item: [{ bahan_id: ayam, qty: 4 }] } });
	cek('terima offline idempoten, stok pindah sekali', !tr1.error && !tr2.error && (await stok(A, ayam)) === 16 && (await stok(B, ayam)) === 4, tr1.error?.message ?? tr2.error?.message);

	// Kiriman yang dibatalkan dua kali → stok pengirim tetap.
	const t2 = randomUUID();
	await ka.rpc('kirim_transfer_offline', { p: { ...kr, id: t2, waktu: jam(150) } });
	const bt1 = await ka.rpc('batal_transfer_offline', { p: { transfer_id: t2, alasan: 'uji batal', waktu: jam(145) } });
	const bt2 = await ka.rpc('batal_transfer_offline', { p: { transfer_id: t2, alasan: 'uji batal', waktu: jam(145) } });
	cek('batal kiriman offline idempoten', !bt1.error && !bt2.error && (await stok(A, ayam)) === 16, bt1.error?.message ?? bt2.error?.message);

	// Opname offline (dua kali → satu), disetujui: stok = hitungan.
	const op = randomUUID();
	const o1 = await ka.rpc('ajukan_opname_offline', { p: { id: op, outlet_id: A, waktu: jam(100), item: [{ bahan_id: ayam, qty: 15 }] } });
	const o2 = await ka.rpc('ajukan_opname_offline', { p: { id: op, outlet_id: A, waktu: jam(100), item: [{ bahan_id: ayam, qty: 15 }] } });
	cek('opname offline idempoten', o1.data === op && o2.data === op, o1.error?.message ?? o2.error?.message);
	const po = await adm.rpc('putuskan_opname', { p_id: op, p_setuju: true, p_item: null, p_catatan: null });
	cek('opname disetujui → stok = hitungan', !po.error && (await stok(A, ayam)) === 15, po.error?.message);
} catch (e) {
	gagal++;
	console.error(`GAGAL langkah: ${(e as Error).message}`);
} finally {
	// Gerakan & transfer kedua outlet dihapus dulu (transfer mengacu ke dua outlet; FK restrict).
	const hapus = async (nama: string, q: PromiseLike<{ error: { message: string } | null }>) => {
		const { error } = await q;
		if (error) {
			gagal++;
			console.error(`GAGAL membersihkan ${nama}: ${error.message}`);
		}
	};
	if (outlets.length) {
		const daftar = `(${outlets.join(',')})`;
		await hapus('gerakan_stok', svc.from('gerakan_stok').delete().in('outlet_id', outlets));
		const tr = ((await svc.from('transfer').select('id').or(`dari_outlet_id.in.${daftar},ke_outlet_id.in.${daftar}`)).data ?? []).map((x) => x.id);
		if (tr.length) {
			await hapus('transfer_item', svc.from('transfer_item').delete().in('transfer_id', tr));
			await hapus('transfer', svc.from('transfer').delete().in('id', tr));
		}
	}
	for (const o of outlets) {
		const op = ((await svc.from('opname').select('id').eq('outlet_id', o)).data ?? []).map((x) => x.id);
		if (op.length) await hapus('opname_item', svc.from('opname_item').delete().in('opname_id', op));
		await hapus('opname', svc.from('opname').delete().eq('outlet_id', o));
		const sa = ((await svc.from('stok_awal').select('id').eq('outlet_id', o)).data ?? []).map((x) => x.id);
		if (sa.length) await hapus('stok_awal_item', svc.from('stok_awal_item').delete().in('stok_awal_id', sa));
		await hapus('stok_awal', svc.from('stok_awal').delete().eq('outlet_id', o));
		const ids = ((await svc.from('penjualan').select('id').eq('outlet_id', o)).data ?? []).map((x) => x.id);
		if (ids.length) await hapus('penjualan_item', svc.from('penjualan_item').delete().in('penjualan_id', ids));
		await hapus('penjualan', svc.from('penjualan').delete().eq('outlet_id', o));
		const sh = ((await svc.from('shift').select('id').eq('outlet_id', o)).data ?? []).map((x) => x.id);
		if (sh.length) await hapus('shift_perangkat', svc.from('shift_perangkat').delete().in('shift_id', sh));
		await hapus('shift', svc.from('shift').delete().eq('outlet_id', o));
		await hapus('nomor_harian', svc.from('nomor_harian').delete().eq('outlet_id', o));
		await hapus('perangkat', svc.from('perangkat').delete().eq('outlet_id', o));
		await hapus('harga_jual', svc.from('harga_jual').delete().eq('outlet_id', o));
	}
	for (const u of users) {
		const { error } = await svc.auth.admin.deleteUser(u);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji: ${error.message}`);
		}
	}
	for (const o of outlets) {
		const { error } = await svc.from('outlets').delete().eq('id', o);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus outlet uji: ${error.message}`);
		}
	}
	console.log('\nData uji dibersihkan.');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
