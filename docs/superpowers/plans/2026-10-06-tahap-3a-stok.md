# Tahap 3a — Stok Dasar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stok bahan per outlet bergerak otomatis dari penjualan (dan kembali persis saat void), admin mencatat barang masuk, kasir mengisi stok awal yang disetujui admin, stok tampil sebagai "5 pack + 3 Sayap Ori" dengan tanda Aman/Menipis/Minus; plus koreksi Tahap 2: jumlah keranjang bisa diketik.

**Architecture:** Buku besar `gerakan_stok` (hanya bertambah) + view `stok_outlet` (jumlah per outlet × bahan aktif). Pemotongan jual dan pengembalian void ditulis **trigger** di tabel penjualan (fungsi kasir 0009 tidak diubah): trigger per-statement pada `penjualan_item` menulis satu baris `jual` per bahan per transaksi; trigger pada `penjualan.void_at` membalik baris `jual` transaksi itu persis. Barang masuk & stok awal lewat fungsi `security definer` (0011). Klien hanya membaca (RLS); logika tampilan stok, isian stok awal, dan validasi barang masuk adalah modul murni yang diuji Vitest.

**Tech Stack:** SvelteKit 3 + Svelte 5, Tailwind 4, Supabase (Postgres RLS, trigger, fungsi SQL), Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-10-06-tahap-3a-stok-design.md` (turunan grand design §4). Wajib baca "Catatan wajib" di `docs/superpowers/plans/2026-10-04-00-roadmap.md` (Tahap 3: kolom stok ≥4 desimal, opname toleran 0,0833 kg; tulis gerakan di cabang non-replay; void membalik angka yang tersimpan).

## Global Constraints

- **SvelteKit 3**: impor `#lib/...` selalu dengan ekstensi `.ts`/`.svelte`; hash router (`href()`, `routePath(page.url)`); tanpa `+layout.ts`.
- Migrasi 0001–0009 sudah di server: **jangan diubah**; perubahan = migrasi baru `20261006000010_stok.sql`, `20261006000011_fungsi_stok.sql`.
- Tabel baru: FK `on delete restrict`; tidak ada hak tulis `anon`/`authenticated` (hanya lewat fungsi/trigger `security definer`, `search_path = ''`); `revoke all ... from anon, authenticated` lalu `grant select` seperlunya (Supabase memberi hak bawaan pada objek baru); `service_role` diberi hak eksplisit. Cek akses memakai `coalesce(...)` (pola 0009 — kasir nonaktif tidak boleh lolos).
- Pesan galat SQL berbahasa Indonesia, errcode `22023` (isian) atau `42501` (hak akses); setiap pesan masuk allowlist `pesanStok` dan dijaga tes yang membaca migrasi.
- Stok boleh minus; penjualan **tidak pernah** ditolak karena stok. Bahan `catat`/`analisis` tidak dipotong otomatis.
- Barang masuk & isinya (harga beli) **hanya admin** yang bisa membaca/menulis. Kasir membaca stok & gerakan outletnya sendiri.
- Kolom jumlah stok `numeric(14,4)`. Uang Rupiah bulat.
- UI Bahasa Indonesia, target sentuh ≥ 48 px, ≤1000 baris/file, satu tanggung jawab per file. Galat ditampilkan dekat sumbernya.
- Harga beli & data bisnis tidak masuk repo (`tests/rahasia.test.ts`).
- Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Penjualan dikirim ulang (id sama) atau void ditekan dua kali → stok terpotong/kembali **sekali**. Diuji Task 2 (`stok-jual.test.ts`).
2. Resep diubah admin setelah penjualan, lalu penjualan itu di-void → yang kembali adalah jumlah lama, bukan resep baru. Diuji Task 2.
3. Simpan barang masuk ditekan dua kali (id sama) → tercatat sekali. Diuji Task 3 (`stok-fungsi.test.ts`).
4. Stok awal disetujui setelah ada penjualan sebelum **dan** sesudah kasir menghitung → stok = hitungan − jual sesudahnya. Diuji Task 3.
5. Kasir membaca barang masuk (harga beli) atau stok outlet lain; kasir menyetujui stok awal / mencatat barang masuk → ditolak. Diuji Task 2 & 3.
6. Kotak jumlah keranjang dikosongkan / diisi 0 / huruf → baris **tidak** terhapus, kembali ke angka lama. Diuji Task 1.

---

## File Structure

```
supabase/migrations/20261006000010_stok.sql          # enum, gerakan_stok, barang_masuk(+item), stok_awal(+item), view stok_outlet, RLS, trigger jual/void
supabase/migrations/20261006000011_fungsi_stok.sql   # catat/batal barang masuk, ajukan/putuskan stok awal
tests/db/harness-stok.ts                             # idBahan, idSatuan, stokBahan
tests/db/stok-skema.test.ts                          # RLS, hak, view, constraint
tests/db/stok-jual.test.ts                           # trigger potong & kembalikan
tests/db/stok-fungsi.test.ts                         # barang masuk & stok awal
src/lib/kasir/keranjang.ts (+test)                   # (ubah) parseJumlah
src/lib/components/kasir/Keranjang.svelte            # (ubah) kotak jumlah bisa diketik
src/lib/stok/
  types.ts                                           # JenisGerakan, StatusStok, BarisStok, Gerakan, BarangMasuk, StokAwal, KirimBarangMasuk
  tampil.ts (+test)                                  # susunStok, angkaStok, labelGrup, LABEL_JENIS, hitungRingkasan
  isian.ts (+test)                                   # bentukIsian, parseHitung, kumpulkanIsian, teksDari
  masuk.ts (+test)                                   # periksaBarangMasuk, hargaAwal, hargaOutlet
  pesan.ts (+test)                                   # pesanStok
  api.ts                                             # muat/tulis stok via Supabase
src/lib/components/stok/
  DaftarStok.svelte, RiwayatGerakan.svelte, FormBarangMasuk.svelte, FormStokAwal.svelte,
  RingkasanStok.svelte, PitaMinus.svelte, stok-ui.test.ts
src/routes/admin/stok/+page.svelte                   # stok per outlet + riwayat
src/routes/admin/stok/masuk/+page.svelte             # barang masuk
src/routes/admin/stok/awal/+page.svelte              # tinjau stok awal
src/routes/kasir/stok/+page.svelte                   # stok outlet sendiri
src/routes/kasir/stok/awal/+page.svelte              # isi stok awal
scripts/uji-stok.ts                                  # E2E server
docs/uji/tahap-3a-stok-owner.md                      # daftar uji owner
```

---

### Task 1: Koreksi Tahap 2 — jumlah keranjang bisa diketik

**Files:**
- Modify: `src/lib/kasir/keranjang.ts`, `src/lib/components/kasir/Keranjang.svelte`
- Test: `src/lib/kasir/keranjang.test.ts`, `src/lib/components/kasir/kasir-ui.test.ts`

**Interfaces:**
- Produces: `parseJumlah(teks: string): number | null` — bulat 1..999 (lebih dari 999 → 999); kosong/0/bukan angka → `null`.

- [ ] **Step 1: Tes (gagal dulu)**

Tambahkan ke akhir `src/lib/kasir/keranjang.test.ts`:
```ts
import { parseJumlah } from './keranjang';

describe('parseJumlah (kotak jumlah keranjang)', () => {
	it.each([
		['150', 150],
		[' 7 ', 7],
		['5000', 999],
		['1', 1]
	])('"%s" → %s', (t, n) => expect(parseJumlah(t)).toBe(n));
	it.each(['', '0', '00', '1,5', '-3', 'abc', '2.000'])('"%s" → null (baris tidak boleh terhapus)', (t) =>
		expect(parseJumlah(t)).toBeNull()
	);
});
```

Tambahkan ke akhir `src/lib/components/kasir/kasir-ui.test.ts`:
```ts
import Keranjang from './Keranjang.svelte';

describe('Keranjang', () => {
	it('jumlah tampil di kotak yang bisa diketik (keyboard angka)', () => {
		const { body } = render(Keranjang, {
			props: { isi: [{ menu_id: 'n', nama: 'Nasi', harga: 5000, qty: 150 }], onubah: () => {}, onkosongkan: () => {} }
		});
		expect(body).toMatch(/<input[^>]*aria-label="Jumlah Nasi"/);
		expect(body).toMatch(/<input[^>]*inputmode="numeric"/);
		expect(body).toMatch(/<input[^>]*value="150"/);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/kasir/keranjang.test.ts src/lib/components/kasir/kasir-ui.test.ts`
Expected: FAIL — `parseJumlah` tidak diekspor; Keranjang belum punya `<input aria-label="Jumlah Nasi">`.

- [ ] **Step 3: Implementasi**

Tambahkan ke `src/lib/kasir/keranjang.ts` (setelah `ubahQty`):
```ts
/** Teks kotak jumlah → bulat 1..999 (lebih dari 999 dibatasi 999). Kosong, 0, atau bukan angka → null. */
export function parseJumlah(teks: string): number | null {
	const t = teks.trim();
	if (!/^\d+$/.test(t)) return null;
	const n = Number(t);
	return n >= 1 ? Math.min(n, MAKS) : null;
}
```

Di `src/lib/components/kasir/Keranjang.svelte`: ubah impor menjadi
```ts
	import { jumlahItem, parseJumlah, totalKeranjang } from '#lib/kasir/keranjang.ts';
```
lalu ganti baris
```svelte
					<span class="tabular w-8 text-center font-bold" aria-label="Jumlah {b.nama}">{b.qty}</span>
```
dengan
```svelte
					<!-- Bisa diketik langsung (mis. 150 nasi box); isian tidak sah dikembalikan ke angka lama, baris tidak terhapus. -->
					<input
						type="text"
						inputmode="numeric"
						enterkeyhint="done"
						autocomplete="off"
						value={b.qty}
						aria-label="Jumlah {b.nama}"
						class="tabular h-12 w-14 rounded-xl border border-line-strong bg-surface text-center font-bold focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none"
						onfocus={(e) => e.currentTarget.select()}
						onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
						onchange={(e) => {
							const n = parseJumlah(e.currentTarget.value);
							e.currentTarget.value = String(n ?? b.qty);
							if (n !== null) onubah(b.menu_id, n);
						}}
					/>
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src/lib/kasir src/lib/components/kasir && npm run check`
Expected: PASS; check 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kasir/keranjang.ts src/lib/kasir/keranjang.test.ts src/lib/components/kasir/Keranjang.svelte src/lib/components/kasir/kasir-ui.test.ts
git commit -m "feat(kasir): jumlah keranjang bisa diketik langsung (mis. 150 nasi box)"
```

---

### Task 2: Skema stok, view, RLS, trigger potong & kembalikan

**Files:**
- Create: `supabase/migrations/20261006000010_stok.sql`, `tests/db/harness-stok.ts`
- Test: `tests/db/stok-skema.test.ts`, `tests/db/stok-jual.test.ts`

**Interfaces:**
- Consumes: `public.penjualan`, `public.penjualan_item`, `public.resep`, `public.bahan`, `public.is_admin()`, `public.my_outlet_id()` (0001–0009); harness `freshDb`, `buatUser`, `sebagai`, `sebagaiAnon`, `idOutlet`, `idMenu`, `shiftLangsung`.
- Produces: tabel `gerakan_stok(id, outlet_id, bahan_id, qty, jenis, waktu, dicatat_at, oleh, penjualan_id, barang_masuk_id, stok_awal_id)`, `barang_masuk(id, outlet_id, tanggal, waktu, total, catatan, dicatat_oleh, dicatat_at, batal_at, batal_oleh, batal_alasan)`, `barang_masuk_item(barang_masuk_id, satuan_beli_id, nama, qty, harga, subtotal)`, `stok_awal(id, outlet_id, status, dihitung_at, diajukan_oleh, diputus_at, diputus_oleh, catatan)`, `stok_awal_item(stok_awal_id, bahan_id, qty_hitung)`; enum `jenis_gerakan('awal','masuk','masuk_batal','jual','jual_batal')`, `status_stok_awal('diajukan','disetujui','ditolak')`; view `stok_outlet(outlet_id, bahan_id, qty)`. Harness: `idBahan(db, kode)`, `idSatuan(db, kode)`, `stokBahan(db, outletKode, bahanKode): Promise<number>`.

- [ ] **Step 1: Harness**

`tests/db/harness-stok.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';

export async function idBahan(db: PGlite, kode: string): Promise<string> {
	return (await db.query<{ id: string }>('select id from public.bahan where kode = $1', [kode])).rows[0].id;
}
export async function idSatuan(db: PGlite, kode: string): Promise<string> {
	return (await db.query<{ id: string }>('select id from public.satuan_beli where kode = $1', [kode])).rows[0].id;
}
/** Stok satu bahan di satu outlet langsung dari buku besar (superuser, tanpa RLS). */
export async function stokBahan(db: PGlite, outletKode: string, bahanKode: string): Promise<number> {
	const r = await db.query<{ qty: string | null }>(
		`select sum(g.qty) as qty from public.gerakan_stok g
		 join public.outlets o on o.id = g.outlet_id join public.bahan b on b.id = g.bahan_id
		 where o.kode = $1 and b.kode = $2`,
		[outletKode, bahanKode]
	);
	return Number(r.rows[0].qty ?? 0);
}
```

- [ ] **Step 2: Tes trigger (gagal dulu)**

`tests/db/stok-jual.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai } from './harness';
import { idMenu, idOutlet, shiftLangsung } from './harness-kasir';
import { stokBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let shiftBL: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	shiftBL = await shiftLangsung(db, 'BL', kasirBL);
});

async function rpc<T>(oleh: string, sql: string, params: unknown[]): Promise<T> {
	return sebagai(db, oleh, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0].r);
}
async function jual(item: [string, number][], id = crypto.randomUUID()): Promise<string> {
	const p = {
		id,
		outlet_id: await idOutlet(db, 'BL'),
		metode: 'qris',
		item: await Promise.all(item.map(async ([kode, qty]) => ({ menu_id: await idMenu(db, kode), qty })))
	};
	await rpc(kasirBL, 'public.catat_penjualan($1::jsonb)', [JSON.stringify(p)]);
	return id;
}
const batal = (oleh: string, id: string) => rpc(oleh, 'public.void_penjualan($1, $2)', [id, 'salah input']);
const stok = (kode: string) => stokBahan(db, 'BL', kode);

describe('potong stok saat jual', () => {
	it('memotong bahan sesuai resep: ayam, kulit + cup, nasi 0,1 kg + kertas, pelengkap', async () => {
		await jual([
			['ori_dada', 2],
			['kulit', 1],
			['nasi', 3],
			['kemasan_kecil', 1]
		]);
		expect(await stok('ori_dada')).toBe(-2);
		expect(await stok('kulit')).toBe(-1);
		expect(await stok('cup_kulit')).toBe(-1);
		expect(await stok('beras')).toBeCloseTo(-0.3, 4);
		expect(await stok('kertas_nasi')).toBe(-3);
		expect(await stok('kemasan_kecil')).toBe(-1);
		expect(await stok('hot_dada')).toBe(0);
	});

	it('satu baris jual per bahan per transaksi; waktu = waktu penjualan; oleh = kasir; outlet benar', async () => {
		const id = await jual([
			['ori_dada', 2],
			['kulit', 1]
		]);
		const { rows } = await db.query<{ n: number; sama_waktu: boolean; oleh: string; outlet: string }>(
			`select count(*)::int as n, bool_and(g.waktu = p.waktu) as sama_waktu, min(g.oleh::text) as oleh, min(o.kode) as outlet
			 from public.gerakan_stok g join public.penjualan p on p.id = g.penjualan_id join public.outlets o on o.id = g.outlet_id
			 where g.penjualan_id = $1 and g.jenis = 'jual'`,
			[id]
		);
		expect(rows[0]).toEqual({ n: 3, sama_waktu: true, oleh: kasirBL, outlet: 'BL' });
	});

	it('kiriman ulang dengan id sama tidak memotong dua kali', async () => {
		const id = crypto.randomUUID();
		await jual([['ori_dada', 1]], id);
		await jual([['ori_dada', 1]], id);
		expect(await stok('ori_dada')).toBe(-1);
	});

	it('bahan catat/analisis tidak pernah dipotong', async () => {
		await jual([
			['ori_dada', 1],
			['nasi', 1]
		]);
		expect(await stok('plastik_merah')).toBe(0);
		expect(await stok('tepung_dkriuk')).toBe(0);
		expect(await stok('minyak')).toBe(0);
	});
});

describe('kembalikan stok saat void', () => {
	it('void mengembalikan persis jumlah yang dipotong walau resep sudah diubah', async () => {
		const id = await jual([['nasi', 1]]);
		await db.query(
			`update public.resep set qty = 0.2
			 where menu_id = (select id from public.menu where kode = 'nasi') and bahan_id = (select id from public.bahan where kode = 'beras')`
		);
		await batal(kasirBL, id);
		expect(await stok('beras')).toBe(0);
		const { rows } = await db.query<{ qty: string }>(`select qty from public.gerakan_stok where penjualan_id = $1 and jenis = 'jual_batal' and bahan_id = (select id from public.bahan where kode = 'beras')`, [id]);
		expect(Number(rows[0].qty)).toBeCloseTo(0.1, 4);
	});

	it('void kedua ditolak dan stok tidak berubah lagi', async () => {
		const id = await jual([['ori_dada', 2]]);
		await batal(kasirBL, id);
		await expect(batal(kasirBL, id)).rejects.toThrow(/sudah dibatalkan/);
		expect(await stok('ori_dada')).toBe(0);
	});

	it('void admin setelah toko ditutup juga mengembalikan stok', async () => {
		const id = await jual([['ori_dada', 1]]);
		await rpc(kasirBL, 'public.tutup_shift($1, $2, $3)', [shiftBL, 0, null]);
		await batal(adminId, id);
		expect(await stok('ori_dada')).toBe(0);
	});

	it('penjualan tanpa baris jual (sebelum Tahap 3 terpasang) → void tidak menulis gerakan', async () => {
		const id = await jual([['ori_dada', 1]]);
		await db.query('delete from public.gerakan_stok where penjualan_id = $1', [id]);
		await batal(kasirBL, id);
		const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.gerakan_stok where penjualan_id = $1', [id]);
		expect(rows[0].n).toBe(0);
	});
});
```

- [ ] **Step 3: Tes skema & RLS (gagal dulu)**

`tests/db/stok-skema.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai, sebagaiAnon } from './harness';
import { idMenu, idOutlet, shiftLangsung } from './harness-kasir';
import { idBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
	await shiftLangsung(db, 'BL', kasirBL);
	await shiftLangsung(db, 'TK', kasirTK);
});

async function jual(oleh: string, outletKode: string, menuKode: string, qty = 1): Promise<void> {
	const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, outletKode), metode: 'qris', item: [{ menu_id: await idMenu(db, menuKode), qty }] };
	await sebagai(db, oleh, () => db.query('select public.catat_penjualan($1::jsonb)', [JSON.stringify(p)]));
}
const sebagaiQuery = <T>(oleh: string, sql: string, params: unknown[] = []) =>
	sebagai(db, oleh, async () => (await db.query<T>(sql, params)).rows);

const TABEL = ['gerakan_stok', 'barang_masuk', 'barang_masuk_item', 'stok_awal', 'stok_awal_item', 'stok_outlet'];

describe('hak akses stok', () => {
	it('pengguna login (admin sekalipun) tidak bisa menulis buku besar langsung', async () => {
		const bl = await idOutlet(db, 'BL');
		const dada = await idBahan(db, 'ori_dada');
		await expect(
			sebagai(db, adminId, () =>
				db.query(`insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu) values ($1, $2, 1, 'awal', now())`, [bl, dada])
			)
		).rejects.toThrow(/permission denied/);
	});

	it('kasir hanya membaca gerakan outletnya sendiri', async () => {
		await jual(kasirBL, 'BL', 'ori_dada');
		await jual(kasirTK, 'TK', 'ori_dada');
		const rows = await sebagaiQuery<{ outlet_id: string }>(kasirBL, 'select outlet_id from public.gerakan_stok');
		expect(rows.length).toBeGreaterThan(0);
		expect(new Set(rows.map((r) => r.outlet_id))).toEqual(new Set([await idOutlet(db, 'BL')]));
	});

	it('stok_outlet: kasir melihat outletnya saja, admin ketiga outlet', async () => {
		await jual(kasirBL, 'BL', 'ori_dada', 2);
		const bl = await idOutlet(db, 'BL');
		const dada = await idBahan(db, 'ori_dada');
		const k = await sebagaiQuery<{ outlet_id: string; bahan_id: string; qty: string }>(kasirBL, 'select outlet_id, bahan_id, qty from public.stok_outlet');
		expect(new Set(k.map((r) => r.outlet_id))).toEqual(new Set([bl]));
		expect(Number(k.find((r) => r.bahan_id === dada)!.qty)).toBe(-2);
		const a = await sebagaiQuery<{ outlet_id: string }>(adminId, 'select distinct outlet_id from public.stok_outlet');
		expect(a).toHaveLength(3);
	});

	it('stok_outlet berisi 0 untuk bahan aktif tanpa gerakan dan menyembunyikan bahan nonaktif', async () => {
		await db.query(`update public.bahan set aktif = false where kode = 'plastik_merah'`);
		const aktif = (await db.query<{ n: number }>('select count(*)::int as n from public.bahan where aktif')).rows[0].n;
		const rows = await sebagaiQuery<{ qty: string }>(kasirBL, 'select qty from public.stok_outlet');
		expect(rows).toHaveLength(aktif);
		expect(rows.every((r) => Number(r.qty) === 0)).toBe(true);
	});

	it('kasir tidak bisa membaca barang masuk (berisi harga beli); admin bisa', async () => {
		const bl = await idOutlet(db, 'BL');
		await db.query(`insert into public.barang_masuk (id, outlet_id, tanggal, waktu, total) values (gen_random_uuid(), $1, current_date, now(), 1000)`, [bl]);
		expect(await sebagaiQuery(kasirBL, 'select id from public.barang_masuk')).toHaveLength(0);
		expect(await sebagaiQuery(adminId, 'select id from public.barang_masuk')).toHaveLength(1);
	});

	it.each(TABEL)('anon tidak bisa membaca %s', async (t) => {
		await expect(sebagaiAnon(db, () => db.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/);
	});
});

describe('aturan buku besar', () => {
	it('baris jual tanpa penjualan ditolak; jumlah 0 ditolak', async () => {
		const bl = await idOutlet(db, 'BL');
		const dada = await idBahan(db, 'ori_dada');
		await expect(
			db.query(`insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu) values ($1, $2, -1, 'jual', now())`, [bl, dada])
		).rejects.toThrow(/gerakan_sumber_jual/);
		await jual(kasirBL, 'BL', 'ori_dada');
		const pid = (await db.query<{ id: string }>('select id from public.penjualan limit 1')).rows[0].id;
		await expect(
			db.query(`insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, penjualan_id) values ($1, $2, 0, 'jual', now(), $3)`, [bl, dada, pid])
		).rejects.toThrow(/gerakan_stok_qty_check/);
	});
});
```

- [ ] **Step 4: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/stok-jual.test.ts tests/db/stok-skema.test.ts`
Expected: FAIL — `relation "public.gerakan_stok" does not exist`.

- [ ] **Step 5: Migrasi**

`supabase/migrations/20261006000010_stok.sql`:
```sql
-- Stok (Tahap 3a): buku besar gerakan stok, barang masuk, stok awal.
-- Pengguna login hanya MEMBACA; penulisan lewat trigger/fungsi security definer.

create type public.jenis_gerakan as enum ('awal', 'masuk', 'masuk_batal', 'jual', 'jual_batal');
create type public.status_stok_awal as enum ('diajukan', 'disetujui', 'ditolak');

create table public.barang_masuk (
  id uuid primary key,
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  tanggal date not null,
  waktu timestamptz not null,
  total bigint not null check (total >= 0),
  catatan text check (catatan is null or length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles (id) on delete restrict,
  dicatat_at timestamptz not null default now(),
  batal_at timestamptz,
  batal_oleh uuid references public.profiles (id) on delete restrict,
  batal_alasan text,
  constraint barang_masuk_batal_lengkap check ((batal_at is null) = (batal_alasan is null))
);
create index barang_masuk_outlet_waktu on public.barang_masuk (outlet_id, waktu desc);

create table public.barang_masuk_item (
  barang_masuk_id uuid not null references public.barang_masuk (id) on delete restrict,
  satuan_beli_id uuid not null references public.satuan_beli (id) on delete restrict,
  nama text not null,
  qty numeric(10, 3) not null check (qty > 0 and qty <= 100000),
  harga integer not null check (harga >= 0 and harga <= 100000000),
  subtotal bigint generated always as (round(qty * harga)::bigint) stored,
  primary key (barang_masuk_id, satuan_beli_id)
);

create table public.stok_awal (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  status public.status_stok_awal not null default 'diajukan',
  dihitung_at timestamptz not null default now(),
  diajukan_oleh uuid references public.profiles (id) on delete restrict,
  diputus_at timestamptz,
  diputus_oleh uuid references public.profiles (id) on delete restrict,
  catatan text check (catatan is null or length(catatan) <= 200),
  constraint stok_awal_diputus check ((status = 'diajukan') = (diputus_at is null))
);
-- Satu ajuan menunggu dan satu yang disetujui per outlet.
create unique index stok_awal_satu_diajukan on public.stok_awal (outlet_id) where status = 'diajukan';
create unique index stok_awal_satu_disetujui on public.stok_awal (outlet_id) where status = 'disetujui';

create table public.stok_awal_item (
  stok_awal_id uuid not null references public.stok_awal (id) on delete restrict,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty_hitung numeric(14, 4) not null check (qty_hitung >= 0 and qty_hitung <= 1000000),
  primary key (stok_awal_id, bahan_id)
);

create table public.gerakan_stok (
  id bigint generated always as identity primary key,
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty numeric(14, 4) not null check (qty <> 0),
  jenis public.jenis_gerakan not null,
  waktu timestamptz not null,
  dicatat_at timestamptz not null default now(),
  oleh uuid references public.profiles (id) on delete restrict,
  penjualan_id uuid references public.penjualan (id) on delete restrict,
  barang_masuk_id uuid references public.barang_masuk (id) on delete restrict,
  stok_awal_id uuid references public.stok_awal (id) on delete restrict,
  -- Setiap baris dapat ditelusuri ke sumbernya (3b menambah jenis & sumber baru).
  constraint gerakan_sumber_jual check ((jenis in ('jual', 'jual_batal')) = (penjualan_id is not null)),
  constraint gerakan_sumber_masuk check ((jenis in ('masuk', 'masuk_batal')) = (barang_masuk_id is not null)),
  constraint gerakan_sumber_awal check ((jenis = 'awal') = (stok_awal_id is not null))
);
create index gerakan_outlet_bahan_waktu on public.gerakan_stok (outlet_id, bahan_id, waktu);
create index gerakan_penjualan on public.gerakan_stok (penjualan_id) where penjualan_id is not null;
create index gerakan_barang_masuk on public.gerakan_stok (barang_masuk_id) where barang_masuk_id is not null;

-- Stok saat ini per outlet × bahan aktif (0 bila belum ada gerakan). security_invoker: RLS pemanggil berlaku.
create view public.stok_outlet with (security_invoker = true) as
select o.id as outlet_id, b.id as bahan_id, coalesce(sum(g.qty), 0)::numeric(14, 4) as qty
from public.outlets o
cross join public.bahan b
left join public.gerakan_stok g on g.outlet_id = o.id and g.bahan_id = b.id
where b.aktif and ((select public.is_admin()) or o.id = (select public.my_outlet_id()))
group by o.id, b.id;

-- Potong stok: satu baris per bahan per transaksi, dari resep saat itu (snapshot di buku besar).
create function public._gerakan_jual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, penjualan_id)
  select p.outlet_id, r.bahan_id, -sum(n.qty * r.qty), 'jual', p.waktu, p.kasir_id, p.id
  from baru n
  join public.penjualan p on p.id = n.penjualan_id
  join public.resep r on r.menu_id = n.menu_id
  join public.bahan b on b.id = r.bahan_id and b.mode = 'otomatis'
  group by p.outlet_id, r.bahan_id, p.waktu, p.kasir_id, p.id;
  return null;
end
$$;
create trigger penjualan_item_potong_stok after insert on public.penjualan_item
  referencing new table as baru for each statement execute function public._gerakan_jual();

-- Void: kembalikan PERSIS baris jual transaksi itu (bukan resep terkini).
create function public._gerakan_batal_jual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, penjualan_id)
  select g.outlet_id, g.bahan_id, -sum(g.qty), 'jual_batal', new.void_at, new.void_oleh, new.id
  from public.gerakan_stok g
  where g.penjualan_id = new.id and g.jenis = 'jual'
  group by g.outlet_id, g.bahan_id;
  return null;
end
$$;
create trigger penjualan_void_kembalikan_stok after update of void_at on public.penjualan
  for each row when (old.void_at is null and new.void_at is not null)
  execute function public._gerakan_batal_jual();

revoke execute on function public._gerakan_jual() from public, anon, authenticated;
revoke execute on function public._gerakan_batal_jual() from public, anon, authenticated;

alter table public.gerakan_stok enable row level security;
alter table public.barang_masuk enable row level security;
alter table public.barang_masuk_item enable row level security;
alter table public.stok_awal enable row level security;
alter table public.stok_awal_item enable row level security;

revoke all on public.gerakan_stok, public.barang_masuk, public.barang_masuk_item, public.stok_awal, public.stok_awal_item, public.stok_outlet
  from anon, authenticated;
revoke all on sequence public.gerakan_stok_id_seq from anon, authenticated;
grant select on public.gerakan_stok, public.barang_masuk, public.barang_masuk_item, public.stok_awal, public.stok_awal_item, public.stok_outlet
  to authenticated;
grant all on public.gerakan_stok, public.barang_masuk, public.barang_masuk_item, public.stok_awal, public.stok_awal_item to service_role;
grant select on public.stok_outlet to service_role;
grant usage, select on sequence public.gerakan_stok_id_seq to service_role;

create policy gerakan_stok_baca on public.gerakan_stok for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy stok_awal_baca on public.stok_awal for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy stok_awal_item_baca on public.stok_awal_item for select to authenticated
  using (exists (select 1 from public.stok_awal s where s.id = stok_awal_id));
-- Barang masuk berisi harga beli: hanya admin.
create policy barang_masuk_baca on public.barang_masuk for select to authenticated using ((select public.is_admin()));
create policy barang_masuk_item_baca on public.barang_masuk_item for select to authenticated using ((select public.is_admin()));
```

- [ ] **Step 6: Jalankan, pastikan lulus (dan tes lama tetap hijau)**

Run: `npx vitest run tests/db`
Expected: PASS semua (termasuk `penjualan.test.ts` lama — trigger tidak mengubah hasil fungsi kasir).

- [ ] **Step 7: Mutasi cepat (bukti tes menangkap)**

Ubah sementara `-sum(g.qty)` di `_gerakan_batal_jual` menjadi `-sum(g.qty) * 2`, jalankan `npx vitest run tests/db/stok-jual.test.ts` → harus FAIL; kembalikan. Ubah sementara `when (old.void_at is null and new.void_at is not null)` menjadi `when (new.void_at is not null)` — tes "void kedua" tetap lulus karena fungsi menolak lebih dulu (catat di ledger, bukan bug). Kembalikan.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261006000010_stok.sql tests/db/harness-stok.ts tests/db/stok-jual.test.ts tests/db/stok-skema.test.ts
git commit -m "feat(stok): buku besar gerakan stok, potong otomatis saat jual & kembali persis saat void"
```

---

### Task 3: Fungsi barang masuk & stok awal

**Files:**
- Create: `supabase/migrations/20261006000011_fungsi_stok.sql`
- Test: `tests/db/stok-fungsi.test.ts`

**Interfaces:**
- Consumes: tabel Task 2; `public._cek_akses_outlet(uuid)`, `public.tanggal_wib(timestamptz)` (0008/0009).
- Produces (RPC, `authenticated`):
  - `catat_barang_masuk(p jsonb) returns uuid` — `p = { id: uuid, outlet_id: uuid, tanggal: 'YYYY-MM-DD', catatan?: string, item: [{ satuan_beli_id, qty, harga }] }`; admin saja; idempoten per `id`.
  - `batal_barang_masuk(p_id uuid, p_alasan text) returns void` — admin saja.
  - `ajukan_stok_awal(p_outlet uuid, p_item jsonb) returns uuid` — `p_item = [{ bahan_id, qty }]`; kasir outlet itu atau admin.
  - `putuskan_stok_awal(p_id uuid, p_setuju boolean, p_item jsonb, p_catatan text) returns void` — admin saja; `p_item` null = pakai isian kasir.

- [ ] **Step 1: Tes (gagal dulu)**

`tests/db/stok-fungsi.test.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { buatUser, freshDb, sebagai } from './harness';
import { idMenu, idOutlet, shiftLangsung } from './harness-kasir';
import { idBahan, idSatuan, stokBahan } from './harness-stok';

let db: PGlite;
let adminId: string;
let kasirBL: string;
let kasirTK: string;

beforeEach(async () => {
	db = await freshDb();
	adminId = await buatUser(db, { username: 'admin', role: 'admin' });
	kasirBL = await buatUser(db, { username: 'kasir.bukitlama', role: 'kasir', outlet_kode: 'BL' });
	kasirTK = await buatUser(db, { username: 'kasir.talangkerangga', role: 'kasir', outlet_kode: 'TK' });
});

async function rpc<T>(oleh: string, sql: string, params: unknown[]): Promise<T> {
	return sebagai(db, oleh, async () => (await db.query<{ r: T }>(`select ${sql} as r`, params)).rows[0].r);
}
const hariIni = async (geser = 0) =>
	(await db.query<{ t: string }>('select (public.tanggal_wib(now()) + $1::int)::text as t', [geser])).rows[0].t;
async function kiriman(item: [string, number, number][], extra: Record<string, unknown> = {}) {
	return {
		id: crypto.randomUUID(),
		outlet_id: await idOutlet(db, 'BL'),
		tanggal: await hariIni(),
		item: await Promise.all(item.map(async ([kode, qty, harga]) => ({ satuan_beli_id: await idSatuan(db, kode), qty, harga }))),
		...extra
	};
}
const masuk = (oleh: string, p: object) => rpc<string>(oleh, 'public.catat_barang_masuk($1::jsonb)', [JSON.stringify(p)]);
const batalMasuk = (oleh: string, id: string, alasan = 'salah input') => rpc(oleh, 'public.batal_barang_masuk($1, $2)', [id, alasan]);
const stok = (kode: string, outlet = 'BL') => stokBahan(db, outlet, kode);

describe('barang masuk', () => {
	it('memecah isi pack ke bahan dan menyimpan total & nama barang', async () => {
		const p = await kiriman([
			['pack_ayam_ori', 2, 40000],
			['beras_kg', 1.5, 12340]
		]);
		await masuk(adminId, p);
		expect(await stok('ori_dada')).toBe(6);
		expect(await stok('ori_paha_atas')).toBe(4);
		expect(await stok('ori_paha_bawah')).toBe(4);
		expect(await stok('ori_sayap')).toBe(4);
		expect(await stok('beras')).toBeCloseTo(1.5, 4);
		const bm = (await db.query<{ total: string; n: number }>('select total, (select count(*)::int from public.barang_masuk_item where barang_masuk_id = $1) as n from public.barang_masuk where id = $1', [p.id])).rows[0];
		expect(Number(bm.total)).toBe(2 * 40000 + 18510);
		expect(bm.n).toBe(2);
	});

	it('id sama dikirim dua kali → tercatat sekali', async () => {
		const p = await kiriman([['pack_kemasan_kecil', 1, 30000]]);
		await masuk(adminId, p);
		await masuk(adminId, p);
		expect(await stok('kemasan_kecil')).toBe(100);
	});

	it('kasir tidak boleh mencatat barang masuk', async () => {
		await expect(masuk(kasirBL, await kiriman([['pack_kemasan_kecil', 1, 30000]]))).rejects.toThrow(/Hanya admin/);
	});

	it('tanggal: 3 hari lalu boleh (waktu ikut tanggal itu); 8 hari lalu & besok ditolak', async () => {
		const p = await kiriman([['pack_kemasan_kecil', 1, 30000]], { tanggal: await hariIni(-3) });
		await masuk(adminId, p);
		const t = (await db.query<{ t: string }>('select public.tanggal_wib(waktu)::text as t from public.barang_masuk where id = $1', [p.id])).rows[0].t;
		expect(t).toBe(await hariIni(-3));
		await expect(masuk(adminId, await kiriman([['pack_kemasan_kecil', 1, 1]], { tanggal: await hariIni(-8) }))).rejects.toThrow(/7 hari/);
		await expect(masuk(adminId, await kiriman([['pack_kemasan_kecil', 1, 1]], { tanggal: await hariIni(1) }))).rejects.toThrow(/7 hari/);
	});

	it('isian salah ditolak: barang ganda, jumlah 0, harga negatif, harga berubah-ubah 0, kosong', async () => {
		await expect(masuk(adminId, await kiriman([['pack_box', 1, 1], ['pack_box', 2, 1]]))).rejects.toThrow(/dua kali/);
		await expect(masuk(adminId, await kiriman([['pack_box', 0, 1]]))).rejects.toThrow(/Jumlah barang tidak sah/);
		await expect(masuk(adminId, await kiriman([['pack_box', 1, -5]]))).rejects.toThrow(/Harga barang tidak sah/);
		await expect(masuk(adminId, await kiriman([['beras_kg', 10, 0]]))).rejects.toThrow(/wajib diisi/);
		await expect(masuk(adminId, await kiriman([]))).rejects.toThrow(/minimal satu barang/);
	});

	it('barang harga tetap boleh berharga 0 (mis. bonus dari stokis)', async () => {
		await masuk(adminId, await kiriman([['pack_box', 1, 0]]));
		expect(await stok('box')).toBe(100);
	});

	it('batal membalik persis, sekali saja, dengan alasan; kasir tidak boleh', async () => {
		const p = await kiriman([['pack_ayam_ori', 1, 40000]]);
		await masuk(adminId, p);
		await expect(batalMasuk(kasirBL, p.id)).rejects.toThrow(/Hanya admin/);
		await expect(batalMasuk(adminId, p.id, 'x')).rejects.toThrow(/Alasan/);
		await batalMasuk(adminId, p.id);
		expect(await stok('ori_dada')).toBe(0);
		await expect(batalMasuk(adminId, p.id)).rejects.toThrow(/sudah dibatalkan/);
		expect(await stok('ori_dada')).toBe(0);
	});
});

describe('stok awal', () => {
	const ajukan = async (oleh: string, outlet: string, item: [string, number][]) =>
		rpc<string>(oleh, 'public.ajukan_stok_awal($1, $2::jsonb)', [
			await idOutlet(db, outlet),
			JSON.stringify(await Promise.all(item.map(async ([kode, qty]) => ({ bahan_id: await idBahan(db, kode), qty }))))
		]);
	const putuskan = (oleh: string, id: string, setuju: boolean, item: unknown = null, catatan: string | null = null) =>
		rpc(oleh, 'public.putuskan_stok_awal($1, $2, $3::jsonb, $4)', [id, setuju, item === null ? null : JSON.stringify(item), catatan]);

	it('kasir mengajukan, admin menyetujui → stok = hitungan; bahan yang tidak diisi tidak berubah', async () => {
		const id = await ajukan(kasirBL, 'BL', [
			['ori_dada', 12],
			['beras', 7.5]
		]);
		await putuskan(adminId, id, true);
		expect(await stok('ori_dada')).toBe(12);
		expect(await stok('beras')).toBeCloseTo(7.5, 4);
		expect(await stok('ori_sayap')).toBe(0);
	});

	it('hitungan berlaku saat dihitung: jual sebelum hitung diabaikan, jual sesudah tetap memotong', async () => {
		const shift = await shiftLangsung(db, 'BL', kasirBL);
		void shift;
		const jual = async (qty: number) => {
			const p = { id: crypto.randomUUID(), outlet_id: await idOutlet(db, 'BL'), metode: 'qris', item: [{ menu_id: await idMenu(db, 'ori_dada'), qty }] };
			await rpc(kasirBL, 'public.catat_penjualan($1::jsonb)', [JSON.stringify(p)]);
			return p.id;
		};
		const sebelum = await jual(2);
		await db.query(`update public.gerakan_stok set waktu = now() - interval '2 hours' where penjualan_id = $1`, [sebelum]);
		const id = await ajukan(kasirBL, 'BL', [['ori_dada', 10]]);
		await db.query(`update public.stok_awal set dihitung_at = now() - interval '1 hour' where id = $1`, [id]);
		await jual(1);
		await putuskan(adminId, id, true);
		expect(await stok('ori_dada')).toBe(9);
	});

	it('admin boleh membetulkan angka saat menyetujui', async () => {
		const id = await ajukan(kasirBL, 'BL', [['ori_dada', 12]]);
		await putuskan(adminId, id, true, [{ bahan_id: await idBahan(db, 'ori_dada'), qty: 20 }]);
		expect(await stok('ori_dada')).toBe(20);
	});

	it('satu ajuan menunggu per outlet; setelah disetujui tidak bisa mengajukan lagi', async () => {
		const id = await ajukan(kasirBL, 'BL', [['ori_dada', 1]]);
		await expect(ajukan(kasirBL, 'BL', [['ori_dada', 2]])).rejects.toThrow(/menunggu persetujuan/);
		await putuskan(adminId, id, true);
		await expect(ajukan(kasirBL, 'BL', [['ori_dada', 2]])).rejects.toThrow(/sudah disetujui/);
		await expect(putuskan(adminId, id, true)).rejects.toThrow(/sudah diputuskan/);
	});

	it('ditolak dengan alasan → kasir bisa mengajukan ulang; stok tidak berubah', async () => {
		const id = await ajukan(kasirBL, 'BL', [['ori_dada', 50]]);
		await expect(putuskan(adminId, id, false, null, 'x')).rejects.toThrow(/Alasan penolakan/);
		await putuskan(adminId, id, false, null, 'hitung ulang dada');
		expect(await stok('ori_dada')).toBe(0);
		await ajukan(kasirBL, 'BL', [['ori_dada', 5]]);
	});

	it('hak: kasir outlet lain ditolak, kasir tidak bisa memutuskan, kasir nonaktif ditolak', async () => {
		await expect(ajukan(kasirTK, 'BL', [['ori_dada', 1]])).rejects.toThrow(/tidak berhak/);
		const id = await ajukan(kasirBL, 'BL', [['ori_dada', 1]]);
		await expect(putuskan(kasirBL, id, true)).rejects.toThrow(/Hanya admin/);
		await db.query('update public.profiles set aktif = false where id = $1', [kasirTK]);
		await expect(ajukan(kasirTK, 'TK', [['ori_dada', 1]])).rejects.toThrow(/tidak berhak/);
	});

	it('isian salah ditolak: kosong, bahan ganda, jumlah negatif, bahan tidak dikenal', async () => {
		await expect(ajukan(kasirBL, 'BL', [])).rejects.toThrow(/minimal satu bahan/);
		await expect(ajukan(kasirBL, 'BL', [['ori_dada', 1], ['ori_dada', 2]])).rejects.toThrow(/dua kali/);
		await expect(ajukan(kasirBL, 'BL', [['ori_dada', -1]])).rejects.toThrow(/Jumlah stok tidak sah/);
		await expect(
			rpc(kasirBL, 'public.ajukan_stok_awal($1, $2::jsonb)', [await idOutlet(db, 'BL'), JSON.stringify([{ bahan_id: crypto.randomUUID(), qty: 1 }])])
		).rejects.toThrow(/tidak dikenal/);
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run tests/db/stok-fungsi.test.ts`
Expected: FAIL — `function public.catat_barang_masuk(jsonb) does not exist`.

- [ ] **Step 3: Migrasi**

`supabase/migrations/20261006000011_fungsi_stok.sql`:
```sql
-- Fungsi stok (Tahap 3a): barang masuk & stok awal. security definer; akses diperiksa di dalam.

create function public._wajib_admin_stok() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Hanya admin yang boleh mengelola stok' using errcode = '42501';
  end if;
end
$$;

-- Memeriksa daftar hitungan [{bahan_id, qty}] (stok awal).
create function public._cek_isian_stok(p_item jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_jumlah integer;
  v_unik integer;
  v_kenal integer;
  v_sah boolean;
begin
  if jsonb_typeof(p_item) is distinct from 'array' or jsonb_array_length(p_item) = 0 then
    raise exception 'Isi minimal satu bahan' using errcode = '22023';
  end if;
  select count(*), count(distinct x.bahan_id), count(b.id),
         coalesce(bool_and(x.qty is not null and x.qty >= 0 and x.qty <= 1000000), false)
  into v_jumlah, v_unik, v_kenal, v_sah
  from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric)
  left join public.bahan b on b.id = x.bahan_id and b.aktif;
  if v_kenal <> v_jumlah then
    raise exception 'Bahan tidak dikenal atau nonaktif' using errcode = '22023';
  end if;
  if v_unik <> v_jumlah then
    raise exception 'Bahan yang sama tertulis dua kali' using errcode = '22023';
  end if;
  if not v_sah then
    raise exception 'Jumlah stok tidak sah' using errcode = '22023';
  end if;
end
$$;

create function public.catat_barang_masuk(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_tanggal date := (p ->> 'tanggal')::date;
  v_catatan text := nullif(trim(coalesce(p ->> 'catatan', '')), '');
  v_hari_ini date := public.tanggal_wib(now());
  v_waktu timestamptz;
  v_jumlah integer;
  v_unik integer;
  v_kenal integer;
  v_qty_sah boolean;
  v_harga_sah boolean;
  v_harga_kosong boolean;
  v_total bigint;
begin
  perform public._wajib_admin_stok();
  if v_id is null or v_outlet is null or v_tanggal is null then
    raise exception 'Data barang masuk tidak lengkap' using errcode = '22023';
  end if;
  -- Simpan ditekan dua kali / kirim ulang: id dibuat di perangkat, kiriman kedua diabaikan.
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  if exists (select 1 from public.barang_masuk where id = v_id) then
    return v_id;
  end if;
  if not exists (select 1 from public.outlets where id = v_outlet) then
    raise exception 'Outlet tidak ditemukan' using errcode = '22023';
  end if;
  if v_tanggal > v_hari_ini or v_tanggal < v_hari_ini - 7 then
    raise exception 'Tanggal barang masuk paling lama 7 hari ke belakang dan tidak boleh di masa depan' using errcode = '22023';
  end if;
  if v_catatan is not null and length(v_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'item') is distinct from 'array' or jsonb_array_length(p -> 'item') = 0 then
    raise exception 'Barang masuk minimal satu barang' using errcode = '22023';
  end if;

  select count(*), count(distinct x.satuan_beli_id), count(s.id),
         coalesce(bool_and(x.qty is not null and x.qty > 0 and x.qty <= 100000 and x.qty = round(x.qty, 3)), false),
         coalesce(bool_and(x.harga is not null and x.harga between 0 and 100000000), false),
         coalesce(bool_or(not s.harga_tetap and x.harga = 0), false),
         coalesce(sum(round(x.qty * x.harga)), 0)::bigint
  into v_jumlah, v_unik, v_kenal, v_qty_sah, v_harga_sah, v_harga_kosong, v_total
  from jsonb_to_recordset(p -> 'item') as x (satuan_beli_id uuid, qty numeric, harga integer)
  left join public.satuan_beli s on s.id = x.satuan_beli_id and s.aktif;

  if v_kenal <> v_jumlah then
    raise exception 'Barang tidak dikenal atau nonaktif' using errcode = '22023';
  end if;
  if v_unik <> v_jumlah then
    raise exception 'Barang yang sama tertulis dua kali' using errcode = '22023';
  end if;
  if not v_qty_sah then
    raise exception 'Jumlah barang tidak sah' using errcode = '22023';
  end if;
  if not v_harga_sah then
    raise exception 'Harga barang tidak sah' using errcode = '22023';
  end if;
  if v_harga_kosong then
    raise exception 'Harga barang yang harganya berubah-ubah wajib diisi' using errcode = '22023';
  end if;

  -- Tanggal mundur: waktu = jam sekarang pada tanggal itu (urutan riwayat tetap masuk akal).
  v_waktu := case when v_tanggal = v_hari_ini then now() else now() - make_interval(days => v_hari_ini - v_tanggal) end;

  insert into public.barang_masuk (id, outlet_id, tanggal, waktu, total, catatan, dicatat_oleh)
  values (v_id, v_outlet, v_tanggal, v_waktu, v_total, v_catatan, auth.uid());

  insert into public.barang_masuk_item (barang_masuk_id, satuan_beli_id, nama, qty, harga)
  select v_id, s.id, s.nama, x.qty, x.harga
  from jsonb_to_recordset(p -> 'item') as x (satuan_beli_id uuid, qty numeric, harga integer)
  join public.satuan_beli s on s.id = x.satuan_beli_id;

  -- Isi pack dipecah saat ini (snapshot): perubahan isi pack di master tidak mengubah riwayat.
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, barang_masuk_id)
  select v_outlet, i.bahan_id, sum(x.qty * i.qty), 'masuk', v_waktu, auth.uid(), v_id
  from jsonb_to_recordset(p -> 'item') as x (satuan_beli_id uuid, qty numeric, harga integer)
  join public.satuan_beli_isi i on i.satuan_beli_id = x.satuan_beli_id
  group by i.bahan_id;

  return v_id;
end
$$;

create function public.batal_barang_masuk(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.barang_masuk;
begin
  perform public._wajib_admin_stok();
  select * into v from public.barang_masuk where id = p_id for update;
  if not found then
    raise exception 'Barang masuk tidak ditemukan' using errcode = '22023';
  end if;
  if v.batal_at is not null then
    raise exception 'Barang masuk sudah dibatalkan' using errcode = '22023';
  end if;
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  update public.barang_masuk set batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan) where id = p_id;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, barang_masuk_id)
  select g.outlet_id, g.bahan_id, -sum(g.qty), 'masuk_batal', now(), auth.uid(), p_id
  from public.gerakan_stok g
  where g.barang_masuk_id = p_id and g.jenis = 'masuk'
  group by g.outlet_id, g.bahan_id;
end
$$;

create function public.ajukan_stok_awal(p_outlet uuid, p_item jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public._cek_akses_outlet(p_outlet);
  perform pg_advisory_xact_lock(hashtextextended('stok_awal:' || p_outlet::text, 0));
  if exists (select 1 from public.stok_awal where outlet_id = p_outlet and status = 'disetujui') then
    raise exception 'Stok awal outlet ini sudah disetujui; koreksi berikutnya lewat opname' using errcode = '22023';
  end if;
  if exists (select 1 from public.stok_awal where outlet_id = p_outlet and status = 'diajukan') then
    raise exception 'Stok awal outlet ini masih menunggu persetujuan admin' using errcode = '22023';
  end if;
  perform public._cek_isian_stok(p_item);
  insert into public.stok_awal (outlet_id, diajukan_oleh) values (p_outlet, auth.uid()) returning id into v_id;
  insert into public.stok_awal_item (stok_awal_id, bahan_id, qty_hitung)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  return v_id;
end
$$;

create function public.putuskan_stok_awal(p_id uuid, p_setuju boolean, p_item jsonb, p_catatan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.stok_awal;
begin
  perform public._wajib_admin_stok();
  select * into s from public.stok_awal where id = p_id for update;
  if not found then
    raise exception 'Ajuan stok awal tidak ditemukan' using errcode = '22023';
  end if;
  if s.status <> 'diajukan' then
    raise exception 'Ajuan stok awal sudah diputuskan' using errcode = '22023';
  end if;
  if p_setuju is null then
    raise exception 'Ajuan stok awal tidak lengkap' using errcode = '22023';
  end if;

  if not p_setuju then
    if p_catatan is null or length(trim(p_catatan)) < 3 or length(p_catatan) > 200 then
      raise exception 'Alasan penolakan wajib diisi (3–200 karakter)' using errcode = '22023';
    end if;
    update public.stok_awal set status = 'ditolak', diputus_at = now(), diputus_oleh = auth.uid(), catatan = trim(p_catatan)
    where id = p_id;
    return;
  end if;

  -- Admin boleh membetulkan angka kasir sebelum menyetujui.
  if p_item is not null and jsonb_typeof(p_item) <> 'null' then
    perform public._cek_isian_stok(p_item);
    delete from public.stok_awal_item where stok_awal_id = p_id;
    insert into public.stok_awal_item (stok_awal_id, bahan_id, qty_hitung)
    select p_id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  end if;

  -- Hitungan berlaku PADA SAAT DIHITUNG: koreksi = hitungan − saldo buku besar sampai saat itu.
  -- Penjualan sesudah dihitung tetap memotong. (Rumus yang sama dipakai opname 3b.)
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, stok_awal_id)
  select s.outlet_id, i.bahan_id, d.selisih, 'awal', s.dihitung_at, auth.uid(), s.id
  from public.stok_awal_item i
  cross join lateral (
    select i.qty_hitung - coalesce(sum(g.qty), 0) as selisih
    from public.gerakan_stok g
    where g.outlet_id = s.outlet_id and g.bahan_id = i.bahan_id and g.waktu <= s.dihitung_at
  ) d
  where i.stok_awal_id = p_id and d.selisih <> 0;

  update public.stok_awal
  set status = 'disetujui', diputus_at = now(), diputus_oleh = auth.uid(), catatan = nullif(trim(coalesce(p_catatan, '')), '')
  where id = p_id;
end
$$;

revoke execute on function public._wajib_admin_stok() from public, anon, authenticated;
revoke execute on function public._cek_isian_stok(jsonb) from public, anon, authenticated;
revoke execute on function public.catat_barang_masuk(jsonb) from public, anon;
revoke execute on function public.batal_barang_masuk(uuid, text) from public, anon;
revoke execute on function public.ajukan_stok_awal(uuid, jsonb) from public, anon;
revoke execute on function public.putuskan_stok_awal(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.catat_barang_masuk(jsonb) to authenticated;
grant execute on function public.batal_barang_masuk(uuid, text) to authenticated;
grant execute on function public.ajukan_stok_awal(uuid, jsonb) to authenticated;
grant execute on function public.putuskan_stok_awal(uuid, boolean, jsonb, text) to authenticated;
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run tests/db`
Expected: PASS semua.

- [ ] **Step 5: Mutasi cepat**

Ganti sementara `g.waktu <= s.dihitung_at` dengan `true` → tes "hitungan berlaku saat dihitung" harus FAIL (hasil 12, bukan 9); kembalikan. Hapus sementara blok `if exists (select 1 from public.barang_masuk where id = v_id)` → tes "id sama" harus FAIL (primary key); kembalikan.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261006000011_fungsi_stok.sql tests/db/stok-fungsi.test.ts
git commit -m "feat(stok): fungsi barang masuk (+batal) dan stok awal (ajukan kasir, putuskan admin)"
```

---

### Task 4: Lapisan klien stok (tipe, tampilan, isian, pesan, API)

**Files:**
- Create: `src/lib/stok/types.ts`, `src/lib/stok/tampil.ts`, `src/lib/stok/isian.ts`, `src/lib/stok/pesan.ts`, `src/lib/stok/api.ts`
- Test: `src/lib/stok/tampil.test.ts`, `src/lib/stok/isian.test.ts`, `src/lib/stok/pesan.test.ts`

**Interfaces:**
- Consumes: `Bahan`, `SatuanBeli`, `IsiSatuanBeli` (`#lib/master/types.ts`); `formatQty` (`#lib/master/rupiah.ts`); `muatBahan`, `muatSatuanBeli`, `muatIsiSatuanBeli` (`#lib/master/api.ts`); `pesanErrorData` (`#lib/master/pesan.ts`); RPC Task 3.
- Produces:
  - `types.ts`: `JenisGerakan`, `StatusStok = 'aman'|'menipis'|'minus'`, `BarisStok { kunci; label; teks; status; bahan_id: string[] }`, `Gerakan { id: number; bahan_id; qty: number; jenis; waktu; nomor: string|null }`, `BarangMasuk { id; outlet_id; tanggal; waktu; total: number; catatan: string|null; batal_at: string|null; batal_alasan: string|null; item: { satuan_beli_id; nama; qty: number; harga: number; subtotal: number }[] }`, `StokAwal { id; outlet_id; status: 'diajukan'|'disetujui'|'ditolak'; dihitung_at; catatan: string|null; item: { bahan_id; qty_hitung: number }[] }`, `KirimBarangMasuk { id; outlet_id; tanggal; catatan?: string; item: { satuan_beli_id; qty: number; harga: number }[] }`, `ItemHitung { bahan_id: string; qty: number }`.
  - `tampil.ts`: `angkaStok(n): string`, `labelGrup(namaSatuan): string`, `susunStok(bahan, satuan, isi, stok: ReadonlyMap<string, number>): BarisStok[]`, `LABEL_JENIS: Record<JenisGerakan, string>`, `hitungRingkasan(baris): { minus: number; menipis: number }`.
  - `isian.ts`: `type Isian`, `bentukIsian(bahan, satuan, isi): Isian[]`, `parseHitung(teks, desimal): number|null`, `type TeksIsian = Record<string, { a: string; b: string }>`, `kumpulkanIsian(isian, teks): { item: ItemHitung[]; galat: Record<string, string> }`, `teksDari(isian, qty: ReadonlyMap<string, number>): TeksIsian`.
  - `pesan.ts`: `pesanStok(err): string | null`.
  - `api.ts`: `interface DataStok { bahan; satuan; isi }`, `muatDataStok()`, `muatStok(outletId?)`, `petaStok(rows, outletId): Map<string, number>`, `muatGerakan(outletId, bahanIds, batas = 100)`, `muatStokAwal(outletId?)`, `ajukanStokAwal(outletId, item)`, `putuskanStokAwal(id, setuju, item | null, catatan | null)`, `muatBarangMasuk(outletId)`, `catatBarangMasuk(p)`, `batalBarangMasuk(id, alasan)`.

- [ ] **Step 1: Tes (gagal dulu)**

`src/lib/stok/tampil.test.ts`:
```ts
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
```

`src/lib/stok/isian.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import { bentukIsian, kumpulkanIsian, parseHitung, teksDari } from './isian';

const b = (id: string, satuan: string, urutan: number): Bahan => ({ id, kode: id, nama: id.toUpperCase(), satuan, mode: 'otomatis', urutan, aktif: true });
const s = (id: string): SatuanBeli => ({ id, kode: id, nama: id, ambang: null, harga_tetap: true, urutan: 0, aktif: true });
const bahan = [b('dada', 'potong', 1), b('sayap', 'potong', 2), b('kemasan', 'pcs', 3), b('beras', 'kg', 4), b('cup', 'pcs', 5)];
const satuan = [s('pack_ori'), s('pack_kemasan'), s('beras_kg')];
const isi: IsiSatuanBeli[] = [
	{ satuan_beli_id: 'pack_ori', bahan_id: 'dada', qty: 3 },
	{ satuan_beli_id: 'pack_ori', bahan_id: 'sayap', qty: 2 },
	{ satuan_beli_id: 'pack_kemasan', bahan_id: 'kemasan', qty: 100 },
	{ satuan_beli_id: 'beras_kg', bahan_id: 'beras', qty: 1 }
];

describe('bentukIsian', () => {
	it('ayam per potong, pack satu-bahan = pack + lepas, kg desimal, tanpa satuan beli = satu kotak', () => {
		expect(bentukIsian(bahan, satuan, isi)).toEqual([
			{ bahan_id: 'dada', label: 'DADA', jenis: 'satu', satuan: 'potong', desimal: false },
			{ bahan_id: 'sayap', label: 'SAYAP', jenis: 'satu', satuan: 'potong', desimal: false },
			{ bahan_id: 'kemasan', label: 'KEMASAN', jenis: 'pack', satuan: 'pcs', isi: 100 },
			{ bahan_id: 'beras', label: 'BERAS', jenis: 'satu', satuan: 'kg', desimal: true },
			{ bahan_id: 'cup', label: 'CUP', jenis: 'satu', satuan: 'pcs', desimal: false }
		]);
	});
});

describe('parseHitung', () => {
	it.each([
		['0', false, 0],
		['12', false, 12],
		['12,5', true, 12.5],
		['0.25', true, 0.25]
	])('"%s" (desimal %s) → %s', (t, d, n) => expect(parseHitung(t, d)).toBe(n));
	it.each([
		['', false],
		['1,5', false],
		['-1', false],
		['1.000', true],
		['abc', true],
		['2000000', false]
	])('"%s" (desimal %s) → null', (t, d) => expect(parseHitung(t, d)).toBeNull());
});

describe('kumpulkanIsian & teksDari', () => {
	const f = bentukIsian(bahan, satuan, isi);
	it('pack + lepas dikonversi ke satuan dasar; kotak lepas kosong = 0', () => {
		const h = kumpulkanIsian(f, {
			dada: { a: '10', b: '' },
			sayap: { a: '0', b: '' },
			kemasan: { a: '3', b: '' },
			beras: { a: '7,5', b: '' },
			cup: { a: '40', b: '' }
		});
		expect(h.galat).toEqual({});
		expect(h.item).toEqual([
			{ bahan_id: 'dada', qty: 10 },
			{ bahan_id: 'sayap', qty: 0 },
			{ bahan_id: 'kemasan', qty: 300 },
			{ bahan_id: 'beras', qty: 7.5 },
			{ bahan_id: 'cup', qty: 40 }
		]);
	});
	it('kotak kosong dan isian salah diberi galat per bahan', () => {
		const h = kumpulkanIsian(f, {
			dada: { a: '', b: '' },
			sayap: { a: '1,5', b: '' },
			kemasan: { a: '', b: '' },
			beras: { a: '1', b: '' },
			cup: { a: '1', b: '' }
		});
		expect(Object.keys(h.galat).sort()).toEqual(['dada', 'kemasan', 'sayap']);
	});
	it('teksDari mengisi ulang formulir dari jumlah tersimpan', () => {
		const t = teksDari(f, new Map([
			['kemasan', 340],
			['beras', 7.5],
			['dada', 9]
		]));
		expect(t.kemasan).toEqual({ a: '3', b: '40' });
		expect(t.beras).toEqual({ a: '7,5', b: '' });
		expect(t.dada).toEqual({ a: '9', b: '' });
		expect(t.cup).toEqual({ a: '', b: '' });
	});
});
```

`src/lib/stok/pesan.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pesanStok } from './pesan';

const sql = readFileSync(join(import.meta.dirname, '../../../supabase/migrations/20261006000011_fungsi_stok.sql'), 'utf8');
const resmi = [...sql.matchAll(/raise exception '([^']+)' using errcode = '(\d+)'/g)].map((m) => ({ message: m[1], code: m[2] }));

describe('pesanStok', () => {
	it('semua pesan resmi fungsi stok (0011) diteruskan apa adanya, berakhiran titik', () => {
		expect(resmi.length).toBeGreaterThanOrEqual(18);
		for (const e of resmi) expect(pesanStok(e)).toBe(`${e.message}.`);
	});
	it('pesan akses outlet dari 0009 juga diteruskan', () => {
		expect(pesanStok({ code: '42501', message: 'Anda tidak berhak mengakses outlet ini' })).toBe('Anda tidak berhak mengakses outlet ini.');
	});
	it('pesan Postgres mentah tidak diteruskan', () => {
		expect(pesanStok({ code: '22023', message: 'cannot extract elements from a scalar' })).toBe('Isian tidak sah.');
		expect(pesanStok(null)).toBeNull();
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/stok`
Expected: FAIL — modul `./tampil`, `./isian`, `./pesan` belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/stok/types.ts`:
```ts
export type JenisGerakan = 'awal' | 'masuk' | 'masuk_batal' | 'jual' | 'jual_batal';
export type StatusStok = 'aman' | 'menipis' | 'minus';

/** Satu baris layar stok: satu bahan, atau satu kelompok ayam per varian. */
export interface BarisStok {
	kunci: string;
	label: string;
	teks: string;
	status: StatusStok;
	bahan_id: string[];
}

export interface Gerakan {
	id: number;
	bahan_id: string;
	qty: number;
	jenis: JenisGerakan;
	waktu: string;
	nomor: string | null;
}

export interface BarangMasuk {
	id: string;
	outlet_id: string;
	tanggal: string;
	waktu: string;
	total: number;
	catatan: string | null;
	batal_at: string | null;
	batal_alasan: string | null;
	item: { satuan_beli_id: string; nama: string; qty: number; harga: number; subtotal: number }[];
}

export interface StokAwal {
	id: string;
	outlet_id: string;
	status: 'diajukan' | 'disetujui' | 'ditolak';
	dihitung_at: string;
	catatan: string | null;
	item: { bahan_id: string; qty_hitung: number }[];
}

export interface KirimBarangMasuk {
	id: string;
	outlet_id: string;
	tanggal: string;
	catatan?: string;
	item: { satuan_beli_id: string; qty: number; harga: number }[];
}

export interface ItemHitung {
	bahan_id: string;
	qty: number;
}
```

`src/lib/stok/tampil.ts`:
```ts
// Menyusun angka buku besar menjadi baris stok yang mudah dibaca kasir/admin (logika murni, teruji).
import { formatQty } from '#lib/master/rupiah.ts';
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import type { BarisStok, JenisGerakan, StatusStok } from './types.ts';

const EPS = 1e-9;
const DESIMAL = new Set(['kg', 'liter']);

export const LABEL_JENIS: Record<JenisGerakan, string> = {
	awal: 'Stok awal',
	masuk: 'Barang masuk',
	masuk_batal: 'Batal barang masuk',
	jual: 'Terjual',
	jual_batal: 'Batal jual'
};

/** Paling banyak 2 desimal, koma Indonesia; -0 ditampilkan 0. */
export function angkaStok(n: number): string {
	const r = Math.round(n * 100) / 100;
	return formatQty(Object.is(r, -0) ? 0 : r);
}

/** "Pack Ayam Ori (1 kg)" → "Ayam Ori". */
export function labelGrup(namaSatuan: string): string {
	return namaSatuan
		.replace(/^(pack|karung)\s+/i, '')
		.replace(/\s*\(.*\)\s*$/, '')
		.trim();
}

function status(minus: boolean, packSetara: number, ambang: number | null): StatusStok {
	if (minus) return 'minus';
	return ambang != null && packSetara <= ambang + EPS ? 'menipis' : 'aman';
}

interface Anggota {
	b: Bahan;
	isi: number;
	n: number;
}

function barisGrup(g: SatuanBeli, anggota: Anggota[]): BarisStok {
	const utuh = Math.max(0, Math.floor(Math.min(...anggota.map((a) => a.n / a.isi)) + EPS));
	const sisa = anggota.map((a) => ({ nama: a.b.nama, n: a.n - utuh * a.isi })).filter((x) => Math.abs(x.n) > EPS);
	const bagian = [...(utuh > 0 || sisa.length === 0 ? [`${utuh} pack`] : []), ...sisa.map((x) => `${angkaStok(x.n)} ${x.nama}`)];
	const total = anggota.reduce((t, a) => t + a.n, 0);
	const isiPack = anggota.reduce((t, a) => t + a.isi, 0);
	return {
		kunci: g.id,
		label: labelGrup(g.nama),
		teks: bagian.join(' + '),
		status: status(anggota.some((a) => a.n < -EPS), total / isiPack, g.ambang),
		bahan_id: anggota.map((a) => a.b.id)
	};
}

function barisTunggal(b: Bahan, n: number, t: { s: SatuanBeli; isi: number } | undefined): BarisStok {
	const st = status(n < -EPS, t ? n / t.isi : 0, t?.s.ambang ?? null);
	const dasar = { kunci: b.id, label: b.nama, bahan_id: [b.id], status: st };
	if (!t || t.isi === 1 || DESIMAL.has(b.satuan) || n < 0) return { ...dasar, teks: `${angkaStok(n)} ${b.satuan}` };
	const pack = Math.floor(n / t.isi + EPS);
	const lepas = n - pack * t.isi;
	if (pack === 0) return { ...dasar, teks: `${angkaStok(n)} ${b.satuan}` };
	return { ...dasar, teks: `${pack} pack${Math.abs(lepas) > EPS ? ` + ${angkaStok(lepas)} ${b.satuan}` : ''}` };
}

/**
 * Satuan beli berisi >1 bahan (pack ayam) → satu baris per kelompok; selain itu satu baris per bahan,
 * memakai satuan beli satu-bahan dengan isi terkecil untuk "pack + lepas" & ambang. Hanya bahan aktif.
 */
export function susunStok(bahan: Bahan[], satuan: SatuanBeli[], isi: IsiSatuanBeli[], stok: ReadonlyMap<string, number>): BarisStok[] {
	const aktif = bahan.filter((b) => b.aktif).sort((a, b) => a.urutan - b.urutan);
	const perId = new Map(aktif.map((b) => [b.id, b]));
	const qty = (id: string) => stok.get(id) ?? 0;

	const isiPer = new Map<string, IsiSatuanBeli[]>();
	for (const s of satuan.filter((x) => x.aktif)) {
		const baris = isi.filter((x) => x.satuan_beli_id === s.id && perId.has(x.bahan_id));
		if (baris.length) isiPer.set(s.id, baris);
	}
	const satuanPer = new Map(satuan.map((s) => [s.id, s]));
	const grupBahan = new Map<string, SatuanBeli>();
	const tunggal = new Map<string, { s: SatuanBeli; isi: number }>();
	for (const [sid, baris] of isiPer) {
		const s = satuanPer.get(sid)!;
		if (baris.length > 1) for (const x of baris) grupBahan.set(x.bahan_id, s);
		else {
			const lama = tunggal.get(baris[0].bahan_id);
			if (!lama || baris[0].qty < lama.isi) tunggal.set(baris[0].bahan_id, { s, isi: baris[0].qty });
		}
	}

	const hasil: BarisStok[] = [];
	const sudah = new Set<string>();
	for (const b of aktif) {
		if (sudah.has(b.id)) continue;
		const g = grupBahan.get(b.id);
		if (g) {
			const anggota = isiPer.get(g.id)!.map((x) => ({ b: perId.get(x.bahan_id)!, isi: x.qty, n: qty(x.bahan_id) }));
			for (const a of anggota) sudah.add(a.b.id);
			hasil.push(barisGrup(g, anggota));
		} else {
			sudah.add(b.id);
			hasil.push(barisTunggal(b, qty(b.id), tunggal.get(b.id)));
		}
	}
	return hasil;
}

export function hitungRingkasan(baris: BarisStok[]): { minus: number; menipis: number } {
	return {
		minus: baris.filter((b) => b.status === 'minus').length,
		menipis: baris.filter((b) => b.status === 'menipis').length
	};
}
```

`src/lib/stok/isian.ts`:
```ts
// Formulir hitungan fisik (stok awal; nanti opname 3b): bentuk kotak per bahan & konversi ke satuan dasar.
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import type { ItemHitung } from './types.ts';

export type Isian =
	| { bahan_id: string; label: string; jenis: 'satu'; satuan: string; desimal: boolean }
	| { bahan_id: string; label: string; jenis: 'pack'; satuan: string; isi: number };

/** a = jumlah (atau pack utuh), b = satuan lepas (hanya untuk jenis 'pack'). */
export type TeksIsian = Record<string, { a: string; b: string }>;

/** Ayam (satuan beli berisi banyak bahan), kg/liter, dan bahan tanpa pack → satu kotak; selain itu pack + lepas. */
export function bentukIsian(bahan: Bahan[], satuan: SatuanBeli[], isi: IsiSatuanBeli[]): Isian[] {
	const satuanAktif = new Set(satuan.filter((s) => s.aktif).map((s) => s.id));
	const perSatuan = new Map<string, IsiSatuanBeli[]>();
	for (const x of isi) {
		if (!satuanAktif.has(x.satuan_beli_id)) continue;
		perSatuan.set(x.satuan_beli_id, [...(perSatuan.get(x.satuan_beli_id) ?? []), x]);
	}
	const dalamGrup = new Set<string>();
	const isiTunggal = new Map<string, number>();
	for (const baris of perSatuan.values()) {
		if (baris.length > 1) for (const x of baris) dalamGrup.add(x.bahan_id);
		else {
			const lama = isiTunggal.get(baris[0].bahan_id);
			if (lama === undefined || baris[0].qty < lama) isiTunggal.set(baris[0].bahan_id, baris[0].qty);
		}
	}
	return bahan
		.filter((b) => b.aktif)
		.sort((a, b) => a.urutan - b.urutan)
		.map((b): Isian => {
			const desimal = b.satuan === 'kg' || b.satuan === 'liter';
			const n = isiTunggal.get(b.id);
			if (dalamGrup.has(b.id) || desimal || n === undefined || n === 1) {
				return { bahan_id: b.id, label: b.nama, jenis: 'satu', satuan: b.satuan, desimal };
			}
			return { bahan_id: b.id, label: b.nama, jenis: 'pack', satuan: b.satuan, isi: n };
		});
}

/** Hitungan fisik: bulat (atau ≤3 desimal untuk kg/liter), 0..1.000.000. Kosong → null. "1.000" ditolak (ambigu). */
export function parseHitung(teks: string, desimal: boolean): number | null {
	const t = teks.trim();
	if (t === '' || /^\d{1,3}(\.\d{3})+$/.test(t)) return null;
	if (!(desimal ? /^\d+([.,]\d{1,3})?$/ : /^\d+$/).test(t)) return null;
	const n = Number(t.replace(',', '.'));
	return n <= 1_000_000 ? n : null;
}

export function kumpulkanIsian(isian: Isian[], teks: TeksIsian): { item: ItemHitung[]; galat: Record<string, string> } {
	const item: ItemHitung[] = [];
	const galat: Record<string, string> = {};
	for (const f of isian) {
		const t = teks[f.bahan_id] ?? { a: '', b: '' };
		if (f.jenis === 'satu') {
			const n = parseHitung(t.a, f.desimal);
			if (n === null) galat[f.bahan_id] = f.desimal ? 'Isi angka, mis. 12,5 (isi 0 bila habis).' : 'Isi angka bulat (isi 0 bila habis).';
			else item.push({ bahan_id: f.bahan_id, qty: n });
			continue;
		}
		if (t.a.trim() === '' && t.b.trim() === '') {
			galat[f.bahan_id] = 'Isi jumlah pack dan/atau yang lepas (isi 0 bila habis).';
			continue;
		}
		const pack = parseHitung(t.a.trim() === '' ? '0' : t.a, false);
		const lepas = parseHitung(t.b.trim() === '' ? '0' : t.b, false);
		if (pack === null || lepas === null) galat[f.bahan_id] = 'Isi angka bulat.';
		else item.push({ bahan_id: f.bahan_id, qty: pack * f.isi + lepas });
	}
	return { item, galat };
}

/** Mengisi ulang formulir dari jumlah tersimpan (admin memeriksa ajuan kasir). */
export function teksDari(isian: Isian[], qty: ReadonlyMap<string, number>): TeksIsian {
	const hasil: TeksIsian = {};
	for (const f of isian) {
		const n = qty.get(f.bahan_id);
		if (n === undefined) hasil[f.bahan_id] = { a: '', b: '' };
		else if (f.jenis === 'satu') hasil[f.bahan_id] = { a: String(n).replace('.', ','), b: '' };
		else {
			const pack = Math.floor(n / f.isi);
			hasil[f.bahan_id] = { a: String(pack), b: String(Math.round((n - pack * f.isi) * 1000) / 1000) };
		}
	}
	return hasil;
}
```

`src/lib/stok/pesan.ts`:
```ts
import { pesanErrorData } from '#lib/master/pesan.ts';

// Pesan resmi fungsi SQL stok (migrasi 0011) + akses outlet (0009); hanya ini yang diteruskan apa adanya.
const PESAN_STOK =
	/^(Hanya admin yang boleh mengelola stok|Data barang masuk tidak lengkap|Outlet tidak ditemukan|Tanggal barang masuk|Catatan paling banyak 200 karakter|Barang masuk minimal satu barang|Barang tidak dikenal atau nonaktif|Barang yang sama tertulis dua kali|Jumlah barang tidak sah|Harga barang tidak sah|Harga barang yang harganya berubah-ubah wajib diisi|Barang masuk tidak ditemukan|Barang masuk sudah dibatalkan|Alasan pembatalan wajib diisi|Stok awal outlet ini|Isi minimal satu bahan|Bahan tidak dikenal atau nonaktif|Bahan yang sama tertulis dua kali|Jumlah stok tidak sah|Ajuan stok awal|Alasan penolakan wajib diisi|Anda tidak berhak mengakses outlet ini)/;

export function pesanStok(err: { code?: string; message?: string; status?: number; name?: string } | null): string | null {
	if (!err) return null;
	const msg = err.message ?? '';
	if ((err.code === '22023' || err.code === '42501') && PESAN_STOK.test(msg)) return msg.endsWith('.') ? msg : `${msg}.`;
	return pesanErrorData(err);
}
```

`src/lib/stok/api.ts`:
```ts
import { muatBahan, muatIsiSatuanBeli, muatSatuanBeli } from '#lib/master/api.ts';
import type { Bahan, IsiSatuanBeli, SatuanBeli } from '#lib/master/types.ts';
import { supabase } from '#lib/supabase/client.ts';
import { pesanStok } from './pesan.ts';
import type { BarangMasuk, Gerakan, ItemHitung, KirimBarangMasuk, StokAwal } from './types.ts';

type Galat = Parameters<typeof pesanStok>[0];

function periksa<T>(res: { data: T | null; error: Galat }): T {
	if (res.error) throw new Error(pesanStok(res.error) ?? 'Gagal memuat data.');
	return res.data as T;
}
// PostgREST mengirim numeric sebagai teks.
const angka = (v: unknown): number => Number(v);

export interface DataStok {
	bahan: Bahan[];
	satuan: SatuanBeli[];
	isi: IsiSatuanBeli[];
}
export interface StokRow {
	outlet_id: string;
	bahan_id: string;
	qty: number;
}

export async function muatDataStok(): Promise<DataStok> {
	const [bahan, satuan, isi] = await Promise.all([muatBahan(), muatSatuanBeli(), muatIsiSatuanBeli()]);
	return { bahan, satuan, isi };
}

export async function muatStok(outletId?: string): Promise<StokRow[]> {
	let q = supabase.from('stok_outlet').select('outlet_id, bahan_id, qty');
	if (outletId) q = q.eq('outlet_id', outletId);
	return (periksa(await q) as StokRow[]).map((r) => ({ ...r, qty: angka(r.qty) }));
}

export function petaStok(rows: StokRow[], outletId: string): Map<string, number> {
	return new Map(rows.filter((r) => r.outlet_id === outletId).map((r) => [r.bahan_id, r.qty]));
}

export async function muatGerakan(outletId: string, bahanIds: string[], batas = 100): Promise<Gerakan[]> {
	const rows = periksa(
		await supabase
			.from('gerakan_stok')
			.select('id, bahan_id, qty, jenis, waktu, penjualan(nomor)')
			.eq('outlet_id', outletId)
			.in('bahan_id', bahanIds)
			.order('waktu', { ascending: false })
			.order('id', { ascending: false })
			.limit(batas)
	) as unknown as (Omit<Gerakan, 'nomor'> & { penjualan: { nomor: string } | null })[];
	return rows.map(({ penjualan, ...g }) => ({ ...g, qty: angka(g.qty), nomor: penjualan?.nomor ?? null }));
}

export async function muatStokAwal(outletId?: string): Promise<StokAwal[]> {
	let q = supabase
		.from('stok_awal')
		.select('id, outlet_id, status, dihitung_at, catatan, item:stok_awal_item(bahan_id, qty_hitung)')
		.order('dihitung_at', { ascending: false });
	if (outletId) q = q.eq('outlet_id', outletId);
	return (periksa(await q) as StokAwal[]).map((s) => ({ ...s, item: s.item.map((i) => ({ ...i, qty_hitung: angka(i.qty_hitung) })) }));
}

export async function ajukanStokAwal(outletId: string, item: ItemHitung[]): Promise<string> {
	return periksa(await supabase.rpc('ajukan_stok_awal', { p_outlet: outletId, p_item: item })) as string;
}

export async function putuskanStokAwal(id: string, setuju: boolean, item: ItemHitung[] | null, catatan: string | null): Promise<void> {
	periksa(await supabase.rpc('putuskan_stok_awal', { p_id: id, p_setuju: setuju, p_item: item, p_catatan: catatan }));
}

export async function muatBarangMasuk(outletId: string): Promise<BarangMasuk[]> {
	const rows = periksa(
		await supabase
			.from('barang_masuk')
			.select('id, outlet_id, tanggal, waktu, total, catatan, batal_at, batal_alasan, item:barang_masuk_item(satuan_beli_id, nama, qty, harga, subtotal)')
			.eq('outlet_id', outletId)
			.order('waktu', { ascending: false })
			.limit(50)
	) as BarangMasuk[];
	return rows.map((b) => ({
		...b,
		total: angka(b.total),
		item: b.item.map((i) => ({ ...i, qty: angka(i.qty), subtotal: angka(i.subtotal) }))
	}));
}

export async function catatBarangMasuk(p: KirimBarangMasuk): Promise<string> {
	return periksa(await supabase.rpc('catat_barang_masuk', { p })) as string;
}

export async function batalBarangMasuk(id: string, alasan: string): Promise<void> {
	periksa(await supabase.rpc('batal_barang_masuk', { p_id: id, p_alasan: alasan }));
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src/lib/stok && npm run check`
Expected: PASS; check 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stok
git commit -m "feat(stok): tampilan pack + potongan, isian hitungan, pesan galat & API stok"
```

---

### Task 5: Halaman stok admin (daftar, riwayat, ringkasan beranda)

**Files:**
- Create: `src/lib/components/stok/DaftarStok.svelte`, `src/lib/components/stok/RiwayatGerakan.svelte`, `src/lib/components/stok/RingkasanStok.svelte`, `src/routes/admin/stok/+page.svelte`
- Modify: `src/lib/components/layout/AdminNav.svelte`, `src/routes/admin/+page.svelte`
- Test: `src/lib/components/stok/stok-ui.test.ts`

**Interfaces:**
- Consumes: Task 4 (`susunStok`, `hitungRingkasan`, `LABEL_JENIS`, `angkaStok`, API), `formatWaktuWib` (`#lib/kasir/waktu.ts`), `muatOutlets` (`#lib/master/api.ts`).
- Produces: `DaftarStok` props `{ baris: BarisStok[]; tanpaStatus?: boolean; dipilih?: string | null; onpilih?: (b: BarisStok) => void }`; `RiwayatGerakan` props `{ gerakan: Gerakan[]; namaBahan: ReadonlyMap<string, string> }`; `RingkasanStok` (tanpa props). Rute `/admin/stok`.

- [ ] **Step 1: Tes render (gagal dulu)**

`src/lib/components/stok/stok-ui.test.ts`:
```ts
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import DaftarStok from './DaftarStok.svelte';
import RiwayatGerakan from './RiwayatGerakan.svelte';

const baris = [
	{ kunci: 'a', label: 'Ayam Ori', teks: '5 pack + 3 Sayap Ori', status: 'menipis' as const, bahan_id: ['d'] },
	{ kunci: 'k', label: 'Kemasan Kecil', teks: '-3 pcs', status: 'minus' as const, bahan_id: ['k'] },
	{ kunci: 'b', label: 'Beras', teks: '12,5 kg', status: 'aman' as const, bahan_id: ['b'] }
];

describe('DaftarStok', () => {
	it('menampilkan label, angka, dan tanda status', () => {
		const { body } = render(DaftarStok, { props: { baris } });
		expect(body).toContain('5 pack + 3 Sayap Ori');
		expect(body).toContain('Menipis');
		expect(body).toContain('Minus');
		expect(body).toContain('Aman');
	});
	it('tanpaStatus menyembunyikan tanda (stok awal belum disetujui)', () => {
		const { body } = render(DaftarStok, { props: { baris, tanpaStatus: true } });
		expect(body).not.toContain('Menipis');
		expect(body).not.toContain('Minus');
	});
	it('bisa dipilih bila ada onpilih (tombol dengan aria-pressed)', () => {
		const { body } = render(DaftarStok, { props: { baris, dipilih: 'a', onpilih: () => {} } });
		expect(body).toMatch(/<button[^>]*aria-pressed="true"/);
	});
});

describe('RiwayatGerakan', () => {
	it('jenis, nomor transaksi, jumlah bertanda, nama bahan', () => {
		const { body } = render(RiwayatGerakan, {
			props: {
				gerakan: [
					{ id: 2, bahan_id: 'd', qty: -2, jenis: 'jual' as const, waktu: '2026-10-06T05:00:00Z', nomor: 'BL-261006-001' },
					{ id: 1, bahan_id: 'd', qty: 15, jenis: 'masuk' as const, waktu: '2026-10-06T01:00:00Z', nomor: null }
				],
				namaBahan: new Map([['d', 'Dada Ori']])
			}
		});
		expect(body).toContain('Terjual');
		expect(body).toContain('BL-261006-001');
		expect(body).toContain('-2 Dada Ori');
		expect(body).toContain('+15 Dada Ori');
		expect(body).toContain('Barang masuk');
	});
	it('kosong → keterangan', () => {
		const { body } = render(RiwayatGerakan, { props: { gerakan: [], namaBahan: new Map() } });
		expect(body).toContain('Belum ada gerakan stok');
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/components/stok`
Expected: FAIL — komponen belum ada.

- [ ] **Step 3: Komponen**

`src/lib/components/stok/DaftarStok.svelte`:
```svelte
<script lang="ts">
	import type { BarisStok, StatusStok } from '#lib/stok/types.ts';

	let {
		baris,
		tanpaStatus = false,
		dipilih = null,
		onpilih
	}: { baris: BarisStok[]; tanpaStatus?: boolean; dipilih?: string | null; onpilih?: (b: BarisStok) => void } = $props();

	const LABEL: Record<StatusStok, string> = { aman: 'Aman', menipis: 'Menipis', minus: 'Minus' };
	const WARNA: Record<StatusStok, string> = {
		aman: 'bg-surface-2 text-muted',
		menipis: 'bg-accent text-on-accent',
		minus: 'border-2 border-danger text-danger'
	};
</script>

{#snippet isi(b: BarisStok)}
	<span class="min-w-0 flex-1">
		<span class="block font-semibold">{b.label}</span>
		<span class="tabular block text-sm text-muted">{b.teks}</span>
	</span>
	{#if !tanpaStatus}
		<span class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold {WARNA[b.status]}">{LABEL[b.status]}</span>
	{/if}
{/snippet}

<ul class="grid gap-2">
	{#each baris as b (b.kunci)}
		<li>
			{#if onpilih}
				<button
					type="button"
					aria-pressed={dipilih === b.kunci}
					onclick={() => onpilih(b)}
					class="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2 text-left hover:border-brand focus-visible:outline-3 focus-visible:outline-focus aria-pressed:border-brand"
				>
					{@render isi(b)}
				</button>
			{:else}
				<div class="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2">{@render isi(b)}</div>
			{/if}
		</li>
	{/each}
</ul>
```

`src/lib/components/stok/RiwayatGerakan.svelte`:
```svelte
<script lang="ts">
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { LABEL_JENIS, angkaStok } from '#lib/stok/tampil.ts';
	import type { Gerakan } from '#lib/stok/types.ts';

	let { gerakan, namaBahan }: { gerakan: Gerakan[]; namaBahan: ReadonlyMap<string, string> } = $props();
</script>

{#if gerakan.length === 0}
	<p class="rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada gerakan stok.</p>
{:else}
	<ul class="grid gap-1">
		{#each gerakan as g (g.id)}
			<li class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl bg-surface-2 px-3 py-2 text-sm">
				<span class="tabular text-muted">{formatWaktuWib(g.waktu)}</span>
				<span class="font-semibold">{LABEL_JENIS[g.jenis]}</span>
				{#if g.nomor}<span class="text-muted">{g.nomor}</span>{/if}
				<span class="tabular ml-auto font-bold {g.qty < 0 ? 'text-danger' : 'text-ok'}"
					>{g.qty > 0 ? '+' : ''}{angkaStok(g.qty)} {namaBahan.get(g.bahan_id) ?? ''}</span
				>
			</li>
		{/each}
	</ul>
{/if}
```

`src/lib/components/stok/RingkasanStok.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatDataStok, muatStok, muatStokAwal, petaStok } from '#lib/stok/api.ts';
	import { hitungRingkasan, susunStok } from '#lib/stok/tampil.ts';

	interface Baris {
		id: string;
		nama: string;
		teks: string;
		bahaya: boolean;
	}
	let baris = $state<Baris[]>([]);
	let gagal = $state('');

	onMount(async () => {
		try {
			const [outlets, data, stok, awal] = await Promise.all([muatOutlets(), muatDataStok(), muatStok(), muatStokAwal()]);
			baris = outlets
				.filter((o) => o.aktif)
				.map((o) => {
					const sah = awal.some((a) => a.outlet_id === o.id && a.status === 'disetujui');
					const menunggu = awal.some((a) => a.outlet_id === o.id && a.status === 'diajukan');
					if (!sah) return { id: o.id, nama: o.nama, teks: menunggu ? 'Stok awal menunggu persetujuan' : 'Belum ada stok awal', bahaya: menunggu };
					const r = hitungRingkasan(susunStok(data.bahan, data.satuan, data.isi, petaStok(stok, o.id)));
					const teks = r.minus + r.menipis === 0 ? 'Semua aman' : `${r.menipis} menipis, ${r.minus} minus`;
					return { id: o.id, nama: o.nama, teks, bahaya: r.minus > 0 };
				});
		} catch (e) {
			gagal = (e as Error).message;
		}
	});
</script>

<section class="mt-8">
	<h2 class="font-display text-2xl">Stok</h2>
	{#if gagal}<p class="mt-2 text-sm text-danger" role="alert">{gagal}</p>{/if}
	<ul class="mt-3 grid gap-3 sm:grid-cols-3">
		{#each baris as b (b.id)}
			<li>
				<a
					href={href('/admin/stok')}
					class="block rounded-2xl border bg-surface p-4 hover:border-brand focus-visible:outline-3 focus-visible:outline-focus {b.bahaya
						? 'border-danger'
						: 'border-line'}"
				>
					<p class="font-semibold">{b.nama}</p>
					<p class="text-sm {b.bahaya ? 'font-semibold text-danger' : 'text-muted'}">{b.teks}</p>
				</a>
			</li>
		{/each}
	</ul>
</section>
```

`src/routes/admin/stok/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import DaftarStok from '#lib/components/stok/DaftarStok.svelte';
	import RiwayatGerakan from '#lib/components/stok/RiwayatGerakan.svelte';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatDataStok, muatGerakan, muatStok, muatStokAwal, petaStok, type DataStok } from '#lib/stok/api.ts';
	import { susunStok } from '#lib/stok/tampil.ts';
	import type { BarisStok, Gerakan, StokAwal } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let outletId = $state<string | null>(null);
	let data = $state<DataStok | null>(null);
	let stok = $state<Map<string, number>>(new Map());
	let awal = $state<StokAwal[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let dipilih = $state<BarisStok | null>(null);
	let gerakan = $state<Gerakan[]>([]);
	let pesanRiwayat = $state('');

	async function muatSemua() {
		status = 'memuat';
		try {
			[outlets, data] = await Promise.all([muatOutlets(), muatDataStok()]);
			outletId ??= outlets.find((o) => o.aktif)?.id ?? null;
			await muatOutlet();
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}

	async function muatOutlet() {
		const id = outletId;
		if (!id) {
			status = 'siap';
			return;
		}
		status = 'memuat';
		dipilih = null;
		gerakan = [];
		try {
			const [s, a] = await Promise.all([muatStok(id), muatStokAwal(id)]);
			if (id !== outletId) return;
			stok = petaStok(s, id);
			awal = a;
			status = 'siap';
		} catch (e) {
			if (id !== outletId) return;
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muatSemua);

	function gantiOutlet(id: string) {
		outletId = id;
		void muatOutlet();
	}

	async function pilih(b: BarisStok) {
		dipilih = b;
		gerakan = [];
		pesanRiwayat = '';
		try {
			const g = await muatGerakan(outletId!, b.bahan_id);
			if (dipilih?.kunci === b.kunci) gerakan = g;
		} catch (e) {
			pesanRiwayat = (e as Error).message;
		}
	}

	const baris = $derived(data ? susunStok(data.bahan, data.satuan, data.isi, stok) : []);
	const disetujui = $derived(awal.some((a) => a.status === 'disetujui'));
	const menunggu = $derived(awal.some((a) => a.status === 'diajukan'));
	const namaBahan = $derived(new Map((data?.bahan ?? []).map((b) => [b.id, b.nama])));
</script>

<svelte:head><title>Stok · Admin · Kasir D'Kriuk</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
	<h1 class="font-display text-3xl">Stok</h1>
	<div class="flex flex-wrap gap-2">
		<a href={href('/admin/stok/masuk')} class="inline-flex min-h-12 items-center rounded-xl bg-brand px-4 font-semibold text-on-brand"
			>Barang masuk</a
		>
		<a href={href('/admin/stok/awal')} class="inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold"
			>Stok awal</a
		>
	</div>
</div>

<div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Pilih outlet">
	{#each outlets.filter((o) => o.aktif) as o (o.id)}
		<button
			type="button"
			aria-pressed={outletId === o.id}
			onclick={() => gantiOutlet(o.id)}
			class="min-h-12 rounded-xl border-2 border-line px-4 font-semibold aria-pressed:border-brand aria-pressed:text-brand">{o.nama}</button
		>
	{/each}
</div>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muatSemua}>Coba lagi</button>
{:else}
	{#if !disetujui}
		<p class="mt-4 rounded-xl border-2 border-warn bg-surface p-3 text-sm font-semibold" role="status">
			Belum ada stok awal untuk outlet ini{menunggu ? ' — ada ajuan yang menunggu persetujuan Anda' : ''}. Angka di bawah
			hanya dari barang masuk & penjualan, tanpa tanda menipis/minus.
			{#if menunggu}<a class="text-brand underline" href={href('/admin/stok/awal')}>Tinjau sekarang</a>{/if}
		</p>
	{/if}
	<div class="mt-4 grid gap-4 lg:grid-cols-2">
		<DaftarStok {baris} tanpaStatus={!disetujui} dipilih={dipilih?.kunci ?? null} onpilih={pilih} />
		<section aria-label="Riwayat gerakan" class="lg:sticky lg:top-20 lg:self-start">
			{#if dipilih}
				<h2 class="mb-2 font-display text-xl">Riwayat {dipilih.label}</h2>
				{#if pesanRiwayat}<p class="text-sm text-danger" role="alert">{pesanRiwayat}</p>{/if}
				<RiwayatGerakan {gerakan} {namaBahan} />
			{:else}
				<p class="rounded-xl bg-surface-2 p-4 text-sm text-muted">Ketuk satu bahan untuk melihat riwayatnya.</p>
			{/if}
		</section>
	</div>
{/if}
```

Di `src/lib/components/layout/AdminNav.svelte`, tambahkan item setelah Beranda:
```ts
		{ path: '/admin/stok', label: 'Stok' },
```

Di `src/routes/admin/+page.svelte`: tambahkan impor `import RingkasanStok from '#lib/components/stok/RingkasanStok.svelte';`, tambahkan ke awal array `pintasan`:
```ts
		{ path: '/admin/stok', judul: 'Stok', isi: 'Stok per outlet, barang masuk, stok awal.' },
```
dan sisipkan `<RingkasanStok />` tepat setelah penutup `</ul>` daftar pintasan.

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src && npm run check && npm run build`
Expected: PASS; 0 errors; build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/stok src/routes/admin/stok/+page.svelte src/lib/components/layout/AdminNav.svelte src/routes/admin/+page.svelte
git commit -m "feat(stok): halaman stok admin per outlet dengan riwayat & ringkasan di beranda"
```

---

### Task 6: Barang masuk (admin)

**Files:**
- Create: `src/lib/stok/masuk.ts`, `src/lib/components/stok/FormBarangMasuk.svelte`, `src/routes/admin/stok/masuk/+page.svelte`
- Test: `src/lib/stok/masuk.test.ts`

**Interfaces:**
- Consumes: `parseQty`, `parseRupiah`, `formatAngka` (`#lib/master/rupiah.ts`); `SatuanBeli`, `HargaBeli`; `muatOutlets`, `muatSatuanBeli`, `muatHargaBeli`; Task 4 `catatBarangMasuk`, `batalBarangMasuk`, `muatBarangMasuk`; `tanggalWib`, `formatWaktuWib`; `Konfirmasi`, `Button`.
- Produces: `interface BarisMasuk { satuan_beli_id: string; qty: string; harga: string }`; `periksaBarangMasuk(baris, satuan): { item: KirimBarangMasuk['item']; galat: string[]; total: number }`; `hargaOutlet(satuanId, hargaBeli, outletId): number | null`; `hargaAwal(s, hargaBeli, outletId): string`; `FormBarangMasuk` props `{ outlet: Outlet; satuan: SatuanBeli[]; hargaBeli: HargaBeli[]; onsimpan: (p: KirimBarangMasuk) => Promise<void> }`.

- [ ] **Step 1: Tes (gagal dulu)**

`src/lib/stok/masuk.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
import { hargaAwal, hargaOutlet, periksaBarangMasuk } from './masuk';

const s = (id: string, harga_tetap = true): SatuanBeli => ({ id, kode: id, nama: id, ambang: null, harga_tetap, urutan: 0, aktif: true });
const satuan = [s('ayam'), s('beras', false)];
const harga: HargaBeli[] = [
	{ outlet_id: 'bl', satuan_beli_id: 'ayam', harga: 40000, diubah_at: '' },
	{ outlet_id: 'bl', satuan_beli_id: 'beras', harga: 12340, diubah_at: '' }
];

describe('periksaBarangMasuk', () => {
	it('baris sah → item angka & total dibulatkan', () => {
		const r = periksaBarangMasuk(
			[
				{ satuan_beli_id: 'ayam', qty: '2', harga: '40.000' },
				{ satuan_beli_id: 'beras', qty: '1,5', harga: '12341' }
			],
			satuan
		);
		expect(r.galat).toEqual(['', '']);
		expect(r.item).toEqual([
			{ satuan_beli_id: 'ayam', qty: 2, harga: 40000 },
			{ satuan_beli_id: 'beras', qty: 1.5, harga: 12341 }
		]);
		expect(r.total).toBe(80000 + 18512);
	});
	it('galat per baris: jumlah salah, harga berubah-ubah 0/kosong, harga bukan angka', () => {
		expect(periksaBarangMasuk([{ satuan_beli_id: 'ayam', qty: '0', harga: '1' }], satuan).galat[0]).toMatch(/Jumlah/);
		expect(periksaBarangMasuk([{ satuan_beli_id: 'beras', qty: '1', harga: '0' }], satuan).galat[0]).toMatch(/wajib/);
		expect(periksaBarangMasuk([{ satuan_beli_id: 'beras', qty: '1', harga: '' }], satuan).galat[0]).toMatch(/wajib/);
		expect(periksaBarangMasuk([{ satuan_beli_id: 'ayam', qty: '1', harga: 'abc' }], satuan).galat[0]).toMatch(/Harga tidak sah/);
	});
	it('barang ganda: kedua baris ditandai, tidak ada item terkirim', () => {
		const r = periksaBarangMasuk(
			[
				{ satuan_beli_id: 'ayam', qty: '1', harga: '1' },
				{ satuan_beli_id: 'ayam', qty: '2', harga: '1' }
			],
			satuan
		);
		expect(r.galat.every((g) => /sudah ada/.test(g))).toBe(true);
		expect(r.item).toEqual([]);
	});
});

describe('harga awal', () => {
	it('harga tetap terisi dari harga outlet; harga berubah-ubah dikosongkan (acuan saja)', () => {
		expect(hargaAwal(satuan[0], harga, 'bl')).toBe('40.000');
		expect(hargaAwal(satuan[1], harga, 'bl')).toBe('');
		expect(hargaAwal(satuan[0], harga, 'kp')).toBe('');
		expect(hargaOutlet('beras', harga, 'bl')).toBe(12340);
		expect(hargaOutlet('beras', harga, 'kp')).toBeNull();
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/stok/masuk.test.ts`
Expected: FAIL — `./masuk` belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/stok/masuk.ts`:
```ts
// Validasi formulir barang masuk sebelum dikirim (server memeriksa lagi).
import { formatAngka, parseQty, parseRupiah } from '#lib/master/rupiah.ts';
import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
import type { KirimBarangMasuk } from './types.ts';

export interface BarisMasuk {
	satuan_beli_id: string;
	qty: string;
	harga: string;
}

export function hargaOutlet(satuanId: string, hargaBeli: HargaBeli[], outletId: string): number | null {
	return hargaBeli.find((h) => h.outlet_id === outletId && h.satuan_beli_id === satuanId)?.harga ?? null;
}

/** Harga tetap: diisi dari harga outlet. Harga berubah-ubah: kosong (wajib diketik tiap beli). */
export function hargaAwal(s: SatuanBeli, hargaBeli: HargaBeli[], outletId: string): string {
	const h = hargaOutlet(s.id, hargaBeli, outletId);
	return s.harga_tetap && h !== null ? formatAngka(h) : '';
}

export function periksaBarangMasuk(
	baris: BarisMasuk[],
	satuan: SatuanBeli[]
): { item: KirimBarangMasuk['item']; galat: string[]; total: number } {
	const item: KirimBarangMasuk['item'] = [];
	const galat = baris.map(() => '');
	const hitung = new Map<string, number>();
	for (const r of baris) hitung.set(r.satuan_beli_id, (hitung.get(r.satuan_beli_id) ?? 0) + 1);
	let total = 0;
	baris.forEach((r, i) => {
		const s = satuan.find((x) => x.id === r.satuan_beli_id);
		const qty = parseQty(r.qty, 3);
		const harga = r.harga.trim() === '' ? null : parseRupiah(r.harga);
		if (!s) galat[i] = 'Pilih barang.';
		else if ((hitung.get(r.satuan_beli_id) ?? 0) > 1) galat[i] = 'Barang ini sudah ada di baris lain; gabungkan jumlahnya.';
		else if (qty === null) galat[i] = 'Jumlah tidak sah (mis. 2 atau 1,5).';
		else if (!s.harga_tetap && (harga === null || harga === 0)) galat[i] = 'Harga wajib diisi (harganya berubah-ubah).';
		else if (harga === null) galat[i] = 'Harga tidak sah (mis. 40.000).';
		else {
			item.push({ satuan_beli_id: s.id, qty, harga });
			total += Math.round(qty * harga);
		}
	});
	return { item, galat, total };
}
```

`src/lib/components/stok/FormBarangMasuk.svelte`:
```svelte
<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import { tanggalWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
	import { hargaAwal, hargaOutlet, periksaBarangMasuk, type BarisMasuk } from '#lib/stok/masuk.ts';
	import type { KirimBarangMasuk } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let {
		outlet,
		satuan,
		hargaBeli,
		onsimpan
	}: { outlet: Outlet; satuan: SatuanBeli[]; hargaBeli: HargaBeli[]; onsimpan: (p: KirimBarangMasuk) => Promise<void> } = $props();

	const hariIni = tanggalWib(new Date());
	const batasBawah = tanggalWib(new Date(Date.now() - 7 * 86_400_000));
	// id dibuat sekali per formulir: simpan ditekan dua kali tidak menggandakan.
	let id = $state(crypto.randomUUID());
	let tanggal = $state(hariIni);
	let catatan = $state('');
	let baris = $state<BarisMasuk[]>([]);
	let pilihan = $state('');
	let menyimpan = $state(false);
	let pesan = $state('');
	let tercatat = $state('');

	const aktif = $derived(satuan.filter((s) => s.aktif));
	const cek = $derived(periksaBarangMasuk(baris, satuan));
	const nama = (sid: string) => satuan.find((s) => s.id === sid)?.nama ?? '';
	const tetap = (sid: string) => satuan.find((s) => s.id === sid)?.harga_tetap ?? true;
	const kotak =
		'tabular min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-right text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none';

	function tambahBaris() {
		const s = satuan.find((x) => x.id === pilihan);
		if (!s) return;
		baris = [...baris, { satuan_beli_id: s.id, qty: '1', harga: hargaAwal(s, hargaBeli, outlet.id) }];
		pilihan = '';
	}

	async function simpan(e: SubmitEvent) {
		e.preventDefault();
		pesan = '';
		tercatat = '';
		if (baris.length === 0) {
			pesan = 'Tambahkan minimal satu barang.';
			return;
		}
		if (cek.galat.some(Boolean)) {
			pesan = 'Periksa baris yang ditandai merah.';
			return;
		}
		menyimpan = true;
		try {
			await onsimpan({ id, outlet_id: outlet.id, tanggal, ...(catatan.trim() ? { catatan: catatan.trim() } : {}), item: cek.item });
			tercatat = `Tersimpan: Rp${formatAngka(cek.total)} masuk ke ${outlet.nama}.`;
			id = crypto.randomUUID();
			baris = [];
			catatan = '';
			tanggal = hariIni;
		} catch (err) {
			pesan = (err as Error).message;
		} finally {
			menyimpan = false;
		}
	}
</script>

<form class="grid gap-4 rounded-2xl border border-line bg-surface p-4" onsubmit={simpan} novalidate>
	<h2 class="font-display text-xl">Catat barang masuk — {outlet.nama}</h2>
	<div class="grid gap-1.5">
		<label for="tanggal-masuk" class="text-sm font-semibold">Tanggal barang datang</label>
		<input id="tanggal-masuk" type="date" bind:value={tanggal} min={batasBawah} max={hariIni} class="{kotak} w-48 text-left" />
	</div>

	<div class="flex flex-wrap items-end gap-2">
		<div class="grid min-w-0 flex-1 gap-1.5">
			<label for="pilih-barang" class="text-sm font-semibold">Barang</label>
			<select id="pilih-barang" bind:value={pilihan} class="{kotak} text-left">
				<option value="">Pilih barang…</option>
				{#each aktif as s (s.id)}<option value={s.id}>{s.nama}</option>{/each}
			</select>
		</div>
		<Button variant="secondary" onclick={tambahBaris} disabled={!pilihan}>Tambah</Button>
	</div>

	{#if baris.length}
		<ul class="grid gap-2">
			{#each baris as r, i (r.satuan_beli_id + i)}
				<li class="grid gap-2 rounded-xl bg-surface-2 p-3">
					<p class="font-semibold">{nama(r.satuan_beli_id)}</p>
					<div class="flex flex-wrap items-center gap-2">
						<input aria-label="Jumlah {nama(r.satuan_beli_id)}" bind:value={r.qty} inputmode="decimal" class="{kotak} w-24" />
						<span class="text-sm text-muted">×</span>
						<span class="text-sm text-muted">Rp</span>
						<input
							aria-label="Harga per satuan {nama(r.satuan_beli_id)}"
							bind:value={r.harga}
							inputmode="numeric"
							placeholder={tetap(r.satuan_beli_id)
								? ''
								: `acuan ${formatAngka(hargaOutlet(r.satuan_beli_id, hargaBeli, outlet.id) ?? 0)}`}
							class="{kotak} w-36"
						/>
						<button
							type="button"
							class="ml-auto min-h-12 rounded-xl px-3 text-sm text-danger hover:bg-surface"
							onclick={() => (baris = baris.filter((_, j) => j !== i))}>Hapus</button
						>
					</div>
					{#if cek.galat[i]}<p class="text-sm text-danger" role="alert">{cek.galat[i]}</p>{/if}
				</li>
			{/each}
		</ul>
		<p class="flex items-baseline justify-between text-lg font-bold">
			<span>Total</span><span class="tabular font-display text-2xl text-brand">Rp{formatAngka(cek.total)}</span>
		</p>
	{/if}

	<div class="grid gap-1.5">
		<label for="catatan-masuk" class="text-sm font-semibold">Catatan (opsional)</label>
		<input id="catatan-masuk" bind:value={catatan} maxlength="200" class="{kotak} text-left" placeholder="mis. dari stokis Pak Budi" />
	</div>
	{#if pesan}<p class="text-sm font-semibold text-danger" role="alert">{pesan}</p>{/if}
	{#if tercatat}<p class="text-sm font-semibold text-ok" role="status">{tercatat}</p>{/if}
	<Button type="submit" class="min-h-14 text-lg" loading={menyimpan}>Simpan barang masuk</Button>
</form>
```

`src/routes/admin/stok/masuk/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import FormBarangMasuk from '#lib/components/stok/FormBarangMasuk.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatHargaBeli, muatOutlets, muatSatuanBeli } from '#lib/master/api.ts';
	import { formatAngka, formatQty } from '#lib/master/rupiah.ts';
	import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
	import { href } from '#lib/nav.ts';
	import { batalBarangMasuk, catatBarangMasuk, muatBarangMasuk } from '#lib/stok/api.ts';
	import type { BarangMasuk, KirimBarangMasuk } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let satuan = $state<SatuanBeli[]>([]);
	let hargaBeli = $state<HargaBeli[]>([]);
	let outletId = $state<string | null>(null);
	let daftar = $state<BarangMasuk[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	const outlet = $derived(outlets.find((o) => o.id === outletId) ?? null);

	async function muatSemua() {
		status = 'memuat';
		try {
			[outlets, satuan, hargaBeli] = await Promise.all([muatOutlets(), muatSatuanBeli(), muatHargaBeli()]);
			outletId ??= outlets.find((o) => o.aktif)?.id ?? null;
			await muatDaftar();
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	async function muatDaftar() {
		const id = outletId;
		if (!id) return;
		const d = await muatBarangMasuk(id);
		if (id === outletId) daftar = d;
	}
	onMount(muatSemua);

	function gantiOutlet(id: string) {
		outletId = id;
		daftar = [];
		muatDaftar().catch((e) => (pesan = (e as Error).message));
	}

	async function simpan(p: KirimBarangMasuk) {
		await catatBarangMasuk(p);
		await muatDaftar();
	}

	async function batal(b: BarangMasuk) {
		pesanBaris[b.id] = '';
		try {
			await batalBarangMasuk(b.id, alasan[b.id] ?? '');
			await muatDaftar();
		} catch (e) {
			pesanBaris[b.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Barang Masuk · Admin · Kasir D'Kriuk</title></svelte:head>

<a href={href('/admin/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-3xl">Barang masuk</h1>
<p class="mt-1 max-w-prose text-muted">Isi pack dipecah otomatis ke bahan. Nilainya tersimpan sebagai pengeluaran outlet (laporan di Tahap 5).</p>

<div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Pilih outlet">
	{#each outlets.filter((o) => o.aktif) as o (o.id)}
		<button
			type="button"
			aria-pressed={outletId === o.id}
			onclick={() => gantiOutlet(o.id)}
			class="min-h-12 rounded-xl border-2 border-line px-4 font-semibold aria-pressed:border-brand aria-pressed:text-brand">{o.nama}</button
		>
	{/each}
</div>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muatSemua}>Coba lagi</button>
{:else if outlet}
	<div class="mt-4 grid gap-6 lg:grid-cols-2">
		{#key outlet.id}<FormBarangMasuk {outlet} {satuan} {hargaBeli} onsimpan={simpan} />{/key}
		<section aria-label="Barang masuk terakhir">
			<h2 class="font-display text-xl">Terakhir di {outlet.nama}</h2>
			{#if daftar.length === 0}
				<p class="mt-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada barang masuk.</p>
			{:else}
				<ul class="mt-2 grid gap-2">
					{#each daftar as b (b.id)}
						<li class="rounded-2xl border border-line bg-surface p-3 {b.batal_at ? 'opacity-60' : ''}">
							<div class="flex flex-wrap items-baseline justify-between gap-2">
								<span class="text-sm text-muted">{formatWaktuWib(b.waktu)}</span>
								<span class="tabular font-bold">Rp{formatAngka(b.total)}</span>
							</div>
							<ul class="mt-1 text-sm">
								{#each b.item as i (i.satuan_beli_id)}<li>{formatQty(i.qty)} × {i.nama} @ Rp{formatAngka(i.harga)}</li>{/each}
							</ul>
							{#if b.catatan}<p class="mt-1 text-sm text-muted">{b.catatan}</p>{/if}
							{#if b.batal_at}
								<p class="mt-1 text-sm font-semibold text-danger">Dibatalkan: {b.batal_alasan}</p>
							{:else}
								<div class="mt-2 flex flex-wrap items-center gap-2">
									<label class="sr-only" for="alasan-{b.id}">Alasan pembatalan</label>
									<input
										id="alasan-{b.id}"
										bind:value={alasan[b.id]}
										maxlength="200"
										placeholder="Alasan batal, mis. salah input"
										class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3"
									/>
									<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(b)} />
								</div>
								{#if pesanBaris[b.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[b.id]}</p>{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
{/if}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src && npm run check && npm run build`
Expected: PASS; 0 errors; build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stok/masuk.ts src/lib/stok/masuk.test.ts src/lib/components/stok/FormBarangMasuk.svelte src/routes/admin/stok/masuk/+page.svelte
git commit -m "feat(stok): admin mencatat & membatalkan barang masuk per outlet"
```

---

### Task 7: Stok awal (kasir mengisi, admin meninjau) & tab Stok kasir

**Files:**
- Create: `src/lib/components/stok/FormStokAwal.svelte`, `src/routes/kasir/stok/+page.svelte`, `src/routes/kasir/stok/awal/+page.svelte`, `src/routes/admin/stok/awal/+page.svelte`
- Modify: `src/lib/components/kasir/KasirNav.svelte`
- Test: `src/lib/components/kasir/kasir-ui.test.ts`, `src/lib/components/stok/stok-ui.test.ts`

**Interfaces:**
- Consumes: Task 4 (`bentukIsian`, `kumpulkanIsian`, `teksDari`, `muatDataStok`, `muatStok`, `muatStokAwal`, `ajukanStokAwal`, `putuskanStokAwal`, `petaStok`, `susunStok`), `DaftarStok` (Task 5), `pos` (`#lib/kasir/pos.svelte.ts`), `auth`.
- Produces: `FormStokAwal` props `{ isian: Isian[]; awal?: ReadonlyMap<string, number>; labelKirim: string; onkirim: (item: ItemHitung[]) => Promise<void> }`; rute `/kasir/stok`, `/kasir/stok/awal`, `/admin/stok/awal`; KasirNav 4 tujuan.

- [ ] **Step 1: Tes (gagal dulu)**

Di `src/lib/components/kasir/kasir-ui.test.ts`, ganti tes `KasirNav` menjadi:
```ts
describe('KasirNav', () => {
	it('empat tujuan kasir dengan halaman aktif ditandai (termasuk sub-halaman Stok)', () => {
		const { body } = render(KasirNav, { props: { aktif: '/kasir/stok/awal' } });
		for (const p of ['/kasir', '/kasir/riwayat', '/kasir/stok', '/kasir/tutup']) expect(body).toContain(`href="#${p}"`);
		expect(body).toMatch(/href="#\/kasir\/stok"[^>]*aria-current="page"/);
		expect(body).not.toMatch(/href="#\/kasir"[^>]*aria-current="page"/);
	});
});
```

Tambahkan ke akhir `src/lib/components/stok/stok-ui.test.ts`:
```ts
import FormStokAwal from './FormStokAwal.svelte';

describe('FormStokAwal', () => {
	it('kotak pack + lepas untuk bahan berpack, satu kotak untuk ayam; terisi dari jumlah awal', () => {
		const { body } = render(FormStokAwal, {
			props: {
				isian: [
					{ bahan_id: 'd', label: 'Dada Ori', jenis: 'satu' as const, satuan: 'potong', desimal: false },
					{ bahan_id: 'k', label: 'Kemasan Kecil', jenis: 'pack' as const, satuan: 'pcs', isi: 100 }
				],
				awal: new Map([['k', 340]]),
				labelKirim: 'Kirim ke admin',
				onkirim: async () => {}
			}
		});
		expect(body).toMatch(/aria-label="Dada Ori \(potong\)"/);
		expect(body).toMatch(/aria-label="Kemasan Kecil: jumlah pack utuh"[^>]*value="3"|value="3"[^>]*aria-label="Kemasan Kecil: jumlah pack utuh"/);
		expect(body).toMatch(/aria-label="Kemasan Kecil: pcs lepas"[^>]*value="40"|value="40"[^>]*aria-label="Kemasan Kecil: pcs lepas"/);
		expect(body).toContain('Kirim ke admin');
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/components`
Expected: FAIL — KasirNav belum punya Stok; `FormStokAwal.svelte` belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/components/kasir/KasirNav.svelte` — ganti `ITEM` dan penanda aktif:
```ts
	const ITEM = [
		{ path: '/kasir', label: 'Jualan' },
		{ path: '/kasir/riwayat', label: 'Riwayat' },
		{ path: '/kasir/stok', label: 'Stok' },
		{ path: '/kasir/tutup', label: 'Tutup toko' }
	] as const;

	const sedang = (p: string) => (p === '/kasir' ? aktif === '/kasir' : aktif === p || aktif.startsWith(`${p}/`));
```
dan ubah `aria-current={aktif === i.path ? 'page' : undefined}` menjadi `aria-current={sedang(i.path) ? 'page' : undefined}`.

`src/lib/components/stok/FormStokAwal.svelte`:
```svelte
<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { kumpulkanIsian, teksDari, type Isian, type TeksIsian } from '#lib/stok/isian.ts';
	import type { ItemHitung } from '#lib/stok/types.ts';

	let {
		isian,
		awal = new Map(),
		labelKirim,
		onkirim
	}: { isian: Isian[]; awal?: ReadonlyMap<string, number>; labelKirim: string; onkirim: (item: ItemHitung[]) => Promise<void> } = $props();

	// Nilai awal diambil sekali; induk memakai {#key} bila sumbernya berganti.
	let teks = $state<TeksIsian>(untrack(() => teksDari(isian, awal)));
	let galat = $state<Record<string, string>>({});
	let pesan = $state('');
	let mengirim = $state(false);
	const kotak =
		'tabular min-h-12 w-20 rounded-xl border border-line-strong bg-surface px-3 text-right text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none';

	async function kirim(e: SubmitEvent) {
		e.preventDefault();
		pesan = '';
		const h = kumpulkanIsian(isian, teks);
		galat = h.galat;
		if (Object.keys(h.galat).length) {
			pesan = 'Ada isian yang belum benar. Periksa yang ditandai merah.';
			return;
		}
		mengirim = true;
		try {
			await onkirim(h.item);
		} catch (err) {
			pesan = (err as Error).message;
		} finally {
			mengirim = false;
		}
	}
</script>

<form class="grid gap-3" onsubmit={kirim} novalidate>
	<ul class="grid gap-2">
		{#each isian as f (f.bahan_id)}
			<li class="grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[1fr_auto] sm:items-center">
				<p class="font-semibold">{f.label}</p>
				<div class="flex flex-wrap items-center gap-2">
					{#if f.jenis === 'pack'}
						<input aria-label="{f.label}: jumlah pack utuh" bind:value={teks[f.bahan_id].a} inputmode="numeric" class={kotak} />
						<span class="text-sm text-muted">pack (isi {f.isi}) +</span>
						<input aria-label="{f.label}: {f.satuan} lepas" bind:value={teks[f.bahan_id].b} inputmode="numeric" class={kotak} />
						<span class="text-sm text-muted">{f.satuan}</span>
					{:else}
						<input
							aria-label="{f.label} ({f.satuan})"
							bind:value={teks[f.bahan_id].a}
							inputmode={f.desimal ? 'decimal' : 'numeric'}
							class={kotak}
						/>
						<span class="text-sm text-muted">{f.satuan}</span>
					{/if}
				</div>
				{#if galat[f.bahan_id]}<p class="text-sm text-danger sm:col-span-2" role="alert">{galat[f.bahan_id]}</p>{/if}
			</li>
		{/each}
	</ul>
	{#if pesan}<p class="text-sm font-semibold text-danger" role="alert">{pesan}</p>{/if}
	<Button type="submit" class="min-h-14 text-lg" loading={mengirim}>{labelKirim}</Button>
</form>
```

`src/routes/kasir/stok/+page.svelte`:
```svelte
<script lang="ts">
	import DaftarStok from '#lib/components/stok/DaftarStok.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { muatDataStok, muatStok, muatStokAwal, petaStok, type DataStok } from '#lib/stok/api.ts';
	import { susunStok } from '#lib/stok/tampil.ts';
	import type { StokAwal } from '#lib/stok/types.ts';

	let data = $state<DataStok | null>(null);
	let stok = $state<Map<string, number>>(new Map());
	let awal = $state<StokAwal[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let ulang = $state(0);

	$effect(() => {
		const o = pos.outlet;
		void ulang;
		if (!o) return;
		let batal = false;
		status = 'memuat';
		Promise.all([muatDataStok(), muatStok(o.id), muatStokAwal(o.id)])
			.then(([d, s, a]) => {
				if (batal) return;
				data = d;
				stok = petaStok(s, o.id);
				awal = a;
				status = 'siap';
			})
			.catch((e) => {
				if (batal) return;
				pesan = (e as Error).message;
				status = 'gagal';
			});
		return () => {
			batal = true;
		};
	});

	const baris = $derived(data ? susunStok(data.bahan, data.satuan, data.isi, stok) : []);
	const disetujui = $derived(awal.some((a) => a.status === 'disetujui'));
	const menunggu = $derived(awal.some((a) => a.status === 'diajukan'));
	const ditolak = $derived(!disetujui && !menunggu ? awal.find((a) => a.status === 'ditolak') : undefined);
</script>

<svelte:head><title>Stok · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-2xl">Stok {pos.outlet?.nama}</h1>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ulang++}>Coba lagi</button>
{:else}
	{#if !disetujui}
		<div class="mt-4 rounded-2xl border-2 border-warn bg-surface p-4">
			{#if menunggu}
				<p class="font-semibold">Stok awal sudah dikirim, menunggu persetujuan admin.</p>
			{:else}
				<p class="font-semibold">Stok awal belum diisi.</p>
				<p class="mt-1 text-sm text-muted">Hitung semua bahan di outlet, lalu kirim ke admin. Jualan tetap bisa jalan.</p>
				{#if ditolak?.catatan}<p class="mt-1 text-sm text-danger">Ditolak admin: {ditolak.catatan}</p>{/if}
				<a href={href('/kasir/stok/awal')} class="mt-3 inline-flex min-h-12 items-center rounded-xl bg-brand px-4 font-semibold text-on-brand"
					>Isi stok awal</a
				>
			{/if}
		</div>
	{/if}
	<div class="mt-4"><DaftarStok {baris} tanpaStatus={!disetujui} /></div>
{/if}
```

`src/routes/kasir/stok/awal/+page.svelte`:
```svelte
<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { ajukanStokAwal, muatDataStok, muatStokAwal, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import type { ItemHitung, StokAwal } from '#lib/stok/types.ts';

	let data = $state<DataStok | null>(null);
	let awal = $state<StokAwal[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let terkirim = $state(false);

	$effect(() => {
		const o = pos.outlet;
		if (!o) return;
		let batal = false;
		status = 'memuat';
		Promise.all([muatDataStok(), muatStokAwal(o.id)])
			.then(([d, a]) => {
				if (batal) return;
				data = d;
				awal = a;
				status = 'siap';
			})
			.catch((e) => {
				if (batal) return;
				pesan = (e as Error).message;
				status = 'gagal';
			});
		return () => {
			batal = true;
		};
	});

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const bisa = $derived(!awal.some((a) => a.status === 'diajukan' || a.status === 'disetujui'));

	async function kirim(item: ItemHitung[]) {
		await ajukanStokAwal(pos.outlet!.id, item);
		terkirim = true;
	}
</script>

<svelte:head><title>Isi Stok Awal · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Isi stok awal {pos.outlet?.nama}</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Hitung semua bahan yang ada sekarang. Ayam dihitung per potongan. Isi 0 bila habis. Penjualan setelah dikirim tetap
	memotong stok otomatis.
</p>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else if terkirim}
	<p class="mt-4 rounded-xl bg-surface-2 p-4 font-semibold text-ok" role="status">Terkirim. Menunggu persetujuan admin.</p>
	<a href={href('/kasir/stok')} class="mt-3 inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Kembali ke Stok</a>
{:else if !bisa}
	<p class="mt-4 rounded-xl bg-surface-2 p-4">Stok awal outlet ini sudah dikirim atau sudah disetujui.</p>
{:else}
	<div class="mt-4"><FormStokAwal {isian} labelKirim="Kirim ke admin" onkirim={kirim} /></div>
{/if}
```

`src/routes/admin/stok/awal/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatDataStok, muatStokAwal, putuskanStokAwal, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import type { ItemHitung, StokAwal } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let data = $state<DataStok | null>(null);
	let ajuan = $state<StokAwal[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		status = 'memuat';
		try {
			[outlets, data, ajuan] = await Promise.all([muatOutlets(), muatDataStok(), muatStokAwal()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const namaOutlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '';
	const menunggu = $derived(ajuan.filter((a) => a.status === 'diajukan'));
	const selesai = $derived(ajuan.filter((a) => a.status !== 'diajukan'));

	async function setujui(a: StokAwal, item: ItemHitung[]) {
		await putuskanStokAwal(a.id, true, item, null);
		await muat();
	}
	async function tolak(a: StokAwal) {
		pesanBaris[a.id] = '';
		try {
			await putuskanStokAwal(a.id, false, null, alasan[a.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[a.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Stok Awal · Admin · Kasir D'Kriuk</title></svelte:head>

<a href={href('/admin/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-3xl">Stok awal</h1>
<p class="mt-1 max-w-prose text-muted">
	Periksa hitungan kasir, betulkan bila perlu, lalu setujui. Hitungan berlaku pada saat kasir menghitung; penjualan
	sesudahnya tetap memotong.
</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#if menunggu.length === 0}
		<p class="mt-6 rounded-xl bg-surface-2 p-4 text-sm text-muted">Tidak ada ajuan yang menunggu.</p>
	{/if}
	{#each menunggu as a (a.id)}
		<section class="mt-6 grid gap-3 rounded-2xl border-2 border-brand p-4" aria-label="Ajuan {namaOutlet(a.outlet_id)}">
			<h2 class="font-display text-xl">{namaOutlet(a.outlet_id)} — dihitung {formatWaktuWib(a.dihitung_at)}</h2>
			{#key a.id}
				<FormStokAwal
					{isian}
					awal={new Map(a.item.map((i) => [i.bahan_id, i.qty_hitung]))}
					labelKirim="Setujui stok awal"
					onkirim={(item) => setujui(a, item)}
				/>
			{/key}
			<div class="flex flex-wrap items-center gap-2 border-t border-line pt-3">
				<label class="sr-only" for="tolak-{a.id}">Alasan penolakan</label>
				<input
					id="tolak-{a.id}"
					bind:value={alasan[a.id]}
					maxlength="200"
					placeholder="Alasan tolak, mis. hitung ulang ayam"
					class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3"
				/>
				<Konfirmasi label="Tolak" konfirmasiLabel="Ya, tolak" variant="ghost" onkonfirmasi={() => tolak(a)} />
			</div>
			{#if pesanBaris[a.id]}<p class="text-sm text-danger" role="alert">{pesanBaris[a.id]}</p>{/if}
		</section>
	{/each}

	{#if selesai.length}
		<h2 class="mt-8 font-display text-xl">Riwayat</h2>
		<ul class="mt-2 grid gap-2">
			{#each selesai as a (a.id)}
				<li class="rounded-xl bg-surface-2 px-3 py-2 text-sm">
					<span class="font-semibold">{namaOutlet(a.outlet_id)}</span> — {a.status === 'disetujui' ? 'Disetujui' : 'Ditolak'},
					dihitung {formatWaktuWib(a.dihitung_at)}{a.catatan ? ` — ${a.catatan}` : ''}
				</li>
			{/each}
		</ul>
	{/if}
{/if}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src && npm run check && npm run build`
Expected: PASS; 0 errors; build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/stok/FormStokAwal.svelte src/lib/components/stok/stok-ui.test.ts src/lib/components/kasir src/routes/kasir/stok src/routes/admin/stok/awal
git commit -m "feat(stok): stok awal diisi kasir & disetujui admin; tab Stok di kasir"
```

---

### Task 8: Pita peringatan stok minus di layar jualan

**Files:**
- Create: `src/lib/components/stok/PitaMinus.svelte`
- Modify: `src/routes/kasir/+page.svelte`
- Test: `src/lib/components/stok/stok-ui.test.ts`

**Interfaces:**
- Consumes: Task 4 API & `susunStok`.
- Produces: `PitaMinus` props `{ outletId: string; segar?: number }` — memuat ulang saat `segar` berubah; hanya tampil bila stok awal outlet sudah disetujui dan ada bahan minus. Galat jaringan diabaikan (peringatan, bukan penghalang jualan).

- [ ] **Step 1: Tes render (gagal dulu)**

Tambahkan ke akhir `src/lib/components/stok/stok-ui.test.ts`:
```ts
import PitaMinus from './PitaMinus.svelte';

describe('PitaMinus', () => {
	it('render awal (server) tidak menampilkan apa pun sebelum data dimuat', () => {
		const { body } = render(PitaMinus, { props: { outletId: 'o' } });
		expect(body).not.toContain('Stok minus');
	});
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npx vitest run src/lib/components/stok`
Expected: FAIL — `PitaMinus.svelte` belum ada.

- [ ] **Step 3: Implementasi**

`src/lib/components/stok/PitaMinus.svelte`:
```svelte
<script lang="ts">
	import { muatDataStok, muatStok, muatStokAwal, petaStok, type DataStok } from '#lib/stok/api.ts';
	import { susunStok } from '#lib/stok/tampil.ts';

	let { outletId, segar = 0 }: { outletId: string; segar?: number } = $props();

	let minus = $state<string[]>([]);
	// Data master & status stok awal jarang berubah: dimuat sekali per halaman.
	let data: DataStok | null = null;
	let sah = false;

	$effect(() => {
		const id = outletId;
		void segar;
		let batal = false;
		(async () => {
			try {
				data ??= await muatDataStok();
				if (!sah) sah = (await muatStokAwal(id)).some((a) => a.status === 'disetujui');
				if (!sah) {
					if (!batal) minus = [];
					return;
				}
				const s = await muatStok(id);
				if (batal) return;
				minus = susunStok(data.bahan, data.satuan, data.isi, petaStok(s, id))
					.filter((b) => b.status === 'minus')
					.map((b) => b.label);
			} catch {
				// Hanya peringatan: galat jaringan tidak boleh mengganggu jualan.
			}
		})();
		return () => {
			batal = true;
		};
	});
</script>

{#if minus.length}
	<p class="mb-3 rounded-xl border-2 border-danger bg-surface px-4 py-2 text-sm font-semibold text-danger" role="status">
		Stok minus: {minus.join(', ')} — lapor admin.
	</p>
{/if}
```

Di `src/routes/kasir/+page.svelte`:
1. Tambahkan impor: `import PitaMinus from '#lib/components/stok/PitaMinus.svelte';`
2. Tambahkan state di bawah `let muatUlang = $state(0);`: `let segarStok = $state(0);`
3. Di `bayar()`, tepat setelah `tahap = 'selesai';` tambahkan `segarStok++;`
4. Di blok jualan (cabang `{:else}` terakhir), tepat setelah `</div>` penutup baris judul + `PrinterChip`, sisipkan:
```svelte
	{#if pos.outlet}<PitaMinus outletId={pos.outlet.id} segar={segarStok} />{/if}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npx vitest run src && npm run check && npm run build`
Expected: PASS; 0 errors; build sukses.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/stok/PitaMinus.svelte src/lib/components/stok/stok-ui.test.ts src/routes/kasir/+page.svelte
git commit -m "feat(stok): pita peringatan stok minus di layar jualan"
```

---

### Task 9: Pasang ke server, E2E stok, dokumentasi, daftar uji owner

**Files:**
- Create: `scripts/uji-stok.ts`, `docs/uji/tahap-3a-stok-owner.md`
- Modify: `scripts/uji-kasir.ts` (pembersihan buku besar), `README.md`, `docs/superpowers/plans/2026-10-04-00-roadmap.md`

- [ ] **Step 1: Pembersihan E2E kasir ikut buku besar**

Di `scripts/uji-kasir.ts`, di blok `finally` dalam `if (outletId) {`, tambahkan sebagai baris PERTAMA:
```ts
		await svc.from('gerakan_stok').delete().eq('outlet_id', outletId);
```

- [ ] **Step 2: Pasang migrasi**

Run: `npm run sb -- db push --dry-run`
Expected: hanya `20261006000010_stok.sql`, `20261006000011_fungsi_stok.sql`.
Run: `npm run sb -- db push --yes`
Expected: `Applying migration 20261006000010_stok.sql...`, `Applying migration 20261006000011_fungsi_stok.sql...`. (Token kedaluwarsa → minta owner memperbarui `SUPABASE_ACCESS_TOKEN` di `.env.local`; jangan pernah mencetak isinya.)

- [ ] **Step 3: E2E stok**

`scripts/uji-stok.ts`:
```ts
// E2E stok terhadap Supabase sungguhan: outlet "UJI", admin & kasir sementara; semua dihapus di akhir.
//   node --env-file=.env.local scripts/uji-stok.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { usernameToEmail } from '../src/lib/auth/username.ts';

const url = process.env.SUPABASE_URL!;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY!;
let gagal = 0;
const cek = (nama: string, ok: boolean, info = '') => {
	if (!ok) gagal++;
	console.log(`${ok ? 'OK   ' : 'GAGAL'} ${nama}${info ? ` — ${info}` : ''}`);
};

const tag = randomBytes(3).toString('hex');
let outletId = '';
const userIds: string[] = [];

async function akun(role: 'admin' | 'kasir'): Promise<SupabaseClient> {
	const pw = randomBytes(12).toString('base64url');
	const u = `uji.${role}.${tag}`;
	const a = await svc.auth.admin.createUser({
		email: usernameToEmail(u),
		password: pw,
		email_confirm: true,
		app_metadata: { username: u, nama_tampilan: `Uji ${role}`, role, outlet_kode: role === 'kasir' ? 'UJI' : null }
	});
	if (a.error) throw new Error(a.error.message);
	userIds.push(a.data.user.id);
	const c = createClient(url, anonKey, { auth: { persistSession: false } });
	const m = await c.auth.signInWithPassword({ email: usernameToEmail(u), password: pw });
	if (m.error) throw new Error(m.error.message);
	return c;
}

try {
	const o = await svc.from('outlets').insert({ kode: 'UJI', nama: `Uji ${tag}`, merek: 'Uji', alamat: '-', telepon: '-' }).select('id').single();
	if (o.error) throw new Error(`outlet uji: ${o.error.message}`);
	outletId = o.data.id;
	const menu = (await svc.from('menu').select('id, kode')).data ?? [];
	await svc.from('harga_jual').insert(menu.map((m) => ({ outlet_id: outletId, menu_id: m.id, harga: 5000 })));
	const menuDada = menu.find((m) => m.kode === 'ori_dada')!.id;
	const dada = (await svc.from('bahan').select('id').eq('kode', 'ori_dada').single()).data!.id;
	const packOri = (await svc.from('satuan_beli').select('id').eq('kode', 'pack_ayam_ori').single()).data!.id;
	const admin = await akun('admin');
	const kasir = await akun('kasir');
	const stokDada = async (c: SupabaseClient) =>
		Number((await c.from('stok_outlet').select('qty').eq('outlet_id', outletId).eq('bahan_id', dada).single()).data?.qty);

	const aj = await kasir.rpc('ajukan_stok_awal', { p_outlet: outletId, p_item: [{ bahan_id: dada, qty: 10 }] });
	cek('kasir mengajukan stok awal', !aj.error, aj.error?.message);
	const kasirPutus = await kasir.rpc('putuskan_stok_awal', { p_id: aj.data, p_setuju: true, p_item: null, p_catatan: null });
	cek('kasir tidak bisa menyetujui', kasirPutus.error?.code === '42501', kasirPutus.error?.code);
	const st = await admin.rpc('putuskan_stok_awal', { p_id: aj.data, p_setuju: true, p_item: null, p_catatan: null });
	cek('admin menyetujui → stok dada 10', !st.error && (await stokDada(kasir)) === 10, st.error?.message);

	const s = await kasir.rpc('buka_shift', { p_outlet: outletId, p_modal: 0 });
	const pid = randomUUID();
	const p = { id: pid, outlet_id: outletId, metode: 'qris', item: [{ menu_id: menuDada, qty: 2 }] };
	await kasir.rpc('catat_penjualan', { p });
	await kasir.rpc('catat_penjualan', { p });
	cek('jual 2 dada (dikirim ulang) → 8', (await stokDada(kasir)) === 8);
	const v = await kasir.rpc('void_penjualan', { p_id: pid, p_alasan: 'Uji batal' });
	cek('void → kembali 10', !v.error && (await stokDada(kasir)) === 10, v.error?.message);

	const tanggal = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
	const bmId = randomUUID();
	const bm = await admin.rpc('catat_barang_masuk', { p: { id: bmId, outlet_id: outletId, tanggal, item: [{ satuan_beli_id: packOri, qty: 1, harga: 1 }] } });
	cek('barang masuk 1 pack ayam → dada 13', !bm.error && (await stokDada(admin)) === 13, bm.error?.message);
	const bmKasir = await kasir.rpc('catat_barang_masuk', {
		p: { id: randomUUID(), outlet_id: outletId, tanggal, item: [{ satuan_beli_id: packOri, qty: 1, harga: 1 }] }
	});
	cek('kasir tidak bisa mencatat barang masuk', bmKasir.error?.code === '42501', bmKasir.error?.code);
	const lihat = await kasir.from('barang_masuk').select('id');
	cek('kasir tidak bisa membaca barang masuk (harga beli)', (lihat.data ?? []).length === 0, lihat.error?.message);
	const bb = await admin.rpc('batal_barang_masuk', { p_id: bmId, p_alasan: 'Uji batal' });
	cek('batal barang masuk → dada 10', !bb.error && (await stokDada(admin)) === 10, bb.error?.message);

	const milik = await kasir.from('stok_outlet').select('outlet_id');
	cek('kasir hanya melihat stok outletnya', (milik.data ?? []).length > 0 && (milik.data ?? []).every((r) => r.outlet_id === outletId));
	const anon = createClient(url, anonKey, { auth: { persistSession: false } });
	const an = await anon.from('stok_outlet').select('qty');
	cek('anon tidak bisa membaca stok', !!an.error || (an.data ?? []).length === 0);

	await kasir.rpc('tutup_shift', { p_shift: s.data, p_uang_fisik: 0, p_catatan: 'uji' });
} catch (e) {
	gagal++;
	console.error(`GAGAL langkah: ${(e as Error).message}`);
} finally {
	if (outletId) {
		await svc.from('gerakan_stok').delete().eq('outlet_id', outletId);
		const sa = ((await svc.from('stok_awal').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (sa.length) await svc.from('stok_awal_item').delete().in('stok_awal_id', sa);
		await svc.from('stok_awal').delete().eq('outlet_id', outletId);
		const bm = ((await svc.from('barang_masuk').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (bm.length) await svc.from('barang_masuk_item').delete().in('barang_masuk_id', bm);
		await svc.from('barang_masuk').delete().eq('outlet_id', outletId);
		const pj = ((await svc.from('penjualan').select('id').eq('outlet_id', outletId)).data ?? []).map((x) => x.id);
		if (pj.length) await svc.from('penjualan_item').delete().in('penjualan_id', pj);
		await svc.from('penjualan').delete().eq('outlet_id', outletId);
		await svc.from('shift').delete().eq('outlet_id', outletId);
		await svc.from('nomor_harian').delete().eq('outlet_id', outletId);
	}
	for (const id of userIds) {
		const { error } = await svc.auth.admin.deleteUser(id);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus akun uji ${id}: ${error.message}`);
		}
	}
	if (outletId) {
		const { error } = await svc.from('outlets').delete().eq('id', outletId);
		if (error) {
			gagal++;
			console.error(`GAGAL menghapus outlet uji ${outletId}: ${error.message}`);
		}
	}
	console.log('\nData uji dibersihkan.');
}
console.log(gagal ? `\n${gagal} pemeriksaan GAGAL` : '\nSemua pemeriksaan lulus');
process.exit(gagal ? 1 : 0);
```

Run: `node --env-file=.env.local scripts/uji-stok.ts` lalu `node --env-file=.env.local scripts/uji-kasir.ts`
Expected: keduanya "Semua pemeriksaan lulus" dan "Data uji dibersihkan."; sesudahnya outlet di server tetap `BL,TK,KP`.

- [ ] **Step 4: Dokumentasi & daftar uji owner**

`README.md`: tambahkan baris tabel perintah setelah baris `uji-kasir.ts`:
```
| `node --env-file=.env.local scripts/uji-stok.ts` | uji alur stok di server (outlet & akun sementara, dibersihkan otomatis) |
```
Roadmap: ubah status baris 3a menjadi `selesai (menunggu uji owner)` dan kolom rencana menjadi `` `2026-10-06-tahap-3a-stok.md` ``.

`docs/uji/tahap-3a-stok-owner.md`:
```markdown
# PR owner — uji Tahap 3a (stok dasar)

Status: **belum dicoba**. Jalankan `npm run dev`, buka di Chrome. Centang `[x]` yang sudah, tulis catatan bila ada yang aneh.

## Jumlah keranjang (koreksi Tahap 2)
- [ ] Ketuk angka jumlah di keranjang → ketik 150 → Enter → total berubah sesuai
- [ ] Kosongkan kotaknya atau ketik 0 → angka kembali seperti semula (baris tidak hilang)

## Stok awal
- [ ] Login kasir → tab **Stok** → "Stok awal belum diisi" → **Isi stok awal**
- [ ] Ayam diisi per potongan; kemasan dll. "pack + pcs"; beras dalam kg (boleh koma) → **Kirim ke admin**
- [ ] Login admin → **Stok → Stok awal** → betulkan satu angka → **Setujui stok awal**
- [ ] Tab Stok kasir sekarang menampilkan tanda Aman/Menipis/Minus

## Potong otomatis
- [ ] Jual 1 Dada Ori + 1 Nasi → Stok: dada berkurang 1, beras berkurang 0,1 kg, kertas nasi berkurang 1
- [ ] Batalkan transaksi itu di Riwayat → stok kembali
- [ ] Admin → Stok → ketuk "Ayam Ori" → riwayat menampilkan Terjual & Batal jual beserta nomor transaksi

## Barang masuk
- [ ] Admin → Stok → **Barang masuk** → pilih outlet → tambah "Pack Ayam Ori" 5 → harga terisi otomatis → Simpan
- [ ] Stok Ayam Ori bertambah 5 pack
- [ ] Beras: harga harus diketik (tidak terisi otomatis)
- [ ] Batalkan barang masuk (isi alasan) → stok kembali

## Peringatan
- [ ] Jual ayam melebihi stok → di layar jualan muncul pita "Stok minus: …"; penjualan tetap bisa
- [ ] Beranda admin menampilkan "x menipis, y minus" per outlet

Catatan hasil uji:
```

- [ ] **Step 5: Verifikasi penuh & commit**

Run: `npm test && npm run check && npm run build`
Expected: semua lulus, 0 errors, build sukses.

```bash
git add scripts/uji-stok.ts scripts/uji-kasir.ts README.md docs/superpowers/plans/2026-10-04-00-roadmap.md docs/uji/tahap-3a-stok-owner.md
git commit -m "test(e2e): alur stok di server; docs Tahap 3a & daftar uji owner"
```
