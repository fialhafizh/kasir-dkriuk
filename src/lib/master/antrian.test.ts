import { describe, expect, it } from 'vitest';
import { antrianTerakhir, rantai } from './antrian';

const tunda = () => {
	let selesai!: () => void;
	const p = new Promise<void>((r) => (selesai = r));
	return { p, selesai };
};

describe('antrianTerakhir (satu kolom input)', () => {
	it('nilai baru saat masih menyimpan ditunda; yang terkirim terakhir = nilai terakhir', async () => {
		const terkirim: number[] = [];
		const jeda = [tunda(), tunda()];
		let ke = 0;
		const simpan = antrianTerakhir(async (n: number) => {
			terkirim.push(n);
			await jeda[ke++].p;
		});
		const a = simpan(1);
		const b = simpan(2);
		const c = simpan(3);
		jeda[0].selesai();
		await a;
		jeda[1].selesai();
		await Promise.all([b, c]);
		expect(terkirim).toEqual([1, 3]);
	});

	it('galat diteruskan ke pemanggil nilai itu', async () => {
		const simpan = antrianTerakhir(async () => {
			throw new Error('gagal');
		});
		await expect(simpan(1)).rejects.toThrow('gagal');
	});
});

describe('rantai (beberapa kolom satu baris data)', () => {
	it('tugas berjalan berurutan walau dipanggil bersamaan', async () => {
		const urutan: string[] = [];
		const jalan = rantai();
		const j1 = tunda();
		const a = jalan(async () => {
			urutan.push('a:mulai');
			await j1.p;
			urutan.push('a:selesai');
		});
		const b = jalan(async () => {
			urutan.push('b');
		});
		await Promise.resolve();
		expect(urutan).toEqual(['a:mulai']);
		j1.selesai();
		await Promise.all([a, b]);
		expect(urutan).toEqual(['a:mulai', 'a:selesai', 'b']);
	});

	it('tugas gagal tidak menghentikan tugas berikutnya', async () => {
		const jalan = rantai();
		const a = jalan(async () => {
			throw new Error('x');
		});
		const b = jalan(async () => 'ok');
		await expect(a).rejects.toThrow('x');
		await expect(b).resolves.toBe('ok');
	});
});
