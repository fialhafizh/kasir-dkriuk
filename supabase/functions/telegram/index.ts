// Edge Function: notifikasi Telegram. Token bot hanya di secret TELEGRAM_BOT_TOKEN.
//   kirim     — dipanggil pg_cron tiap menit (tanpa sesi): mengirim pesan di antrean. Aman dipanggil siapa pun:
//               hanya mengirim yang sudah diantre database ke grup yang sudah diatur admin.
//   hubungkan — admin: mengenali grup tempat bot menjadi admin, membuat topik, menyimpan pengaturan.
//   uji       — admin: kirim pesan uji ke tiap topik.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { kunciServis } from '../_shared/akun.ts';
import { badanPesan, bacaPerintah, calonGrup, nilaiBalasan, TOPIK, topikKurang, type HasilKirim, type KunciTopik } from '../_shared/telegram.ts';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Bot = (metode: string, badan?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;

function buatBot(token: string): Bot {
	return async (metode, badan) => {
		const r = await fetch(`https://api.telegram.org/bot${token}/${metode}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(badan ?? {}),
			signal: AbortSignal.timeout(15_000)
		});
		return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
	};
}

async function kirimSatu(bot: Bot, chatId: number, threadId: number | null, teks: string): Promise<HasilKirim> {
	try {
		const r = await bot('sendMessage', badanPesan(chatId, threadId, teks));
		return nilaiBalasan(r.status, r.json);
	} catch (e) {
		return { ok: false, galat: `Jaringan: ${(e as Error).name}` };
	}
}

async function kirimAntrean(db: SupabaseClient, bot: Bot) {
	let terkirim = 0;
	let gagal = 0;
	// Beberapa putaran dalam satu panggilan; berhenti bila antrean habis atau kena batas kecepatan.
	for (let putaran = 0; putaran < 3; putaran++) {
		const { data, error } = await db.rpc('_tg_ambil', { p_batas: 20 });
		if (error) throw error;
		const daftar = (data ?? []) as { id: number; chat_id: number; thread_id: number | null; teks: string }[];
		if (!daftar.length) break;
		for (const p of daftar) {
			const h = await kirimSatu(bot, p.chat_id, p.thread_id, p.teks);
			await db.rpc('_tg_hasil', h.ok ? { p_id: p.id, p_ok: true } : { p_id: p.id, p_ok: false, p_galat: h.galat, p_tunda_detik: h.tundaDetik ?? null });
			if (h.ok) terkirim++;
			else gagal++;
			// Batas kecepatan: sisa pesan yang dipinjam akan diambil lagi setelah masa pinjam habis.
			if (!h.ok && h.tundaDetik) return { terkirim, gagal };
			await new Promise((r) => setTimeout(r, 1100));
		}
	}
	return { terkirim, gagal };
}

async function hubungkan(db: SupabaseClient, bot: Bot, pilih: number | undefined) {
	const me = await bot('getMe');
	const botId = (me.json.result as { id?: number } | undefined)?.id;
	if (!botId) return json(502, { error: 'Bot tidak bisa dihubungi. Periksa token bot.' });
	const { data: atur } = await db.from('telegram_pengaturan').select('chat_id, topik').eq('id', true).single();
	const upd = await bot('getUpdates', { allowed_updates: ['message', 'my_chat_member'] });
	const calon = calonGrup(upd.json.result);
	if (atur?.chat_id && !calon.some((c) => c.chat_id === Number(atur.chat_id))) calon.push({ chat_id: Number(atur.chat_id), judul: '' });

	const layak: { chat_id: number; judul: string }[] = [];
	for (const c of calon) {
		const chat = (await bot('getChat', { chat_id: c.chat_id })).json.result as { is_forum?: boolean; title?: string } | undefined;
		const anggota = (await bot('getChatMember', { chat_id: c.chat_id, user_id: botId })).json.result as
			| { status?: string; can_manage_topics?: boolean }
			| undefined;
		if (chat?.is_forum && anggota?.status === 'administrator' && anggota.can_manage_topics) layak.push({ chat_id: c.chat_id, judul: chat.title ?? c.judul });
	}
	const dipilih = pilih !== undefined ? layak.find((g) => g.chat_id === pilih) : layak.length === 1 ? layak[0] : undefined;
	if (!dipilih) {
		if (layak.length > 1 && pilih === undefined) return json(200, { ok: false, pilih: layak });
		return json(400, {
			error: 'Grup belum ditemukan. Pastikan Topics aktif, bot menjadi admin dengan izin Kelola Topik, lalu kirim satu pesan di grup.'
		});
	}

	const topik: Partial<Record<KunciTopik, number>> = Number(atur?.chat_id) === dipilih.chat_id ? { ...(atur?.topik ?? {}) } : {};
	for (const t of topikKurang(topik)) {
		const r = await bot('createForumTopic', { chat_id: dipilih.chat_id, name: t.nama, icon_color: t.warna });
		const id = (r.json.result as { message_thread_id?: number } | undefined)?.message_thread_id;
		if (!id) return json(502, { error: `Topik "${t.nama}" gagal dibuat: ${String(r.json.description ?? r.status)}` });
		topik[t.kunci] = id;
	}
	const { error } = await db
		.from('telegram_pengaturan')
		.update({
			chat_id: dipilih.chat_id,
			chat_judul: dipilih.judul,
			topik,
			fungsi_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram`,
			diubah_at: new Date().toISOString()
		})
		.eq('id', true);
	if (error) throw error;
	return json(200, { ok: true, judul: dipilih.judul });
}

async function uji(db: SupabaseClient, bot: Bot) {
	const { data: atur } = await db.from('telegram_pengaturan').select('chat_id, topik').eq('id', true).single();
	if (!atur?.chat_id) return json(400, { error: 'Grup Telegram belum dihubungkan.' });
	const jam = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
	const hasil: { topik: string; ok: boolean; galat?: string }[] = [];
	for (const t of TOPIK) {
		const thread = (atur.topik as Record<string, number>)?.[t.kunci] ?? null;
		const h = await kirimSatu(bot, Number(atur.chat_id), thread, `✅ Pesan uji dari Kasir D'Kriuk untuk topik <b>${t.nama}</b> · ${jam} WIB`);
		hasil.push({ topik: t.nama, ok: h.ok, ...(h.ok ? {} : { galat: h.galat }) });
	}
	return json(200, { ok: hasil.every((h) => h.ok), hasil });
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
	if (req.method !== 'POST') return json(405, { error: 'Metode tidak didukung.' });

	const kunci = kunciServis(Deno.env.toObject());
	const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
	if (!kunci || !token) {
		console.error('telegram: kunci servis / token bot tidak tersedia');
		return json(500, { error: 'Fungsi server belum dikonfigurasi.' });
	}
	const db = createClient(Deno.env.get('SUPABASE_URL')!, kunci, { auth: { persistSession: false, autoRefreshToken: false } });
	const bot = buatBot(token);

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
		if (p.aksi === 'kirim') return json(200, { ok: true, ...(await kirimAntrean(db, bot)) });

		// verify_jwt dimatikan (sistem kunci baru); sesi admin diperiksa di sini.
		const sesi = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
		const { data: u, error: ue } = await db.auth.getUser(sesi);
		if (ue || !u.user) return json(401, { error: 'Sesi tidak sah. Silakan masuk ulang.' });
		const { data: saya } = await db.from('profiles').select('role, aktif').eq('id', u.user.id).maybeSingle();
		if (!saya || saya.role !== 'admin' || !saya.aktif) return json(403, { error: 'Hanya admin yang boleh mengatur Telegram.' });

		if (p.aksi === 'hubungkan') return await hubungkan(db, bot, p.chat_id);
		return await uji(db, bot);
	} catch (e) {
		console.error('telegram:', (e as { code?: string; name?: string }).code ?? (e as Error).name ?? 'tidak diketahui');
		return json(500, { error: 'Gagal memproses Telegram. Coba lagi.' });
	}
});
