// Penulis file Excel (.xlsx) kecil: beberapa lembar, baris judul tebal, angka tetap angka. Zip memakai fflate.
import { strToU8, zipSync } from 'fflate';

export type Sel = string | number | null | undefined;
export interface Lembar {
	nama: string;
	kolom: string[];
	baris: Sel[][];
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Karakter kontrol tidak sah di XML.
const bersih = (t: string) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** Nama kolom Excel: 0 → A, 25 → Z, 26 → AA. */
export function hurufKolom(i: number): string {
	let s = '';
	for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
	return s;
}

/** Nama lembar sah: ≤ 31 karakter, tanpa []:*?/\, unik. */
export function namaLembar(nama: string, terpakai: Set<string>): string {
	const dasar = (nama.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Lembar').slice(0, 31);
	let n = dasar;
	for (let i = 2; terpakai.has(n.toLowerCase()); i++) n = `${dasar.slice(0, 31 - String(i).length - 1)} ${i}`;
	terpakai.add(n.toLowerCase());
	return n;
}

function sel(ref: string, v: Sel, gaya = 0): string {
	const s = gaya ? ` s="${gaya}"` : '';
	if (v === null || v === undefined || v === '') return '';
	if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
	return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(bersih(String(v)))}</t></is></c>`;
}

function lembarXml(l: Lembar): string {
	const semua = [l.kolom, ...l.baris];
	const lebar = l.kolom.map((k, i) => Math.min(60, Math.max(8, ...semua.map((r) => String(r[i] ?? '').length + 2))));
	const kolom = `<cols>${lebar.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
	const baris = semua
		.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => sel(`${hurufKolom(ci)}${ri + 1}`, v, ri === 0 ? 1 : 0)).join('')}</row>`)
		.join('');
	return (
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
		'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
		`${kolom}<sheetData>${baris}</sheetData></worksheet>`
	);
}

/** Isi file .xlsx (bytes). */
export function buatXlsx(lembar: Lembar[]): Uint8Array {
	const terpakai = new Set<string>();
	const nama = lembar.map((l) => namaLembar(l.nama, terpakai));
	const berkas: Record<string, Uint8Array> = {
		'[Content_Types].xml': strToU8(
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
				'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
				'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
				'<Default Extension="xml" ContentType="application/xml"/>' +
				'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
				'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
				lembar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
				'</Types>'
		),
		'_rels/.rels': strToU8(
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
				'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
				'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
				'</Relationships>'
		),
		'xl/workbook.xml': strToU8(
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
				'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
				nama.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
				'</sheets></workbook>'
		),
		'xl/_rels/workbook.xml.rels': strToU8(
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
				'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
				lembar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
				`<Relationship Id="rId${lembar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
				'</Relationships>'
		),
		'xl/styles.xml': strToU8(
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
				'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
				'<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
				'<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
				'<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
				'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
				'<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
				'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
				'</styleSheet>'
		)
	};
	lembar.forEach((l, i) => (berkas[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(lembarXml(l))));
	return zipSync(berkas, { level: 6 });
}

/** Nama file aman: "Belanja 2026-10-14.xlsx". */
export function namaFile(judul: string, tanggal: string): string {
	return `${judul.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Data'} ${tanggal}.xlsx`;
}
