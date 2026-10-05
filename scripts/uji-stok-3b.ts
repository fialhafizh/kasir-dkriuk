// E2E stok 3b terhadap Supabase sungguhan: dua outlet "UJA"/"UJB", admin & 2 kasir sementara; semua dihapus di akhir.
//   node --env-file=.env.local scripts/uji-stok-3b.ts
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
const outletIds: string[] = [];
const userIds: string[] = [];

async function akun(role: 'admin' | 'kasir', outletKode: string | null): Promise<SupabaseClient> {
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.${role}.${outletKode ?? 'x'}.${tag}`.toLowerCase();
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: `Uji ${role}`, role, outlet_kode: outletKode }
	});
	if (a.error) throw new Error(a.error.message);
	userIds.push(a.data.user.id);
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await c.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);
	return c;
}

try {
	for (const kode of ['UJA', 'UJB']) {
		const o = await svc.from('outlets').insert({ kode, nama: `Uji ${kode} ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
		if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
		outletIds.push(o.data.id);
	}
	const [a, b] = outletIds;
	const dada = (await svc.from('bahan').select('id').eq('kode', 'ori_dada').single()).data!.id;
	const admin = await akun('admin', null);
	const ka = await akun('kasir', 'UJA');
	const kb = await akun('kasir', 'UJB');
	const stok = async (c: SupabaseClient, outlet: string) =>
		Number((await c.from('stok_outlet').select('qty').eq('outlet_id', outlet).eq('bahan_id', dada).single()).data?.qty);

	for (const [k, o] of [[ka, a], [kb, b]] as const) {
		const aj = await k.rpc('ajukan_stok_awal', { p_outlet: o, p_item: [{ bahan_id: dada, qty: 10 }] });
		await admin.rpc('putuskan_stok_awal', { p_id: aj.data, p_setuju: true, p_item: null, p_catatan: null });
	}
	cek('stok awal kedua outlet 10', (await stok(ka, a)) === 10 && (await stok(kb, b)) === 10);

	const r = await ka.rpc('catat_rusak', { p: { id: randomUUID(), outlet_id: a, alasan: 'gosong', item: [{ bahan_id: dada, qty: 2 }] } });
	cek('rusak 2 → A 8', !r.error && (await stok(ka, a)) === 8, r.error?.message);

	const tid = randomUUID();
	const k = await ka.rpc('kirim_transfer', { p: { id: tid, dari_outlet_id: a, ke_outlet_id: b, item: [{ bahan_id: dada, qty: 3 }] } });
	cek('kirim 3 dari A ke B', !k.error, k.error?.message);
	const intip = await kb.from('transfer_item').select('qty').eq('transfer_id', tid);
	cek('B tidak bisa mengintip isi kiriman', (intip.data ?? []).length === 0, intip.error?.message);
	const salah = await kb.rpc('terima_transfer', { p_id: tid, p_item: [{ bahan_id: dada, qty: 2 }] });
	cek('B mengetik 2 → ditolak "Ada perbedaan jumlah"', /Ada perbedaan jumlah/.test(salah.error?.message ?? ''), salah.error?.message);
	cek('stok belum berpindah', (await stok(ka, a)) === 8 && (await stok(kb, b)) === 10);
	const benar = await kb.rpc('terima_transfer', { p_id: tid, p_item: [{ bahan_id: dada, qty: 3 }] });
	cek('B mengetik 3 → A 5, B 13', !benar.error && (await stok(ka, a)) === 5 && (await stok(kb, b)) === 13, benar.error?.message);

	const op = await ka.rpc('ajukan_opname', { p_outlet: a, p_item: [{ bahan_id: dada, qty: 4 }] });
	cek('kasir mengajukan opname', !op.error, op.error?.message);
	const lihat = await ka.from('opname_item').select('qty_sistem');
	cek('kasir tidak bisa membaca angka sistem opname', (lihat.data ?? []).length === 0);
	const pv = await admin.rpc('pratinjau_opname', { p_id: op.data });
	cek('admin melihat pratinjau sistem 5', Number(pv.data?.[0]?.qty_sistem) === 5, JSON.stringify(pv.data ?? pv.error));
	const sp = await admin.rpc('putuskan_opname', { p_id: op.data, p_setuju: true, p_item: null, p_catatan: null });
	cek('opname disetujui → A 4', !sp.error && (await stok(ka, a)) === 4, sp.error?.message);
} catch (e) {
	gagal++;
	console.error(`GAGAL langkah: ${(e as Error).message}`);
} finally {
	for (const o of outletIds) await svc.from('gerakan_stok').delete().eq('outlet_id', o);
	const tr = ((await svc.from('transfer').select('id').in('dari_outlet_id', outletIds)).data ?? []).map((x) => x.id);
	if (tr.length) await svc.from('transfer_item').delete().in('transfer_id', tr);
	if (outletIds.length) await svc.from('transfer').delete().in('dari_outlet_id', outletIds);
	for (const o of outletIds) {
		const rs = ((await svc.from('rusak').select('id').eq('outlet_id', o)).data ?? []).map((x) => x.id);
		if (rs.length) await svc.from('rusak_item').delete().in('rusak_id', rs);
		await svc.from('rusak').delete().eq('outlet_id', o);
		const op = ((await svc.from('opname').select('id').eq('outlet_id', o)).data ?? []).map((x) => x.id);
		if (op.length) await svc.from('opname_item').delete().in('opname_id', op);
		await svc.from('opname').delete().eq('outlet_id', o);
		const sa = ((await svc.from('stok_awal').select('id').eq('outlet_id', o)).data ?? []).map((x) => x.id);
		if (sa.length) await svc.from('stok_awal_item').delete().in('stok_awal_id', sa);
		await svc.from('stok_awal').delete().eq('outlet_id', o);
	}
	for (const id of userIds) {
		const { error } = await svc.auth.admin.deleteUser(id);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji ${id}: ${error.message}`);
		}
	}
	for (const o of outletIds) {
		const { error } = await svc.from('outlets').delete().eq('id', o);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus outlet uji ${o}: ${error.message}`);
		}
	}
	console.log('\nData uji dibersihkan.');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
