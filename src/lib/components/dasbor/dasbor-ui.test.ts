import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AngkaUtama from './AngkaUtama.svelte';
import GrafikBatang from './GrafikBatang.svelte';
import GrafikGaris from './GrafikGaris.svelte';
import GrafikLingkaran from './GrafikLingkaran.svelte';
import PetaPanas from './PetaPanas.svelte';
import TabelHasil from './TabelHasil.svelte';

const f = (n: number) => `Rp${n}`;

describe('grafik dasbor', () => {
	it('angka utama: naik/turun dari periode sebelumnya', () => {
		expect(render(AngkaUtama, { props: { nilai: 112, sebelum: 100, teks: 'Rp112' } }).body).toContain('↑ 12% dari periode sebelumnya');
		expect(render(AngkaUtama, { props: { nilai: 50, sebelum: 100, teks: 'Rp50' } }).body).toContain('↓ 50%');
		expect(render(AngkaUtama, { props: { nilai: 5, sebelum: 0, teks: 'Rp5' } }).body).toContain('Periode sebelumnya 0');
	});

	it('batang peringkat: label & nilai tiap baris', () => {
		const { body } = render(GrafikBatang, { props: { data: { kategori: ['Dada Ori', 'Nasi'], seri: [{ nama: 'Jumlah', nilai: [12, 3] }] }, format: f } });
		expect(body).toContain('Dada Ori');
		expect(body).toContain('Rp12');
		expect(body).toContain('width: 100%');
	});

	it('batang tegak bertumpuk & garis: SVG dengan keterangan warna', () => {
		const data = { kategori: ['01/10', '02/10'], seri: [{ nama: 'BL', nilai: [1, 2] }, { nama: 'TK', nilai: [3, 0] }] };
		const b = render(GrafikBatang, { props: { data, format: f, tegak: true } }).body;
		expect(b).toContain('<svg');
		expect(b).toContain('01/10 · BL: Rp1');
		expect(b).toContain('Keterangan warna');
		expect(render(GrafikGaris, { props: { data, format: f } }).body).toContain('<polyline');
	});

	it('batang beberapa ukuran: berdampingan dengan satuan masing-masing; minus merah', () => {
		const data = { kategori: ['Tunai'], seri: [{ nama: 'Omzet', nilai: [43210] }, { nama: 'Transaksi', nilai: [-3] }] };
		const fs = (i: number) => (n: number) => (i === 0 ? `Rp${n}` : `${n} trx`);
		const { body } = render(GrafikBatang, { props: { data, format: f, formatSeri: fs, banyakUkuran: true } });
		expect(body).toContain('Rp43210');
		expect(body).toContain('-3 trx');
		expect(body).toContain('text-danger');
		expect(body).not.toContain('<svg');
	});

	it('lingkaran: persentase', () => {
		const { body } = render(GrafikLingkaran, { props: { data: { kategori: ['Ori', 'Hot'], seri: [{ nama: 'x', nilai: [3, 1] }] }, format: f } });
		expect(body).toContain('(75%)');
		expect(body).toContain('(25%)');
	});

	it('peta panas: sel dengan judul', () => {
		const { body } = render(PetaPanas, { props: { data: { baris: ['Sen'], kolom: ['09.00'], nilai: [[4]], maks: 4 }, format: f } });
		expect(body).toContain('Sen 09.00: Rp4');
	});

	it('tabel dengan pembanding', () => {
		const hasil = { kolom: [{ kolom: 'outlet' }], ukuran: ['omzet'], terpotong: true, baris: [{ k: ['a'], l: ['Bukit Lama'], n: [150] }] };
		const pembanding = { ...hasil, terpotong: false, baris: [{ k: ['a'], l: ['Bukit Lama'], n: [100] }] };
		const { body } = render(TabelHasil, { props: { hasil, pembanding, format: (_u: string, n: number) => f(n) } });
		expect(body).toContain('Outlet');
		expect(body).toContain('Omzet');
		expect(body).toContain('↑50%');
		expect(body).toContain('Hanya sebagian baris');
	});
});
