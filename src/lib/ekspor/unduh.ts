// Unduh lembar sebagai file .xlsx (penulis dimuat saat tombol ditekan).
import { tanggalWib } from '#lib/kasir/waktu.ts';
import type { Lembar } from './xlsx.ts';

export type { Lembar, Sel } from './xlsx.ts';

export async function unduhExcel(judul: string, lembar: Lembar[]): Promise<void> {
	const { buatXlsx, namaFile } = await import('./xlsx.ts');
	const blob = new Blob([buatXlsx(lembar) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = namaFile(judul, tanggalWib(new Date()));
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
