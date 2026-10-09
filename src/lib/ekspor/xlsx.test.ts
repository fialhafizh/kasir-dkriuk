import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buatXlsx, hurufKolom, namaFile, namaLembar } from './xlsx';

describe('penulis Excel', () => {
	it('huruf kolom', () => {
		expect([0, 25, 26, 27, 701, 702].map(hurufKolom)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
	});
	it('nama lembar sah & unik', () => {
		const t = new Set<string>();
		expect(namaLembar('Belanja: Okt/2026', t)).toBe('Belanja  Okt 2026');
		expect(namaLembar('Belanja: Okt/2026', t)).toBe('Belanja  Okt 2026 2');
		expect(namaLembar('x'.repeat(40), t)).toHaveLength(31);
		expect(namaLembar('', t)).toBe('Lembar');
		expect(namaLembar("'Omzet'", t)).toBe('Omzet');
		expect(namaLembar('History', t)).toBe('History 1');
	});
	it('zip berisi lembar, judul tebal, angka sebagai angka, teks di-escape', () => {
		const isi = buatXlsx([
			{ nama: 'Belanja', kolom: ['Barang', 'Jumlah'], baris: [['Ayam <Ori> & Hot', 70], ['Kulit', null]] },
			{ nama: 'Gaji', kolom: ['Nama'], baris: [['Dira']] }
		]);
		const z = unzipSync(isi);
		expect(Object.keys(z).sort()).toEqual(
			['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].sort()
		);
		const s1 = strFromU8(z['xl/worksheets/sheet1.xml']);
		expect(s1).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Barang</t></is></c>');
		expect(s1).toContain('<c r="B2"><v>70</v></c>');
		expect(s1).toContain('Ayam &lt;Ori&gt; &amp; Hot');
		expect(s1).not.toContain('r="B3"');
		expect(strFromU8(z['xl/workbook.xml'])).toContain('<sheet name="Gaji" sheetId="2" r:id="rId2"/>');
	});
	it('kasus tepi: tanpa lembar, NaN, teks sangat panjang', () => {
		expect(Object.keys(unzipSync(buatXlsx([]))).includes('xl/worksheets/sheet1.xml')).toBe(true);
		const s = strFromU8(unzipSync(buatXlsx([{ nama: 'a', kolom: ['x', 'y'], baris: [[Number.NaN, 'z'.repeat(40000)]] }]))['xl/worksheets/sheet1.xml']);
		expect(s).not.toContain('NaN');
		expect(s).not.toContain('z'.repeat(32768));
	});
	it('nama file', () => {
		expect(namaFile('Belanja/stokis: BL', '2026-10-14')).toBe('Belanja stokis BL 2026-10-14.xlsx');
	});
});
