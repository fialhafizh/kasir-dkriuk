import { describe, expect, it } from 'vitest';
import { bacaCache, galatJaringan, hapusCache, simpanCache, type Penyimpan } from './cache-profil';

function memori(): Penyimpan & { isi: Map<string, string> } {
	const isi = new Map<string, string>();
	return { isi, getItem: (k) => isi.get(k) ?? null, setItem: (k, v) => void isi.set(k, v), removeItem: (k) => void isi.delete(k) };
}
const profile = { id: 'u1', username: 'kasir.bukitlama', nama_tampilan: 'K', role: 'kasir' as const, outlet_id: 'o1', aktif: true };
const outlet = { id: 'o1', kode: 'BL', nama: 'Bukit Lama', merek: "D'Kriuk", alamat: 'x', telepon: 'y', aktif: true };

describe('cache profil', () => {
	it('menyimpan dan membaca untuk user yang sama', () => {
		const s = memori();
		simpanCache(s, 'u1', profile, outlet);
		expect(bacaCache(s, 'u1')).toEqual({ profile, outlet });
	});
	it('tidak dipakai untuk user lain', () => {
		const s = memori();
		simpanCache(s, 'u1', profile, outlet);
		expect(bacaCache(s, 'u2')).toBeNull();
	});
	it('isi rusak atau penyimpanan gagal → null, tidak melempar', () => {
		const s = memori();
		s.setItem('dk-profil', '{rusak');
		expect(bacaCache(s, 'u1')).toBeNull();
		const gagal: Penyimpan = {
			getItem: () => {
				throw new Error('diblokir');
			},
			setItem: () => {
				throw new Error('diblokir');
			},
			removeItem: () => {}
		};
		expect(() => simpanCache(gagal, 'u1', profile, outlet)).not.toThrow();
		expect(bacaCache(gagal, 'u1')).toBeNull();
	});
	it('hapus', () => {
		const s = memori();
		simpanCache(s, 'u1', profile, outlet);
		hapusCache(s);
		expect(bacaCache(s, 'u1')).toBeNull();
	});
});

describe('galatJaringan', () => {
	it('mengenali putus koneksi dari PostgREST/auth-js', () => {
		expect(galatJaringan({ message: 'TypeError: Failed to fetch' })).toBe(true);
		expect(galatJaringan({ message: 'Load failed' })).toBe(true);
		expect(galatJaringan({ name: 'AuthRetryableFetchError', status: 0, message: 'x' })).toBe(true);
		expect(galatJaringan({ message: 'permission denied', status: 403 })).toBe(false);
		expect(galatJaringan(null)).toBe(false);
	});
});
