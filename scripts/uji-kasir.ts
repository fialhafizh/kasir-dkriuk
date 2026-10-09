// E2E kasir terhadap Supabase sungguhan dengan outlet "UJI" & kasir sementara; semua dihapus di akhir.
//   node --env-file=.env.local scripts/uji-kasir.ts
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

try {
	const o = await svc
		.from('outlets')
		.insert({ kode: 'UJI', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' })
		.select('id')
		.single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const menu = (await svc.from('menu').select('id, kode')).data ?? [];
	await svc.from('harga_jual').insert(menu.map((m) => ({ outlet_id: outletId, menu_id: m.id, harga: m.kode === 'ori_dada' ? 11000 : 5000 })));
	const dada = menu.find((m) => m.kode === 'ori_dada')!.id;
	const nasi = menu.find((m) => m.kode === 'nasi')!.id;

	const pw = randomBytes(12).toString('base64url');
	const u = `uji.kasir.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: 'Uji', role: 'kasir', outlet_kode: 'UJI' }
	});
	if (a.error) throw new Error(a.error.message);
	userId = a.data.user.id;
	const k: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: false } });
	const masuk = await k.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (masuk.error) throw new Error(masuk.error.message);

	const tanpaShift = await k.rpc('catat_penjualan', { p: { id: randomUUID(), outlet_id: outletId, metode: 'qris', item: [{ menu_id: nasi, qty: 1 }] } });
	cek('tanpa shift ditolak', /Shift belum dibuka/.test(tanpaShift.error?.message ?? ''), tanpaShift.error?.message);

	const s = await k.rpc('buka_shift', { p_outlet: outletId, p_modal: 100000 });
	cek('buka shift', !s.error && typeof s.data === 'string', s.error?.message);

	const id = randomUUID();
	const p = { id, outlet_id: outletId, metode: 'cash', diterima: 20000, item: [{ menu_id: dada, qty: 1, harga: 1 }] };
	const j1 = await k.rpc('catat_penjualan', { p });
	const j2 = await k.rpc('catat_penjualan', { p });
	cek('harga dari server & kembalian', j1.data?.total === 11000 && j1.data?.kembalian === 9000, JSON.stringify(j1.data ?? j1.error));
	cek('kirim ulang tidak menggandakan', j2.data?.nomor === j1.data?.nomor && j2.data?.ulang === true);
	cek('nomor format UJI-YYMMDD-001', /^UJI-\d{6}-001$/.test(j1.data?.nomor ?? ''), j1.data?.nomor);

	const q = await k.rpc('catat_penjualan', {
		p: { id: randomUUID(), outlet_id: outletId, metode: 'qris', item: [{ menu_id: nasi, qty: 2 }] }
	});
	cek('QRIS tercatat', q.data?.total === 10000, JSON.stringify(q.data ?? q.error));

	const lainOutlet = (await svc.from('outlets').select('id').eq('kode', 'BL').single()).data!.id;
	const nyasar = await k.rpc('catat_penjualan', { p: { id: randomUUID(), outlet_id: lainOutlet, metode: 'qris', item: [{ menu_id: nasi, qty: 1 }] } });
	cek('kasir tidak bisa jual untuk outlet lain', nyasar.error?.code === '42501', nyasar.error?.code);

	const v = await k.rpc('void_penjualan', { p_id: q.data.id, p_alasan: 'Uji batal' });
	cek('void dengan alasan', !v.error, v.error?.message);

	const lihat = await k.from('penjualan').select('nomor, item:penjualan_item(nama, qty)').order('nomor');
	cek('kasir membaca penjualan outletnya beserta item', (lihat.data ?? []).length === 2 && (lihat.data?.[0]?.item?.length ?? 0) === 1);

	const t = await k.rpc('tutup_shift', { p_shift: s.data, p_uang_fisik: 111000, p_catatan: 'uji' });
	cek(
		'tutup shift: cash seharusnya 111.000, selisih 0, void tidak dihitung',
		t.data?.cash_seharusnya === 111000 && t.data?.selisih === 0 && t.data?.jumlah_void === 1 && t.data?.total === 11000,
		JSON.stringify(t.data ?? t.error)
	);

	// Kasir nonaktif (sesi masih hidup) harus ditolak di server sungguhan (bug NULL yang diperbaiki).
	await svc.from('profiles').update({ aktif: false }).eq('id', userId);
	const nonaktif = await k.rpc('buka_shift', { p_outlet: outletId, p_modal: 0 });
	cek('kasir nonaktif ditolak membuka shift', nonaktif.error?.code === '42501', nonaktif.error?.code ?? 'tidak ditolak!');
} catch (e) {
	gagal++;
	console.error(`GAGAL langkah: ${(e as Error).message}`);
} finally {
	// Bersihkan semua data uji (service role).
	if (outletId) {
		await svc.from('gerakan_stok').delete().eq('outlet_id', outletId);
		const rs = ((await svc.from('rusak').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (rs.length) await svc.from('rusak_item').delete().in('rusak_id', rs);
		await svc.from('rusak').delete().eq('outlet_id', outletId);
		const op = ((await svc.from('opname').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (op.length) await svc.from('opname_item').delete().in('opname_id', op);
		await svc.from('opname').delete().eq('outlet_id', outletId);
		const ids = ((await svc.from('penjualan').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (ids.length) await svc.from('penjualan_item').delete().in('penjualan_id', ids);
		await svc.from('penjualan').delete().eq('outlet_id', outletId);
		const shs = ((await svc.from('shift').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (shs.length) await svc.from('shift_perangkat').delete().in('shift_id', shs);
		await svc.from('shift').delete().eq('outlet_id', outletId);
		await svc.from('laci_awal').delete().eq('outlet_id', outletId);
		await svc.from('perangkat').delete().eq('outlet_id', outletId);
		await svc.from('nomor_harian').delete().eq('outlet_id', outletId);
	}
	if (userId) {
		const { error } = await svc.auth.admin.deleteUser(userId);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji ${userId}: ${error.message}`);
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
