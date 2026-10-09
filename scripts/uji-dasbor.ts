// E2E dasbor (Tahap 7a) terhadap Supabase sungguhan: outlet "UJD", kasir & admin sementara; semua dihapus.
// Notifikasi Telegram dimatikan sementara selama uji lalu dikembalikan.
//   node --env-file=.env.local scripts/uji-dasbor.ts
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
let dasborId = '';
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
		app_metadata: { username: u, nama_tampilan: 'Uji', role, ...(role === 'kasir' ? { outlet_kode: 'UJD' } : {}) }
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
	const o = await svc.from('outlets').insert({ kode: 'UJD', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const k = await akun('kasird', 'kasir');
	const adm = await akun('adind', 'admin');
	const { data: menu } = await svc.from('menu').select('id').eq('kode', 'nasi').single();
	await svc.from('harga_jual').upsert({ outlet_id: outletId, menu_id: menu!.id, harga: 4321 });

	const shift = randomUUID();
	await k.rpc('buka_shift_offline', { p: { id: shift, outlet_id: outletId, modal: 0, laci_awal: 0, waktu: new Date(Date.now() - 60_000).toISOString() } });
	for (const [metode, qty] of [['cash', 2], ['qris', 3]] as const) {
		const j = await k.rpc('catat_penjualan_offline', {
			p: {
				id: randomUUID(),
				outlet_id: outletId,
				shift_id: shift,
				metode,
				...(metode === 'cash' ? { diterima: qty * 4321 } : {}),
				waktu: new Date().toISOString(),
				kode_struk: 'UJD001',
				item: [{ menu_id: menu!.id, qty }]
			}
		});
		if (j.error) throw new Error(j.error.message);
	}
	const dari = new Date(Date.now() - 3_600_000).toISOString();
	const sampai = new Date(Date.now() + 3_600_000).toISOString();
	const a = await adm.rpc('agregasi_dasbor', {
		p_spek: { jenis: 'batang', sumber: 'penjualan', ukuran: ['omzet', 'transaksi'], kelompok: [{ kolom: 'kanal' }] },
		p_outlet: outletId,
		p_dari: dari,
		p_sampai: sampai
	});
	const baris = (a.data?.baris ?? []) as { l: string[]; n: number[] }[];
	cek(
		'omzet per kanal sesuai jualan',
		baris.length === 2 && baris.some((b) => b.l[0] === 'Tunai' && Number(b.n[0]) === 2 * 4321) && baris.some((b) => b.l[0] === 'QRIS' && Number(b.n[0]) === 3 * 4321),
		JSON.stringify(a.error ?? baris)
	);

	const s = await adm.rpc('simpan_dasbor', {
		p: { nama: `Uji ${tag}`, saringan: { outlet_id: outletId, periode: 'hari_ini' }, panel: [{ judul: 'Omzet', jenis: 'angka', x: 0, y: 0, w: 3, h: 2, spek: { sumber: 'penjualan', ukuran: ['omzet'] } }] }
	});
	dasborId = (s.data as string) ?? '';
	const baca = await adm.from('dasbor').select('nama, panel:dasbor_panel(judul)').eq('id', dasborId).single();
	cek('simpan & baca dasbor baru', !s.error && baca.data?.panel?.length === 1, s.error?.message ?? baca.error?.message);

	const box = (await svc.from('bahan').select('id').eq('kode', 'beras').single()).data!.id as string;
	const sk = await adm.rpc('siklus_stok', { p_outlet: outletId, p_kunci: box, p_dari: dari, p_sampai: sampai });
	cek('siklus stok terbaca (beras terpakai jualan nasi)', !sk.error && Number(sk.data?.saldo_sekarang) < 0, JSON.stringify(sk.error ?? { saldo: sk.data?.saldo_sekarang }));
	const rw = await adm.rpc('riwayat_kejadian', { p_outlet: outletId, p_dari: dari, p_sampai: sampai, p_jenis: null, p_sebelum: null, p_sebelum_kunci: null, p_batas: 10 });
	cek('riwayat kejadian berisi jualan & buka toko', !rw.error && (rw.data as { jenis: string }[]).filter((x) => x.jenis === 'jual').length === 2, rw.error?.message);
	const kk = await k.rpc('agregasi_dasbor', { p_spek: { sumber: 'penjualan', ukuran: ['omzet'] }, p_outlet: null, p_dari: dari, p_sampai: sampai });
	cek('kasir tidak bisa membuka dasbor', kk.error?.code === '42501', kk.error?.code);
	const bawaan = await adm.from('dasbor').select('nama').eq('bawaan', true).single();
	cek('dasbor bawaan Ringkasan ada', bawaan.data?.nama === 'Ringkasan');
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
	if (dasborId) await hapus('dasbor', svc.from('dasbor').delete().eq('id', dasborId));
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
