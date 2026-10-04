import { pesanErrorData } from '#lib/master/pesan.ts';
import { bacaGalatFungsi } from './galat.ts';
import { supabase } from '#lib/supabase/client.ts';
import type { Profile } from '#lib/types/db.ts';
import type { Perintah } from '../../../supabase/functions/_shared/akun.ts';

export type { Perintah };

export async function muatAkun(): Promise<Profile[]> {
	const { data, error } = await supabase.from('profiles').select('id, username, nama_tampilan, role, outlet_id, aktif').order('username');
	if (error) throw new Error(pesanErrorData(error) ?? 'Daftar akun gagal dimuat.');
	return data ?? [];
}

export async function kirimPerintahAkun(p: Perintah): Promise<{ ok: true; id?: string; username?: string; password?: string }> {
	const { data, error } = await supabase.functions.invoke('admin-akun', { body: p });
	if (!error) return data;
	throw new Error(await bacaGalatFungsi(error));
}
