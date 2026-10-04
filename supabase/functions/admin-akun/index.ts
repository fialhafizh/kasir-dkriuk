// Edge Function: kelola akun (hanya admin aktif). Kunci service role hanya ada di server.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { BAN_SELAMANYA, bacaPerintah, cekBolehNonaktif, emailDariUsername, passwordDariAcak } from '../_shared/akun.ts';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const passwordBaru = () => passwordDariAcak(crypto.getRandomValues(new Uint8Array(9)));

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
	if (req.method !== 'POST') return json(405, { error: 'Metode tidak didukung.' });

	const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
	const { data: u, error: ue } = await db.auth.getUser(token);
	if (ue || !u.user) return json(401, { error: 'Sesi tidak sah. Silakan masuk ulang.' });
	const { data: saya } = await db.from('profiles').select('id, role, aktif').eq('id', u.user.id).maybeSingle();
	if (!saya || saya.role !== 'admin' || !saya.aktif) return json(403, { error: 'Hanya admin yang boleh mengelola akun.' });

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return json(400, { error: 'Permintaan tidak bisa dibaca.' });
	}
	const hasil = bacaPerintah(body);
	if (!hasil.ok) return json(400, { error: hasil.error });
	const p = hasil.perintah;

	try {
		if (p.aksi === 'buat') {
			if (p.outlet_kode) {
				const { data: o } = await db.from('outlets').select('id').eq('kode', p.outlet_kode).maybeSingle();
				if (!o) return json(404, { error: 'Outlet tidak ditemukan.' });
			}
			const password = passwordBaru();
			const { data, error } = await db.auth.admin.createUser({
				email: emailDariUsername(p.username),
				password,
				email_confirm: true,
				app_metadata: { username: p.username, nama_tampilan: p.nama_tampilan, role: p.role, outlet_kode: p.outlet_kode }
			});
			if (error) {
				if (/already|exists|registered/i.test(error.message)) return json(409, { error: 'Username sudah dipakai.' });
				return json(500, { error: 'Akun gagal dibuat. Coba lagi.' });
			}
			return json(200, { ok: true, id: data.user.id, username: p.username, password });
		}

		const { data: target } = await db.from('profiles').select('id, role, aktif').eq('id', p.id).maybeSingle();
		if (!target) return json(404, { error: 'Akun tidak ditemukan.' });

		if (p.aksi === 'ubah') {
			const ubah: Record<string, unknown> = {};
			if (p.nama_tampilan !== undefined) ubah.nama_tampilan = p.nama_tampilan;
			if (p.outlet_kode !== undefined) {
				if (target.role !== 'kasir') return json(400, { error: 'Hanya akun kasir yang punya outlet.' });
				const { data: o } = await db.from('outlets').select('id').eq('kode', p.outlet_kode).maybeSingle();
				if (!o) return json(404, { error: 'Outlet tidak ditemukan.' });
				ubah.outlet_id = o.id;
			}
			const { error } = await db.from('profiles').update(ubah).eq('id', p.id);
			if (error) return json(500, { error: 'Perubahan gagal disimpan.' });
			return json(200, { ok: true });
		}

		if (p.aksi === 'reset_password') {
			const password = passwordBaru();
			const { error } = await db.auth.admin.updateUserById(p.id, { password });
			if (error) return json(500, { error: 'Password gagal direset.' });
			return json(200, { ok: true, password });
		}

		// set_aktif
		if (!p.aktif) {
			const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').eq('aktif', true);
			const tolak = cekBolehNonaktif({
				pemanggilId: saya.id,
				targetId: p.id,
				targetRole: target.role,
				adminAktif: (admins ?? []).map((a) => a.id)
			});
			if (tolak) return json(400, { error: tolak });
		}
		const { error: be } = await db.auth.admin.updateUserById(p.id, { ban_duration: p.aktif ? 'none' : BAN_SELAMANYA });
		if (be) return json(500, { error: 'Status login gagal diubah.' });
		const { error: pe } = await db.from('profiles').update({ aktif: p.aktif }).eq('id', p.id);
		if (pe) return json(500, { error: 'Status akun gagal disimpan.' });
		return json(200, { ok: true });
	} catch {
		return json(500, { error: 'Gagal memproses akun. Coba lagi.' });
	}
});
