// E2E stok terhadap Supabase sungguhan: outlet "UJI", admin & kasir sementara; semua dihapus di akhir.
//   node --env-file=.env.local scripts/uji-stok.ts
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
const userIds: string[] = [];

async function akun(role: 'admin' | 'kasir'): Promise<SupabaseClient> {
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.${role}.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: `Uji ${role}`, role, outlet_kode: role === 'kasir' ? 'UJI' : null }
	});
	if (a.error) throw new Error(a.error.message);
	userIds.push(a.data.user.id);
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await c.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);
	return c;
}

try {
	const o = await svc.from('outlets').insert({ kode: 'UJI', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const menu = (await svc.from('menu').select('id, kode')).data ?? [];
	await svc.from('harga_jual').insert(menu.map((m) => ({ outlet_id: outletId, menu_id: m.id, harga: 5000 })));
	const menuDada = menu.find((m) => m.kode === 'ori_dada')!.id;
	const dada = (await svc.from('bahan').select('id').eq('kode', 'ori_dada').single()).data!.id;
	const packOri = (await svc.from('satuan_beli').select('id').eq('kode', 'pack_ayam_ori').single()).data!.id;
	const admin = await akun('admin');
	const kasir = await akun('kasir');
	const stokDada = async (c: SupabaseClient) =>
		Number((await c.from('stok_outlet').select('qty').eq('outlet_id', outletId).eq('bahan_id', dada).single()).data?.qty);

	const aj = await kasir.rpc('ajukan_stok_awal', { p_outlet: outletId, p_item: [{ bahan_id: dada, qty: 10 }] });
	cek('kasir mengajukan stok awal', !aj.error, aj.error?.message);
	const kasirPutus = await kasir.rpc('putuskan_stok_awal', { p_id: aj.data, p_setuju: true, p_item: null, p_catatan: null });
	cek('kasir tidak bisa menyetujui', kasirPutus.error?.code === '42501', kasirPutus.error?.code);
	const st = await admin.rpc('putuskan_stok_awal', { p_id: aj.data, p_setuju: true, p_item: null, p_catatan: null });
	cek('admin menyetujui → stok dada 10', !st.error && (await stokDada(kasir)) === 10, st.error?.message);

	const s = await kasir.rpc('buka_shift', { p_outlet: outletId, p_modal: 0 });
	const pid = randomUUID();
	const p = { id: pid, outlet_id: outletId, metode: 'qris', item: [{ menu_id: menuDada, qty: 2 }] };
	await kasir.rpc('catat_penjualan', { p });
	await kasir.rpc('catat_penjualan', { p });
	cek('jual 2 dada (dikirim ulang) → 8', (await stokDada(kasir)) === 8);
	const v = await kasir.rpc('void_penjualan', { p_id: pid, p_alasan: 'Uji batal' });
	cek('void → kembali 10', !v.error && (await stokDada(kasir)) === 10, v.error?.message);

	const tanggal = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
	const bmId = randomUUID();
	const bm = await admin.rpc('catat_barang_masuk', { p: { id: bmId, outlet_id: outletId, tanggal, item: [{ satuan_beli_id: packOri, qty: 1, harga: 1 }] } });
	cek('barang masuk 1 pack ayam → dada 13', !bm.error && (await stokDada(admin)) === 13, bm.error?.message);
	const bmKasir = await kasir.rpc('catat_barang_masuk', {
		p: { id: randomUUID(), outlet_id: outletId, tanggal, item: [{ satuan_beli_id: packOri, qty: 1, harga: 1 }] }
	});
	cek('kasir tidak bisa mencatat barang masuk', bmKasir.error?.code === '42501', bmKasir.error?.code);
	const lihat = await kasir.from('barang_masuk').select('id');
	cek('kasir tidak bisa membaca barang masuk (harga beli)', (lihat.data ?? []).length === 0, lihat.error?.message);
	const bb = await admin.rpc('batal_barang_masuk', { p_id: bmId, p_alasan: 'Uji batal' });
	cek('batal barang masuk → dada 10', !bb.error && (await stokDada(admin)) === 10, bb.error?.message);

	const milik = await kasir.from('stok_outlet').select('outlet_id');
	cek('kasir hanya melihat stok outletnya', (milik.data ?? []).length > 0 && (milik.data ?? []).every((r) => r.outlet_id === outletId));
	const anon = createClient(url, anonKey, { auth: { persistSession: false } });
	const an = await anon.from('stok_outlet').select('qty');
	cek('anon tidak bisa membaca stok', !!an.error || (an.data ?? []).length === 0);

	await kasir.rpc('tutup_shift', { p_shift: s.data, p_uang_fisik: 0, p_catatan: 'uji' });
} catch (e) {
	gagal++;
	console.error(`GAGAL langkah: ${(e as Error).message}`);
} finally {
	if (outletId) {
		await svc.from('gerakan_stok').delete().eq('outlet_id', outletId);
		const rs = ((await svc.from('rusak').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (rs.length) await svc.from('rusak_item').delete().in('rusak_id', rs);
		await svc.from('rusak').delete().eq('outlet_id', outletId);
		const op = ((await svc.from('opname').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (op.length) await svc.from('opname_item').delete().in('opname_id', op);
		await svc.from('opname').delete().eq('outlet_id', outletId);
		const sa = ((await svc.from('stok_awal').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (sa.length) await svc.from('stok_awal_item').delete().in('stok_awal_id', sa);
		await svc.from('stok_awal').delete().eq('outlet_id', outletId);
		const bm = ((await svc.from('barang_masuk').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (bm.length) await svc.from('barang_masuk_item').delete().in('barang_masuk_id', bm);
		await svc.from('barang_masuk').delete().eq('outlet_id', outletId);
		const pj = ((await svc.from('penjualan').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (pj.length) await svc.from('penjualan_item').delete().in('penjualan_id', pj);
		await svc.from('penjualan').delete().eq('outlet_id', outletId);
		await svc.from('shift').delete().eq('outlet_id', outletId);
		await svc.from('nomor_harian').delete().eq('outlet_id', outletId);
	}
	for (const id of userIds) {
		const { error } = await svc.auth.admin.deleteUser(id);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji ${id}: ${error.message}`);
		}
	}
	if (outletId) {
		const { error } = await svc.from('outlets').delete().eq('id', outletId);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus outlet uji ${outletId}: ${error.message}`);
		}
	}
	console.log('\nData uji dibersihkan.');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
