import { describe, expect, it } from 'vitest';
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import { LABEL_JENIS, angkaStok, hitungRingkasan, labelGrup, susunStok } from './tampil';

const b = (id: string, nama: string, satuan: string, urutan: number, aktif = true): Bahan => ({ id, kode: id, nama, satuan, mode: 'otomatis', urutan, aktif });
const s = (id: string, nama: string, ambang: number | null): SatuanBeli => ({ id, kode: id, nama, ambang, harga_tetap: true, urutan: 0, aktif: true });
const i = (satuan_beli_id: string, bahan_id: string, qty: number): IsiSatuanBeli => ({ satuan_beli_id, bahan_id, qty });

const bahan = [
	b('dada', 'Dada Ori', 'potong', 10),
	b('paha_atas', 'Paha Atas Ori', 'potong', 11),
	b('paha_bawah', 'Paha Bawah Ori', 'potong', 12),
	b('sayap', 'Sayap Ori', 'potong', 13),
	b('kemasan', 'Kemasan Kecil', 'pcs', 50),
	b('beras', 'Beras', 'kg', 40),
	b('tepung', "Tepung D'Kriuk", 'kg', 70),
	b('lama', 'Bahan Lama', 'pcs', 80, false)
];
const satuan = [
	s('pack_ori', 'Pack Ayam Ori (1 kg)', 10),
	s('pack_kemasan', 'Pack Kemasan Kecil', 2),
	s('beras_kg', 'Beras (per kg)', null),
	s('pack_tepung', "Pack Tepung D'Kriuk (1,3 kg)", null),
	s('karung_tepung', "Karung Tepung D'Kriuk (19,5 kg)", null)
];
const isi = [
	i('pack_ori', 'dada', 3),
	i('pack_ori', 'paha_atas', 2),
	i('pack_ori', 'paha_bawah', 2),
	i('pack_ori', 'sayap', 2),
	i('pack_kemasan', 'kemasan', 100),
	i('beras_kg', 'beras', 1),
	i('pack_tepung', 'tepung', 1.3),
	i('karung_tepung', 'tepung', 19.5)
];
const susun = (stok: Record<string, number>) => susunStok(bahan, satuan, isi, new Map(Object.entries(stok)));

describe('susunStok', () => {
	it('ayam satu baris per varian: pack utuh + potongan lepas; menipis dari pack-setara', () => {
		const [ayam] = susun({ dada: 15, paha_atas: 10, paha_bawah: 10, sayap: 13 });
		expect(ayam).toMatchObject({ label: 'Ayam Ori', teks: '5 pack + 3 Sayap Ori', status: 'menipis' });
		expect(ayam.bahan_id).toEqual(['dada', 'paha_atas', 'paha_bawah', 'sayap']);
	});
	it('ayam cukup banyak → aman; ada potongan minus → minus', () => {
		expect(susun({ dada: 60, paha_atas: 40, paha_bawah: 40, sayap: 40 })[0]).toMatchObject({ teks: '20 pack', status: 'aman' });
		expect(susun({ dada: -1 })[0]).toMatchObject({ teks: '-1 Dada Ori', status: 'minus' });
		expect(susun({})[0]).toMatchObject({ teks: '0 pack', status: 'menipis' });
	});
	it('bahan berpack satu-bahan: pack + pcs lepas; ambang dalam pack', () => {
		const kem = (n: number) => susun({ kemasan: n }).find((x) => x.label === 'Kemasan Kecil')!;
		expect(kem(340)).toMatchObject({ teks: '3 pack + 40 pcs', status: 'aman' });
		expect(kem(150)).toMatchObject({ teks: '1 pack + 50 pcs', status: 'menipis' });
		expect(kem(40)).toMatchObject({ teks: '40 pcs', status: 'menipis' });
		expect(kem(-3)).toMatchObject({ teks: '-3 pcs', status: 'minus' });
	});
	it('kg tampil desimal (maks 2 angka), tanpa ambang → aman', () => {
		const r = susun({ beras: 12.5, tepung: 2.6004 });
		expect(r.find((x) => x.label === 'Beras')).toMatchObject({ teks: '12,5 kg', status: 'aman' });
		expect(r.find((x) => x.label === "Tepung D'Kriuk")).toMatchObject({ teks: '2,6 kg', status: 'aman' });
	});
	it('urut menurut urutan bahan; bahan nonaktif tidak tampil', () => {
		expect(susun({}).map((x) => x.label)).toEqual(['Ayam Ori', 'Beras', 'Kemasan Kecil', "Tepung D'Kriuk"]);
	});
});

describe('bantuan tampilan', () => {
	it('angkaStok & labelGrup', () => {
		expect(angkaStok(0.1 + 0.2)).toBe('0,3');
		expect(angkaStok(-0.0001)).toBe('0');
		expect(labelGrup('Pack Ayam Hot (1 kg)')).toBe('Ayam Hot');
		expect(labelGrup("Karung Tepung D'Kriuk (19,5 kg)")).toBe("Tepung D'Kriuk");
	});
	it('LABEL_JENIS lengkap & hitungRingkasan', () => {
		expect(LABEL_JENIS.jual_batal).toBe('Batal jual');
		expect(hitungRingkasan(susun({ dada: -1, kemasan: 40 }))).toEqual({ minus: 1, menipis: 1 });
	});
});
