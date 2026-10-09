import { describe, expect, it } from 'vitest';
import { BATAS_MS, JEDA_MS, kirimAntrean, type DepKirim, type PesanAntre } from '../../supabase/functions/_shared/telegram-kirim';
import type { HasilKirim } from '../../supabase/functions/_shared/telegram';
import { escHtml, samaKunci } from '../../supabase/functions/_shared/telegram';

function palsu(batch: PesanAntre[][], balas: (p: PesanAntre) => HasilKirim, msPerKirim = 0) {
	let jam = 0;
	const log: string[] = [];
	const d: DepKirim = {
		ambil: async () => batch.shift() ?? [],
		hasil: async (id, h) => void log.push(`hasil:${id}:${h.ok ? 'ok' : h.tundaDetik ? `tunda${h.tundaDetik}` : 'gagal'}`),
		topikHilang: async (t) => void log.push(`hilang:${t}`),
		selesai: async () => void log.push('selesai'),
		kirim: async (p) => {
			jam += msPerKirim;
			log.push(`kirim:${p.id}`);
			return balas(p);
		},
		tunggu: async (ms) => void (jam += ms),
		sekarang: () => jam
	};
	return { d, log };
}
const p = (id: number, topik = 'struk'): PesanAntre => ({ id, chat_id: -1, topik, thread_id: 2, teks: 'x' });

describe('kirimAntrean', () => {
	it('mengirim semua batch, jeda antar pesan, lalu melepas giliran', async () => {
		const { d, log } = palsu([[p(1), p(2)], [p(3)]], () => ({ ok: true }));
		expect(await kirimAntrean(d)).toEqual({ terkirim: 3, gagal: 0 });
		expect(log).toEqual(['kirim:1', 'hasil:1:ok', 'kirim:2', 'hasil:2:ok', 'kirim:3', 'hasil:3:ok', 'selesai']);
		expect(d.sekarang()).toBe(3 * JEDA_MS);
	});

	it('batas kecepatan: berhenti setelah pesan itu, giliran tetap dilepas', async () => {
		const { d, log } = palsu([[p(1), p(2)]], (x) => (x.id === 1 ? { ok: false, galat: '429', tundaDetik: 9 } : { ok: true }));
		expect(await kirimAntrean(d)).toEqual({ terkirim: 0, gagal: 1 });
		expect(log).toEqual(['kirim:1', 'hasil:1:tunda9', 'selesai']);
	});

	it('topik dihapus di grup → topik dilupakan agar pesan berikutnya ke General', async () => {
		const { d, log } = palsu([[p(1, 'kas')]], () => ({ ok: false, galat: '400: Bad Request: message thread not found' }));
		await kirimAntrean(d);
		expect(log).toContain('hilang:kas');
	});

	it('berhenti sebelum batas waktu (sisa pinjaman dikirim pemanggilan berikutnya)', async () => {
		const banyak = Array.from({ length: 50 }, (_, i) => p(i + 1));
		const { d } = palsu([banyak], () => ({ ok: true }), 2_000);
		const h = await kirimAntrean(d);
		expect(h.terkirim).toBeLessThan(50);
		expect(d.sekarang()).toBeLessThan(BATAS_MS + 2_000 + JEDA_MS);
	});

	it('galat saat ambil tetap melepas giliran', async () => {
		const { d, log } = palsu([], () => ({ ok: true }));
		d.ambil = async () => {
			throw new Error('db');
		};
		await expect(kirimAntrean(d)).rejects.toThrow('db');
		expect(log).toEqual(['selesai']);
	});
});

describe('kunci cron & HTML', () => {
	it('samaKunci: harus sama persis, kosong ditolak', () => {
		expect(samaKunci('abc', 'abc')).toBe(true);
		expect(samaKunci('abd', 'abc')).toBe(false);
		expect(samaKunci('ab', 'abc')).toBe(false);
		expect(samaKunci('', '')).toBe(false);
		expect(samaKunci(null, null)).toBe(false);
		expect(samaKunci('abc', null)).toBe(false);
	});
	it('escHtml', () => {
		expect(escHtml('Tutup toko & harian <b>')).toBe('Tutup toko &amp; harian &lt;b&gt;');
	});
});
