// Penjaga repo publik: harga beli asli (hanya ada di data/*.local.json, tidak di-commit)
// tidak boleh muncul di file mana pun yang dilacak git — dokumen, tes, maupun kode.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const DATA = join(ROOT, 'data');
const lokal = existsSync(DATA) ? readdirSync(DATA).filter((f) => f.endsWith('.local.json')) : [];

function angkaDi(nilai: unknown, hasil: Set<number>) {
	if (typeof nilai === 'number' && nilai >= 1000) hasil.add(nilai);
	else if (nilai && typeof nilai === 'object') for (const v of Object.values(nilai)) angkaDi(v, hasil);
}

const titik = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

describe.skipIf(lokal.length === 0)('data bisnis tidak bocor ke file yang di-commit', () => {
	it('tidak ada harga beli asli di file yang dilacak git', () => {
		const angka = new Set<number>();
		for (const f of lokal) angkaDi(JSON.parse(readFileSync(join(DATA, f), 'utf8')), angka);
		const pola = [...angka].flatMap((n) => [
			new RegExp(String.raw`(?<![\w.,])${n}(?![\w])`),
			new RegExp(String.raw`(?<![\w.,])${titik(n).replace(/\./g, '\\.')}(?![\w.,]?\d)`)
		]);
		const berkas = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
			.split('\n')
			.filter((f) => f && !/\.(jpg|png|ico|woff2?)$/i.test(f) && f !== 'package-lock.json');
		const temuan: string[] = [];
		for (const f of berkas) {
			const isi = readFileSync(join(ROOT, f), 'utf8');
			isi.split('\n').forEach((baris, i) => {
				if (pola.some((p) => p.test(baris))) temuan.push(`${f}:${i + 1}`);
			});
		}
		expect(temuan).toEqual([]);
	});
});
