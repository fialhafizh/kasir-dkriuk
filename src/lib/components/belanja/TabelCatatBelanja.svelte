<script lang="ts">
	// Tabel catat belanja riil: barang × outlet (jumlah & harga per outlet). Simpan → satu Barang masuk per outlet,
	// jadi stok outlet bertambah dan uangnya tercatat sebagai belanja bahan outlet itu.
	import { onMount } from 'svelte';
	import { dariRencana, barisCatat, hitungJumlah, kunci, sel, susunKiriman, type Draf } from '#lib/belanja/catat.ts';
	import { muatRencana } from '#lib/belanja/belanja.ts';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { tanggalWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
	import { catatBarangMasuk } from '#lib/stok/api.ts';
	import { peringatanStokAwal } from '#lib/stok/masuk.ts';
	import type { SatuanOutlet } from '#lib/stok/per-outlet.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let {
		outlets,
		satuan,
		pemakai,
		hargaBeli,
		dihitungAt,
		onsimpan
	}: {
		outlets: Outlet[];
		satuan: SatuanBeli[];
		pemakai: SatuanOutlet[];
		hargaBeli: HargaBeli[];
		/** Jam stok awal disetujui per outlet (untuk peringatan barang yang sudah terhitung). */
		dihitungAt: Record<string, string | null>;
		onsimpan: () => Promise<void> | void;
	} = $props();

	const KUNCI = 'belanja-riil:draf';
	const hariIni = tanggalWib(new Date());
	const batasMundur = tanggalWib(new Date(Date.now() - 7 * 864e5));
	let draf = $state<Draf>({});
	let tanggal = $state(hariIni);
	// id barang masuk per outlet dipertahankan sampai berhasil, supaya kirim ulang tidak menggandakan
	let idKirim = $state<Record<string, string>>({});
	let galat = $state<string[]>([]);
	let hasil = $state<string[]>([]);
	let memuatRencana = $state(false);

	onMount(() => {
		try {
			const t = JSON.parse(localStorage.getItem(KUNCI) ?? '{}') as { hari?: string; draf?: Draf; tanggal?: string; idKirim?: Record<string, string> };
			if (t.hari === hariIni) {
				draf = t.draf ?? {};
				tanggal = t.tanggal ?? hariIni;
				idKirim = t.idKirim ?? {};
			}
		} catch {
			// penyimpanan perangkat tidak tersedia: isian hanya hilang saat halaman ditutup
		}
	});
	function simpanDraf() {
		try {
			localStorage.setItem(KUNCI, JSON.stringify({ hari: hariIni, draf, tanggal, idKirim }));
		} catch {
			// abaikan
		}
	}

	const ids = $derived(outlets.map((o) => o.id));
	const baris = $derived(barisCatat(satuan, pemakai, ids));
	const jumlah = $derived(hitungJumlah(draf, satuan, pemakai, ids, hargaBeli));
	const terisi = $derived(outlets.filter((o) => baris.some((b) => b.outlet.includes(o.id) && (draf[kunci(b.s.id, o.id)]?.qty ?? '').trim() !== '')));
	const peringatan = $derived(outlets.map((o) => peringatanStokAwal(tanggal, dihitungAt[o.id] ?? null, o.nama)).filter((x): x is string => !!x));

	function ubah(s: SatuanBeli, o: string, bagian: 'qty' | 'harga', nilai: string) {
		const lama = sel(draf, s, o, hargaBeli);
		draf = { ...draf, [kunci(s.id, o)]: { ...lama, [bagian]: nilai } };
		simpanDraf();
	}
	function kosongkan() {
		draf = {};
		galat = [];
		hasil = [];
		simpanDraf();
	}
	async function isiDariRencana() {
		memuatRencana = true;
		galat = [];
		try {
			let isian = {};
			try {
				const t = JSON.parse(localStorage.getItem('belanja:isian') ?? '{}') as { tanggal?: string; isian?: Record<string, number> };
				if (t.tanggal === hariIni) isian = t.isian ?? {};
			} catch {
				// tanpa isian tersimpan: pakai saran
			}
			const jml = dariRencana(await muatRencana(7), isian);
			const baru: Draf = { ...draf };
			for (const { s, outlet } of baris)
				for (const o of outlet) {
					const n = jml[kunci(s.id, o)];
					if (n) baru[kunci(s.id, o)] = { ...sel(draf, s, o, hargaBeli), qty: String(n) };
				}
			draf = baru;
			simpanDraf();
		} catch (e) {
			galat = [(e as Error).message];
		} finally {
			memuatRencana = false;
		}
	}

	async function simpan() {
		galat = [];
		hasil = [];
		const kiriman = susunKiriman(draf, satuan, pemakai, ids, hargaBeli, tanggal, (o) => (idKirim[o] ??= crypto.randomUUID()));
		simpanDraf();
		const nama = (o: string) => outlets.find((x) => x.id === o)?.nama ?? '';
		const salah = kiriman.flatMap((k) => k.galat.map((g) => `${nama(k.outlet_id)} · ${g.nama}: ${g.pesan}`));
		if (!kiriman.length) return void (galat = ['Isi jumlah barang yang dibeli dulu.']);
		if (salah.length) return void (galat = salah);
		for (const k of kiriman) {
			try {
				await catatBarangMasuk(k.kirim!);
				const total = k.kirim!.item.reduce((t, i) => t + Math.round(i.qty * i.harga), 0);
				hasil = [...hasil, `${nama(k.outlet_id)}: tersimpan Rp${formatAngka(total)}, stok bertambah.`];
				// sel outlet yang berhasil dikosongkan; id dibuang supaya belanja berikutnya jadi catatan baru
				draf = Object.fromEntries(Object.entries(draf).filter(([key]) => !key.endsWith(`|${k.outlet_id}`)));
				delete idKirim[k.outlet_id];
			} catch (e) {
				galat = [...galat, `${nama(k.outlet_id)}: ${(e as Error).message}`];
			}
			simpanDraf();
		}
		await onsimpan();
	}

	const rp = (n: number) => `Rp${formatAngka(n)}`;
	const qty = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 3 });
	const kotak = 'tabular min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-right';
</script>

<section class="rounded-2xl border border-line bg-surface p-3" aria-label="Catat belanja">
	<h2 class="font-display text-xl">Catat belanja</h2>
	<p class="text-sm text-muted">
		Isi jumlah yang dibeli untuk tiap outlet dan harga per satuan. Saat disimpan, tiap outlet menjadi satu <b>Barang masuk</b>: stok outlet bertambah dan
		uangnya terhitung sebagai belanja outlet itu.
	</p>

	<div class="tanpa-cetak mt-3 flex flex-wrap items-end gap-2">
		<label class="grid gap-1 text-xs font-semibold">
			Tanggal datang
			<input type="date" class="min-h-11 rounded-xl border border-line-strong bg-surface px-3" min={batasMundur} max={hariIni} bind:value={tanggal} onchange={simpanDraf} />
		</label>
		<button type="button" class="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold" disabled={memuatRencana} onclick={isiDariRencana}>
			{memuatRencana ? 'Memuat…' : 'Isi jumlah dari Rencana belanja'}
		</button>
		<button type="button" class="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold" onclick={kosongkan}>Kosongkan</button>
	</div>
	{#each peringatan as p (p)}<p class="mt-2 rounded-xl border-2 border-warn p-2 text-sm">{p}</p>{/each}

	<div class="mt-3 overflow-x-auto">
		<table class="w-full min-w-[46rem] text-sm">
			<thead class="text-left text-xs text-muted">
				<tr>
					<th class="py-1 pr-2">Barang</th>
					{#each outlets as o (o.id)}<th class="py-1 pr-2 text-right">{o.nama}<span class="block font-normal">jumlah · harga/satuan</span></th>{/each}
					<th class="py-1 pr-2 text-right">Jumlah total</th>
					<th class="py-1 text-right">Total</th>
				</tr>
			</thead>
			<tbody>
				{#each baris as { s, outlet } (s.id)}
					{@const j = jumlah.perBaris[s.id]}
					<tr class="border-t border-line align-top">
						<td class="py-1.5 pr-2 font-semibold">
							{s.nama}
							{#if !s.harga_tetap}<span class="block text-[11px] font-normal text-muted">harga berubah-ubah — wajib diisi</span>{/if}
						</td>
						{#each outlets as o (o.id)}
							<td class="py-1 pr-2 text-right">
								{#if outlet.includes(o.id)}
									{@const c = sel(draf, s, o.id, hargaBeli)}
									<div class="flex justify-end gap-1">
										<input aria-label="Jumlah {s.nama} {o.nama}" inputmode="decimal" placeholder="0" class="{kotak} w-14" value={c.qty} onchange={(e) => ubah(s, o.id, 'qty', e.currentTarget.value)} />
										<input aria-label="Harga {s.nama} {o.nama}" inputmode="numeric" placeholder="harga" class="{kotak} w-24 text-xs" value={c.harga} onchange={(e) => ubah(s, o.id, 'harga', e.currentTarget.value)} />
									</div>
								{:else}
									<span class="text-xs text-muted">tidak dipakai</span>
								{/if}
							</td>
						{/each}
						<td class="tabular py-1.5 pr-2 text-right font-bold">{j?.qty ? qty(j.qty) : '-'}</td>
						<td class="tabular py-1.5 text-right">{j?.rupiah ? rp(j.rupiah) : '-'}</td>
					</tr>
				{/each}
				<tr class="border-t-2 border-line-strong font-bold">
					<td class="py-2">Jumlah uang keluar</td>
					{#each outlets as o (o.id)}<td class="tabular py-2 pr-2 text-right">{rp(jumlah.perOutlet[o.id] ?? 0)}</td>{/each}
					<td></td>
					<td class="tabular py-2 text-right">{rp(jumlah.total)}</td>
				</tr>
			</tbody>
		</table>
	</div>

	<div class="tanpa-cetak mt-3 flex flex-wrap items-center gap-2">
		<Konfirmasi
			label={terisi.length ? `Simpan ke stok (${terisi.map((o) => o.nama).join(', ')})` : 'Simpan ke stok'}
			konfirmasiLabel="Ya, simpan sebagai barang masuk"
			variant="primary"
			onkonfirmasi={simpan}
		/>
	</div>
	{#if galat.length}
		<ul class="mt-2 grid gap-1 text-sm text-danger" role="alert">{#each galat as g (g)}<li>{g}</li>{/each}</ul>
	{/if}
	{#if hasil.length}
		<ul class="mt-2 grid gap-1 text-sm" role="status">{#each hasil as h (h)}<li>✓ {h}</li>{/each}</ul>
	{/if}
</section>
