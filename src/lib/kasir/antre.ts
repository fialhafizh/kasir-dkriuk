// Simpan tindakan kasir ke antrean perangkat lalu coba kirim (tanpa menunggu; aman tanpa internet).
import { auth } from '#lib/auth/session.svelte.ts';
import { tambahKejadian } from '#lib/offline/antrean.ts';
import type { Kejadian } from '#lib/offline/db.ts';
import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';

export async function antrekan(k: Pick<Kejadian, 'id' | 'jenis' | 'outlet_id' | 'shift_id' | 'waktu' | 'data'>): Promise<void> {
	await tambahKejadian(dbKasir, { ...k, user_id: auth.profile?.id ?? null });
	void sinkron.jalankan();
}
