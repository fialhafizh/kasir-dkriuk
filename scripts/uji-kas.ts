// E2E kas harian (Tahap 5a) terhadap Supabase sungguhan: outlet "UJK", kasir & admin sementara; semua dihapus di akhir.
//   node --env-file=.env.local scripts/uji-kas.ts
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

async function akun(nama: string, role: 'kasir' | 'admin'): Promise<SupabaseClient> {
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.${nama}.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: 'Uji', role, ...(role === 'kasir' ? { outlet_kode: 'UJK' } : {}) }
	});
	if (a.error) throw new Error(a.error.message);
	users.push(a.data.user.id);
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await c.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);
	return c;
}

try {
	const o = await svc.from('outlets').insert({ kode: 'UJK', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const menu = (await svc.from('menu').select('id, kode')).data ?? [];
	await svc.from('harga_jual').insert(menu.map((m) => ({ outlet_id: outletId, menu_id: m.id, harga: 5000 })));
	const nasi = menu.find((m) => m.kode === 'nasi')!.id;
	const k = await akun('kasirk', 'kasir');
	const adm = await akun('admink', 'admin');
	const saldo = async () => Number((await k.rpc('saldo_laci', { p_outlet: outletId })).data?.saldo);
	const gas = (await svc.from('kategori_pengeluaran').select('id').eq('nama', 'Gas').single()).data!.id;

	const s = randomUUID();
	const b = await k.rpc('buka_shift_offline', { p: { id: s, outlet_id: outletId, modal: 100000, laci_awal: 100000, waktu: jam(120) } });
	cek('buka toko pertama: uang laci awal', !b.error && (await saldo()) === 100000, b.error?.message);
	const j = await k.rpc('catat_penjualan_offline', {
		p: { id: randomUUID(), outlet_id: outletId, shift_id: s, metode: 'cash', diterima: 50000, waktu: jam(110), kode_struk: 'UJK001', item: [{ menu_id: nasi, qty: 10 }] }
	});
	cek('jual cash menambah laci', !j.error && (await saldo()) === 150000, j.error?.message);
	const pid = randomUUID();
	const p1 = await k.rpc('catat_pengeluaran_offline', { p: { id: pid, outlet_id: outletId, kategori_id: gas, jumlah: 7000, waktu: jam(100) } });
	const p2 = await k.rpc('catat_pengeluaran_offline', { p: { id: pid, outlet_id: outletId, kategori_id: gas, jumlah: 7000, waktu: jam(100) } });
	cek('pengeluaran laci idempoten', !p1.error && !p2.error && (await saldo()) === 143000, p1.error?.message ?? p2.error?.message);
	const t = await k.rpc('tutup_shift_offline', { p: { id: randomUUID(), shift_id: s, uang_fisik: 143000, waktu: jam(90) } });
	cek('tutup toko: uang seharusnya = saldo laci, selisih 0', t.data?.cash_seharusnya === 143000 && t.data?.selisih === 0, JSON.stringify(t.data ?? t.error));
	const sid = randomUUID();
	const st = await k.rpc('catat_setoran_offline', { p: { id: sid, outlet_id: outletId, jumlah: 120000, waktu: jam(60) } });
	cek('setoran setelah tutup mengurangi laci', !st.error && (await saldo()) === 23000, st.error?.message);
	const tr = await adm.rpc('terima_setoran', { p_id: sid, p_jumlah: 119000, p_catatan: 'uji selisih' });
	const sr = (await svc.from('setoran').select('jumlah_diterima').eq('id', sid).single()).data;
	cek('owner menerima setoran dengan selisih', !tr.error && sr?.jumlah_diterima === 119000 && (await saldo()) === 23000, tr.error?.message);
	const bp = await adm.rpc('batal_pengeluaran', { p_id: pid, p_alasan: 'uji koreksi' });
	const r = await k.rpc('ringkasan_shift', { p_shift: s });
	cek('batal pengeluaran = koreksi: selisih shift berubah, saldo tetap', !bp.error && r.data?.selisih === -7000 && (await saldo()) === 23000, JSON.stringify(r.data ?? bp.error));
	const hari = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
	const kemarin = new Date(Date.now() + 7 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
	const kh = await adm.rpc('kas_harian', { p_outlet: outletId, p_dari: kemarin, p_sampai: hari });
	const hs = (kh.data ?? []) as { total: number; setoran: number; saldo_akhir: number }[];
	cek(
		'kas harian (kemarin–hari ini)',
		!kh.error && hs.reduce((a, h) => a + Number(h.total), 0) === 50000 && hs.reduce((a, h) => a + Number(h.setoran), 0) === 120000 && Number(hs.at(-1)?.saldo_akhir) === 23000,
		JSON.stringify(kh.error ?? hs)
	);
	const kb = await k.rpc('kas_harian', { p_outlet: outletId, p_dari: hari, p_sampai: hari });
	cek('kasir tidak bisa membuka kas harian', kb.error?.code === '42501', kb.error?.code);
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
		await hapus('gerakan_stok', svc.from('gerakan_stok').delete().eq('outlet_id', outletId));
		await hapus('pengeluaran', svc.from('pengeluaran').delete().eq('outlet_id', outletId));
		await hapus('setoran', svc.from('setoran').delete().eq('outlet_id', outletId));
		const ids = ((await svc.from('penjualan').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (ids.length) await hapus('penjualan_item', svc.from('penjualan_item').delete().in('penjualan_id', ids));
		await hapus('penjualan', svc.from('penjualan').delete().eq('outlet_id', outletId));
		const sh = ((await svc.from('shift').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (sh.length) await hapus('shift_perangkat', svc.from('shift_perangkat').delete().in('shift_id', sh));
		await hapus('shift', svc.from('shift').delete().eq('outlet_id', outletId));
		await hapus('laci_awal', svc.from('laci_awal').delete().eq('outlet_id', outletId));
		await hapus('nomor_harian', svc.from('nomor_harian').delete().eq('outlet_id', outletId));
		await hapus('harga_jual', svc.from('harga_jual').delete().eq('outlet_id', outletId));
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
