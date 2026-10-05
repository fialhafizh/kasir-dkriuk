import { describe, expect, it } from 'vitest';
import { barisStruk, keAscii, type DataStruk } from './struk';

const data: DataStruk = {
	outlet: { merek: "D'Kriuk", nama: 'Bukit Lama', alamat: 'Jl. Sultan M. Mansyur No.1137, Bukit Lama, Palembang', telepon: '+62 821-8388-6369' },
	nomor: 'BL-261005-012',
	waktu: '2026-10-05T05:31:07Z',
	kasir: 'Kasir Bukit Lama',
	item: [
		{ nama: 'Dada Hot', harga: 11000, qty: 1 },
		{ nama: 'Nasi', harga: 5000, qty: 2 },
		{ nama: 'Saus Sambal', harga: 0, qty: 2 }
	],
	total: 21000,
	metode: 'cash',
	diterima: 50000,
	kembalian: 29000
};

// Baris rata kiri-kanan selebar 32 kolom.
const kk = (kiri: string, kanan: string) => kiri.padEnd(32 - kanan.length) + kanan;

describe('struk 58 mm', () => {
	const b = barisStruk(data);
	it('tidak ada baris lebih dari 32 karakter, semua ASCII', () => {
		for (const x of b) {
			expect(x.length).toBeLessThanOrEqual(32);
			expect(/^[\x20-\x7e]*$/.test(x)).toBe(true);
		}
	});
	it('kepala: nama outlet di tengah, alamat terbungkus, WA', () => {
		expect(b[0].trim()).toBe("D'KRIUK BUKIT LAMA");
		expect(b[0].length - b[0].trimStart().length).toBe(Math.floor((32 - "D'KRIUK BUKIT LAMA".length) / 2));
		expect(b.some((x) => x.includes('WA +62 821-8388-6369'))).toBe(true);
	});
	it('nomor & waktu WIB, item dengan jumlah × harga dan subtotal rata kanan', () => {
		expect(b).toContain(kk('BL-261005-012', '05/10/26 12:31:07'));
		expect(b).toContain('Dada Hot');
		expect(b).toContain(kk('  1 x 11.000', '11.000'));
		expect(b).toContain(kk('  2 x 5.000', '10.000'));
		expect(b).toContain(kk('  2 x 0', '0'));
	});
	it('total, metode, diterima, kembalian, ucapan', () => {
		expect(b).toContain(kk('TOTAL', '21.000'));
		expect(b).toContain(kk('Cash', '50.000'));
		expect(b).toContain(kk('Kembali', '29.000'));
		expect(b.some((x) => x.trim() === 'Terima kasih!')).toBe(true);
	});
	it('non-cash tanpa baris kembali; cetak ulang & batal ditandai', () => {
		const q = barisStruk({ ...data, metode: 'qris', diterima: null, kembalian: null, cetakUlang: true, batal: true });
		expect(q.some((x) => x.startsWith('Kembali'))).toBe(false);
		expect(q).toContain(kk('QRIS', '21.000'));
		expect(q.some((x) => x.includes('CETAK ULANG'))).toBe(true);
		expect(q.some((x) => x.includes('DIBATALKAN'))).toBe(true);
	});
	it('nama menu panjang dibungkus, bukan terpotong', () => {
		const p = barisStruk({ ...data, item: [{ nama: 'Paket Spesial Ayam Dada Hot Jumbo Sekali', harga: 1000, qty: 1 }] });
		expect(p).toContain('Paket Spesial Ayam Dada Hot');
		expect(p).toContain('Jumbo Sekali');
	});
});

describe('keAscii', () => {
	it('mengganti tanda baca Unicode dan membuang aksen', () => {
		expect(keAscii('D’Kriuk — Café · 1×')).toBe("D'Kriuk - Cafe - 1x");
	});
});

describe('review Tugas 5: tidak ada baris lebih dari 32 karakter', () => {
	it('kode outlet 4 huruf: nomor & waktu dipecah dua baris', () => {
		const b = barisStruk({ ...data, nomor: 'ABCD-261005-012' });
		for (const x of b) expect(x.length).toBeLessThanOrEqual(32);
		expect(b).toContain('ABCD-261005-012');
		expect(b).toContain('05/10/26 12:31:07'.padStart(32));
	});
	it('kata lebih dari 32 karakter dipotong per 32, tidak hilang', () => {
		const panjang = 'A'.repeat(40);
		const b = barisStruk({ ...data, item: [{ nama: panjang, harga: 1000, qty: 1 }] });
		expect(b).toContain('A'.repeat(32));
		expect(b).toContain('A'.repeat(8));
	});
	it('nomor WA panjang dibungkus', () => {
		const b = barisStruk({ ...data, outlet: { ...data.outlet, telepon: '+62 821-8388-6369 / +62 812-3456-7890' } });
		for (const x of b) expect(x.length).toBeLessThanOrEqual(32);
	});
});

describe('kode struk (Tahap 4)', () => {
	const dasar = {
		outlet: { merek: "D'Kriuk", nama: 'Bukit Lama', alamat: 'Jl. X', telepon: '0811' },
		nomor: 'BL-261008-014',
		waktu: '2026-10-08T05:00:00Z',
		kasir: 'Kasir BL',
		item: [{ nama: 'Dada Ori', harga: 11000, qty: 1 }],
		total: 11000,
		metode: 'qris' as const,
		diterima: null,
		kembalian: null
	};
	it('online: kode struk tercetak', () => {
		expect(barisStruk({ ...dasar, kodeStruk: 'K7Q2MX' }).join('\n')).toContain('Kode: K7Q2MX');
	});
	it('offline: nomor sementara & kode tercetak', () => {
		const t = barisStruk({ ...dasar, nomor: 'S1-012', nomorSementara: 'S1-012', kodeStruk: 'K7Q2MX' }).join('\n');
		expect(t).toContain('No. sementara');
		expect(t).toContain('K7Q2MX');
	});
});
