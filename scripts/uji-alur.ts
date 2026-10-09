// E2E ALUR LENGKAP (Tahap 8): buka toko → jual → batal → sisa → pengeluaran → kasbon → tutup → setoran → semua laporan cocok.
// Outlet "UJF", kasir & admin sementara; semua dihapus; notifikasi Telegram dimatikan selama uji.
// Notifikasi Telegram dimatikan sementara selama uji lalu dikembalikan.
//   node --env-file=.env.local scripts/uji-alur.ts
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
		app_metadata: { username: u, nama_tampilan: 'Uji', role, ...(role === 'kasir' ? { outlet_kode: 'UJF' } : {}) }
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
	const o = await svc.from('outlets').insert({ kode: 'UJF', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const k = await akun('kasirf', 'kasir');
	const adm = await akun('adinf', 'admin');
	const { data: nasi } = await svc.from('menu').select('id').eq('kode', 'nasi').single();
	const H = 4321;
	await svc.from('harga_jual').upsert({ outlet_id: outletId, menu_id: nasi!.id, harga: H });
	const sat = async (kode: string) => (await svc.from('satuan_beli').select('id').eq('kode', kode).single()).data!.id as string;
	await svc.from('harga_beli').insert([
		{ outlet_id: outletId, satuan_beli_id: await sat('beras_kg'), harga: 12345 },
		{ outlet_id: outletId, satuan_beli_id: await sat('pack_kertas_nasi'), harga: 4321 }
	]);
	const beras = (await svc.from('bahan').select('id').eq('kode', 'beras').single()).data!.id as string;
	const kategoriGas = (await svc.from('kategori_pengeluaran').select('id').eq('nama', 'Gas').single()).data?.id as string;
	const kid = (await adm.rpc('simpan_karyawan', { p: { outlet_id: outletId, nama: 'Uji Karyawan', upah_harian: H } })).data as string;
	const t = (mundurMenit: number) => new Date(Date.now() - mundurMenit * 60_000).toISOString();
	const wajib = async (nama: string, q: PromiseLike<{ error: { message: string } | null; data?: unknown }>) => {
		const r = await q;
		if (r.error) throw new Error(`${nama}: ${r.error.message}`);
		return r.data;
	};

	const LACI = 10 * H;
	const shift = randomUUID();
	await wajib('buka toko', k.rpc('buka_shift_offline', { p: { id: shift, outlet_id: outletId, modal: LACI, laci_awal: LACI, waktu: t(60) } }));
	const jual = async (metode: string, qty: number, menit: number) => {
		const id = randomUUID();
		await wajib(
			`jual ${metode}`,
			k.rpc('catat_penjualan_offline', {
				p: { id, outlet_id: outletId, shift_id: shift, metode, ...(metode === 'cash' ? { diterima: qty * H } : {}), waktu: t(menit), kode_struk: 'UJF001', item: [{ menu_id: nasi!.id, qty }] }
			})
		);
		return id;
	};
	await jual('cash', 3, 50);
	await jual('qris', 2, 45);
	await jual('gofood', 1, 40);
	const batal = await jual('cash', 1, 35);
	// kasir membatalkan saat toko buka (jam kejadian di perangkat): uang dikembalikan ke pembeli
	await wajib('batal', k.rpc('void_penjualan_offline', { p: { penjualan_id: batal, alasan: 'uji alur', waktu: t(33) } }));
	await wajib('sisa', k.rpc('catat_rusak_offline', { p: { id: randomUUID(), outlet_id: outletId, alasan: 'sisa_tidak_laku', waktu: t(30), item: [{ bahan_id: beras, qty: 0.2 }] } }));
	await wajib('pengeluaran', k.rpc('catat_pengeluaran_offline', { p: { id: randomUUID(), outlet_id: outletId, kategori_id: kategoriGas, jumlah: 1000, waktu: t(25) } }));
	await wajib('kasbon', k.rpc('catat_kasbon_offline', { p: { id: randomUUID(), outlet_id: outletId, karyawan_id: kid, jumlah: 2000, waktu: t(20) } }));
	const seharusnya = LACI + 3 * H - 1000 - 2000;
	const tutup = (await wajib('tutup toko', k.rpc('tutup_shift_offline', { p: { id: randomUUID(), shift_id: shift, uang_fisik: seharusnya, waktu: t(15) } }))) as { selisih: number };
	cek('tutup toko: selisih 0 (laci awal + tunai − batal − pengeluaran − kasbon)', Number(tutup?.selisih) === 0, JSON.stringify(tutup));
	const setor = randomUUID();
	await wajib('setoran', k.rpc('catat_setoran_offline', { p: { id: setor, outlet_id: outletId, jumlah: 5000, waktu: t(10) } }));
	await wajib('terima setoran', adm.rpc('terima_setoran', { p_id: setor, p_jumlah: 5000, p_catatan: null }));

	const OMZET = 6 * H; // 3 tunai + 2 QRIS + 1 GoFood (yang dibatalkan tidak dihitung)
	const saldo = (await adm.rpc('saldo_laci', { p_outlet: outletId })).data as { saldo: number };
	cek('uang laci = seharusnya − setoran', Number(saldo?.saldo) === seharusnya - 5000, JSON.stringify(saldo));
	const hari = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
	const kas = (await adm.rpc('kas_harian', { p_outlet: outletId, p_dari: hari, p_sampai: hari })).data as { total: number; setoran: number }[];
	cek('kas harian: omzet & setoran', Number(kas?.[0]?.total) === OMZET && Number(kas?.[0]?.setoran) === 5000, JSON.stringify(kas?.[0] ?? kas));
	const lk = (await adm.rpc('laporan_keuangan', { p_outlet: outletId, p_dari: hari, p_sampai: hari })).data as { omzet: number };
	cek('laba-rugi: omzet sama dengan kas harian', Number(lk?.omzet) === OMZET, JSON.stringify(lk?.omzet));
	const r = { p_dari: t(120), p_sampai: new Date(Date.now() + 60_000).toISOString() };
	const ag = (await adm.rpc('agregasi_dasbor', { p_spek: { jenis: 'batang', sumber: 'penjualan', ukuran: ['omzet'], kelompok: [{ kolom: 'kanal' }] }, p_outlet: outletId, ...r })).data as {
		baris: { l: string[]; n: number[] }[];
	};
	cek('dasbor: omzet per kanal = laba-rugi', (ag?.baris ?? []).reduce((s, b) => s + Number(b.n[0]), 0) === OMZET, JSON.stringify(ag?.baris));
	const tb = (await adm.rpc('agregasi_dasbor', { p_spek: { jenis: 'angka', sumber: 'terbuang', ukuran: ['jumlah', 'nilai'] }, p_outlet: outletId, ...r })).data as { baris: { n: number[] }[] };
	cek('dasbor: sisa 0,2 kg beras bernilai modal', Number(tb?.baris?.[0]?.n?.[0]) === 0.2 && Number(tb?.baris?.[0]?.n?.[1]) === Math.round(0.2 * 12345), JSON.stringify(tb?.baris));
	const um = (await adm.rpc('untung_menu', { p_outlet: outletId, ...r })).data as { menu: { nama: string; terjual: number }[] };
	cek('analisis: nasi terjual 6 porsi', um?.menu?.find((m) => m.nama === 'Nasi')?.terjual === 6, JSON.stringify(um?.menu?.find((m) => m.nama === 'Nasi')));
	const rw = (await adm.rpc('riwayat_kejadian', { p_outlet: outletId, ...r, p_jenis: null, p_sebelum: null, p_sebelum_kunci: null, p_batas: 50 })).data as { jenis: string }[];
	const jenis = new Set((rw ?? []).map((x) => x.jenis));
	cek('riwayat memuat semua kejadian', ['jual', 'batal', 'sisa', 'pengeluaran', 'kasbon', 'setoran', 'toko'].every((j) => jenis.has(j)), [...jenis].join(','));
	const rb = (await adm.rpc('rencana_belanja', { p_hari: 7 })).data as { barang: { nama: string; per_outlet: Record<string, { saran: number }> }[] };
	cek('rencana belanja: beras perlu dibeli', (rb?.barang?.find((b) => b.nama.startsWith('Beras'))?.per_outlet[outletId]?.saran ?? 0) >= 1);
	const g = (await adm.rpc('hitung_gaji', { p_outlet: outletId, p_bulan: hari.slice(0, 8) + '01' })).data as { nama: string; sisa_kasbon: number }[];
	cek('gaji: kasbon kasir masuk sisa kasbon', Number(g?.find((x) => x.nama === 'Uji Karyawan')?.sisa_kasbon) === 2000, JSON.stringify(g));
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
		const rs = ((await svc.from('rusak').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (rs.length) {
			await hapus('rusak_item', svc.from('rusak_item').delete().in('rusak_id', rs));
			await hapus('rusak', svc.from('rusak').delete().in('id', rs));
		}
		await hapus('setoran', svc.from('setoran').delete().eq('outlet_id', outletId));
		await hapus('pengeluaran', svc.from('pengeluaran').delete().eq('outlet_id', outletId));
		await hapus('karyawan', svc.from('karyawan').delete().eq('outlet_id', outletId));
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
