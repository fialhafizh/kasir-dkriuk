// E2E Telegram (Tahap 6) terhadap Supabase sungguhan: pg_cron → Edge Function → grup Telegram.
// Mengirim beberapa pesan bertanda "Uji" ke grup; outlet "UJT", kasir sementara & data jualan dihapus.
//   node --env-file=.env.local scripts/uji-telegram.ts
import { createClient } from '@supabase/supabase-js';
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

/** Tunggu pesan berkunci tertentu terkirim oleh jadwal tiap menit (maks. ~3 menit). */
async function tungguTerkirim(kunci: string): Promise<{ terkirim_at: string | null; galat: string | null } | null> {
	for (let i = 0; i < 36; i++) {
		const { data } = await svc.from('telegram_antrean').select('terkirim_at, galat').eq('kunci', kunci).maybeSingle();
		if (data?.terkirim_at) return data;
		await new Promise((r) => setTimeout(r, 5000));
	}
	return (await svc.from('telegram_antrean').select('terkirim_at, galat').eq('kunci', kunci).maybeSingle()).data;
}

try {
	const { data: atur } = await svc.from('telegram_pengaturan').select('chat_id, chat_judul, topik, fungsi_url').eq('id', true).single();
	cek('grup terhubung & topik lengkap', !!atur?.chat_id && Object.keys(atur.topik ?? {}).length === 4 && !!atur.fungsi_url, atur?.chat_judul ?? '-');

	const kunci = `uji:${tag}`;
	await svc.from('telegram_antrean').insert({ kunci, jenis: 'uji', topik: 'peringatan', teks: `🧪 Uji otomatis ${tag}: abaikan pesan ini.` });
	const h = await tungguTerkirim(kunci);
	cek('pesan antrean terkirim oleh jadwal tiap menit', !!h?.terkirim_at, h?.galat ?? '');

	const o = await svc.from('outlets').insert({ kode: 'UJT', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.kasirt.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: 'Uji', role: 'kasir', outlet_kode: 'UJT' }
	});
	if (a.error) throw new Error(a.error.message);
	userId = a.data.user.id;
	const k = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await k.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);

	const { data: menu } = await svc.from('menu').select('id').eq('kode', 'nasi').single();
	await svc.from('harga_jual').upsert({ outlet_id: outletId, menu_id: menu!.id, harga: 5000 });
	const shift = randomUUID();
	const b = await k.rpc('buka_shift_offline', { p: { id: shift, outlet_id: outletId, modal: 0, laci_awal: 0, waktu: new Date().toISOString() } });
	const jual = randomUUID();
	const j = await k.rpc('catat_penjualan_offline', {
		p: { id: jual, outlet_id: outletId, shift_id: shift, metode: 'qris', waktu: new Date().toISOString(), kode_struk: 'UJT001', item: [{ menu_id: menu!.id, qty: 1 }] }
	});
	cek('jualan uji tercatat', !b.error && !j.error, b.error?.message ?? j.error?.message);
	const s = await tungguTerkirim(`struk:${jual}`);
	cek('struk transaksi terkirim ke topik Struk', !!s?.terkirim_at, s?.galat ?? '');
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
	}
	if (userId) {
		const { error } = await svc.auth.admin.deleteUser(userId);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji: ${error.message}`);
		}
	}
	if (outletId) await hapus('outlet', svc.from('outlets').delete().eq('id', outletId));
	console.log('\nData uji dibersihkan (pesan uji di grup Telegram tetap ada).');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
