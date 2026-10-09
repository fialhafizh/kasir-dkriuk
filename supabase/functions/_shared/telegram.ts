// Logika murni Edge Function `telegram` (teruji di tests/functions/telegram.test.ts).

export type KunciTopik = 'struk' | 'harian' | 'peringatan' | 'kas';

/** Topik grup yang dibuat bot; warna ikon dari daftar yang diizinkan Telegram. */
export const TOPIK: { kunci: KunciTopik; nama: string; warna: number }[] = [
	{ kunci: 'struk', nama: '🧾 Struk', warna: 7322096 },
	{ kunci: 'harian', nama: '🏪 Tutup toko & harian', warna: 9367192 },
	{ kunci: 'peringatan', nama: '⚠️ Peringatan', warna: 16478047 },
	{ kunci: 'kas', nama: '💰 Kas', warna: 16766590 }
];

export type Perintah = { aksi: 'kirim' } | { aksi: 'uji' } | { aksi: 'hubungkan'; chat_id?: number };

export function bacaPerintah(body: unknown): { ok: true; perintah: Perintah } | { ok: false; error: string } {
	const b = (body ?? {}) as Record<string, unknown>;
	if (b.aksi === 'kirim' || b.aksi === 'uji') return { ok: true, perintah: { aksi: b.aksi } };
	if (b.aksi === 'hubungkan') {
		if (b.chat_id === undefined || b.chat_id === null) return { ok: true, perintah: { aksi: 'hubungkan' } };
		if (typeof b.chat_id === 'number' && Number.isSafeInteger(b.chat_id)) return { ok: true, perintah: { aksi: 'hubungkan', chat_id: b.chat_id } };
		return { ok: false, error: 'Grup tidak valid.' };
	}
	return { ok: false, error: 'Perintah tidak dikenal.' };
}

/** Badan sendMessage: HTML, tanpa pratinjau tautan; tanpa thread = topik General. */
export function badanPesan(chatId: number, threadId: number | null, teks: string) {
	return {
		chat_id: chatId,
		...(threadId ? { message_thread_id: threadId } : {}),
		text: teks,
		parse_mode: 'HTML',
		link_preview_options: { is_disabled: true }
	};
}

export type HasilKirim = { ok: true } | { ok: false; galat: string; tundaDetik?: number };

/** Menafsirkan balasan Bot API. 429 → tunda sesuai retry_after (bukan kegagalan). */
export function nilaiBalasan(status: number, json: unknown): HasilKirim {
	const j = (json ?? {}) as { ok?: boolean; description?: string; error_code?: number; parameters?: { retry_after?: number } };
	if (status === 200 && j.ok) return { ok: true };
	const galat = `${j.error_code ?? status}: ${j.description ?? 'tidak diketahui'}`.slice(0, 300);
	const tunda = j.parameters?.retry_after;
	if ((status === 429 || j.error_code === 429) && typeof tunda === 'number') return { ok: false, galat, tundaDetik: Math.max(1, Math.ceil(tunda)) };
	return { ok: false, galat };
}

export interface CalonGrup {
	chat_id: number;
	judul: string;
}

/** Supergrup yang pernah terlihat bot di getUpdates (pesan / perubahan keanggotaan), tanpa duplikat. */
export function calonGrup(updates: unknown): CalonGrup[] {
	const hasil = new Map<number, string>();
	for (const u of Array.isArray(updates) ? updates : []) {
		const x = u as Record<string, { chat?: { id?: unknown; type?: unknown; title?: unknown } } | undefined>;
		for (const kunci of ['message', 'my_chat_member', 'edited_message']) {
			const c = x[kunci]?.chat;
			if (c && c.type === 'supergroup' && typeof c.id === 'number') hasil.set(c.id, typeof c.title === 'string' ? c.title : String(c.id));
		}
	}
	return [...hasil].map(([chat_id, judul]) => ({ chat_id, judul }));
}

/** Topik yang belum punya id (perlu dibuat). */
export function topikKurang(topik: Partial<Record<KunciTopik, number>> | null | undefined): typeof TOPIK {
	return TOPIK.filter((t) => typeof topik?.[t.kunci] !== 'number');
}
