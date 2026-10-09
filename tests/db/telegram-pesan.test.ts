import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb } from './harness';
import { isian, rpc } from './harness-3b';
import { idMenu, idOutlet } from './harness-kasir';

let db: PGlite;
let adminId: string;
let kasirBL: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	await hubungkan();
});

const hubungkan = (mati: string[] = []) =>
	db.query(`update public.telegram_pengaturan set chat_id = -100123, topik = '{"struk":2,"harian":3,"peringatan":4,"kas":5}', jenis_mati = $1`, [mati]);
const jam = async (mundurMenit: number) => (await db.query<{ w: string }>(`select (now() - make_interval(mins => $1))::text as w`, [mundurMenit])).rows[0].w;
const nilai = async <T>(sql: string, params: unknown[] = []) => (await db.query<{ v: T }>(sql, params)).rows[0].v;
const BL = () => idOutlet(db, 'BL');
const pesan = async (jenis?: string) =>
	(
		await db.query<{ jenis: string; topik: string; teks: string }>(
			`select jenis, topik, teks from public.telegram_antrean where $1::text is null or jenis = $1 order by id`,
			[jenis ?? null]
		)
	).rows;

async function buka(mundur = 120, laciAwal = 100000) {
	const p = { id: crypto.randomUUID(), outlet_id: await BL(), modal: laciAwal, laci_awal: laciAwal, waktu: await jam(mundur) };
	return rpc<string>(db, kasirBL, 'public.buka_shift_offline($1::jsonb)', [JSON.stringify(p)]);
}
async function jual(shift: string, porsi = 2, mundur = 60, id = crypto.randomUUID()) {
	const p = {
		id,
		outlet_id: await BL(),
		shift_id: shift,
		metode: 'cash',
		diterima: porsi * 5000 + 1000,
		waktu: await jam(mundur),
		kode_struk: 'TGL001',
		item: [{ menu_id: await idMenu(db, 'nasi'), qty: porsi }]
	};
	await rpc(db, kasirBL, 'public.catat_penjualan_offline($1::jsonb)', [JSON.stringify(p)]);
	return p.id;
}
async function tutup(shift: string, uang: number) {
	const p = { id: crypto.randomUUID(), shift_id: shift, uang_fisik: uang, waktu: await jam(1) };
	return rpc(db, kasirBL, 'public.tutup_shift_offline($1::jsonb)', [JSON.stringify(p)]);
}
const kategori = (nama: string) => nilai<string>('select id as v from public.kategori_pengeluaran where nama = $1', [nama]);

describe('pesan Telegram dari transaksi', () => {
	it('belum terhubung: tidak ada pesan diantre', async () => {
		await db.query('update public.telegram_pengaturan set chat_id = null');
		await jual(await buka());
		expect(await pesan()).toHaveLength(0);
	});

	it('struk berisi item & total, sekali walau dikirim ulang; ke topik struk', async () => {
		const s = await buka();
		const id = await jual(s, 2);
		await jual(s, 2, 60, id);
		const st = await pesan('struk');
		expect(st).toHaveLength(1);
		expect(st[0].topik).toBe('struk');
		expect(st[0].teks).toContain('Bukit Lama');
		expect(st[0].teks).toMatch(/2× Nasi.*Rp10\.000/);
		expect(st[0].teks).toContain('Total Rp10.000');
		expect(st[0].teks).toContain('Tunai (bayar Rp11.000, kembali Rp1.000)');
		expect(st[0].teks).toContain('Dicatat offline');
	});

	it('jenis yang dimatikan tidak diantre', async () => {
		await hubungkan(['struk']);
		await jual(await buka());
		expect(await pesan('struk')).toHaveLength(0);
	});

	it('batal transaksi → peringatan dengan alasan', async () => {
		const id = await jual(await buka());
		await rpc(db, adminId, 'public.void_penjualan($1, $2)', [id, 'salah <input>']);
		const b = await pesan('batal');
		expect(b).toHaveLength(1);
		expect(b[0].topik).toBe('peringatan');
		expect(b[0].teks).toContain('salah &lt;input&gt;');
	});

	it('tutup toko → ringkasan; selisih ≠ 0 → peringatan selisih kas', async () => {
		const s = await buka(120, 100000);
		await jual(s, 2);
		await tutup(s, 105000);
		const t = await pesan('tutup');
		expect(t).toHaveLength(1);
		expect(t[0].topik).toBe('harian');
		expect(t[0].teks).toContain('Laci seharusnya Rp110.000');
		expect(t[0].teks).toContain('Tunai: Rp10.000 (1)');
		const sk = await pesan('selisih_kas');
		expect(sk).toHaveLength(1);
		expect(sk[0].teks).toContain('Kurang Rp5.000');
	});

	it('tutup pas: tanpa peringatan selisih', async () => {
		const s = await buka(120, 100000);
		await tutup(s, 100000);
		expect(await pesan('tutup')).toHaveLength(1);
		expect(await pesan('selisih_kas')).toHaveLength(0);
	});

	it('setoran dicatat & diterima kurang → kas + peringatan selisih setoran', async () => {
		await buka(120, 500000);
		const id = crypto.randomUUID();
		await rpc(db, kasirBL, 'public.catat_setoran_offline($1::jsonb)', [JSON.stringify({ id, outlet_id: await BL(), jumlah: 400000, waktu: await jam(30) })]);
		await rpc(db, adminId, 'public.terima_setoran($1, $2, $3)', [id, 390000, 'kurang selembar']);
		expect((await pesan('setoran')).map((x) => x.topik)).toEqual(['kas', 'kas']);
		const sel = await pesan('selisih_setoran');
		expect(sel).toHaveLength(1);
		expect(sel[0].teks).toContain('kurang Rp10.000');
	});

	it('pengeluaran laci ≥ batas masuk topik kas, di bawah batas tidak; kasbon selalu', async () => {
		await buka(120, 500000);
		const catat = async (jumlah: number) =>
			rpc(db, kasirBL, 'public.catat_pengeluaran_offline($1::jsonb)', [
				JSON.stringify({ id: crypto.randomUUID(), outlet_id: await BL(), kategori_id: await kategori('Gas'), jumlah, waktu: await jam(20) })
			]);
		await catat(20000);
		await catat(150000);
		const pg = await pesan('pengeluaran');
		expect(pg).toHaveLength(1);
		expect(pg[0].teks).toContain('Rp150.000');
		const kid = await rpc<string>(db, adminId, 'public.simpan_karyawan($1::jsonb)', [JSON.stringify({ outlet_id: await BL(), nama: 'Budi', upah_harian: 1000 })]);
		await rpc(db, kasirBL, 'public.catat_kasbon_offline($1::jsonb)', [
			JSON.stringify({ id: crypto.randomUUID(), outlet_id: await BL(), karyawan_id: kid, jumlah: 5000, waktu: await jam(10) })
		]);
		const kb = await pesan('kasbon');
		expect(kb).toHaveLength(1);
		expect(kb[0].teks).toMatch(/Budi.*Rp5\.000.*dari laci/);
	});

	it('stok minus: peringatan sekali per perubahan status', async () => {
		const s = await buka();
		await jual(s, 1);
		const st = await pesan('stok');
		expect(st).toHaveLength(1);
		expect(st[0].teks).toMatch(/🔴 Beras: <b>minus<\/b>/);
		await jual(s, 1);
		expect(await pesan('stok')).toHaveLength(1);
	});

	it('status stok sama dengan tampilan: pack ayam menipis dari pack-setara vs ambang', async () => {
		const rows = (
			await db.query<{ label: string; status: string; teks: string }>(`select label, status, teks from public._tg_status_stok($1)`, [await BL()])
		).rows;
		expect(rows.find((r) => r.label === 'Ayam Ori')).toMatchObject({ status: 'menipis', teks: '≈ 0 pack' });
		expect(rows.find((r) => r.label === 'Beras')).toMatchObject({ status: 'aman' });
	});

	it('stok awal & opname diajukan, data diabaikan kasir → peringatan', async () => {
		const sa = { id: crypto.randomUUID(), outlet_id: await BL(), item: await isian(db, [['ori_dada', 5]]), waktu: await jam(60) };
		await rpc(db, kasirBL, 'public.ajukan_stok_awal_offline($1::jsonb)', [JSON.stringify(sa)]);
		expect((await pesan('opname'))[0].teks).toContain('Stok awal menunggu persetujuan');
		await rpc(db, adminId, 'public.putuskan_stok_awal($1, $2, $3::jsonb, $4)', [sa.id, true, null, null]);
		const p = { id: crypto.randomUUID(), outlet_id: await BL(), item: await isian(db, [['ori_dada', 9]]), waktu: await jam(5) };
		await rpc(db, kasirBL, 'public.ajukan_opname_offline($1::jsonb)', [JSON.stringify(p)]);
		expect(await pesan('opname')).toHaveLength(2);
		expect((await pesan('opname'))[1].teks).toContain('Opname menunggu persetujuan');
		await rpc(db, kasirBL, 'public.lapor_kejadian_diabaikan($1::jsonb)', [
			JSON.stringify({ id: crypto.randomUUID(), outlet_id: await BL(), jenis: 'terima_transfer', data: {}, alasan_tolak: 'Ada perbedaan jumlah', alasan: 'sudah ditelepon' })
		]);
		const d = await pesan('diabaikan');
		expect(d[0].teks).toContain('Terima kiriman');
		expect(d[0].teks).toContain('Ada perbedaan jumlah');
	});

	it('lapor_ditolak: sekali per kejadian, hanya outlet sendiri', async () => {
		const id = crypto.randomUUID();
		const lapor = async (outlet: string) =>
			rpc(db, kasirBL, 'public.lapor_ditolak($1::jsonb)', [JSON.stringify({ id, outlet_id: outlet, jenis: 'terima_transfer', alasan: 'Ada perbedaan jumlah' })]);
		await lapor(await idOutlet(db, 'TK'));
		expect(await pesan('ditolak')).toHaveLength(0);
		await lapor(await BL());
		await lapor(await BL());
		const d = await pesan('ditolak');
		expect(d).toHaveLength(1);
		expect(d[0].teks).toContain('Terima kiriman');
	});

	it('notifikasi gagal tidak menggagalkan transaksi', async () => {
		await db.query('alter table public.telegram_antrean add constraint rusak check (false) not valid');
		const s = await buka();
		const id = await jual(s);
		expect(await nilai<number>('select count(*)::int as v from public.penjualan where id = $1', [id])).toBe(1);
		await tutup(s, 0);
		expect(await nilai<boolean>('select ditutup_at is not null as v from public.shift where id = $1', [s])).toBe(true);
	});
});
