<script lang="ts">
	import TombolEkspor from '#lib/components/ekspor/TombolEkspor.svelte';
	import { lembarLabaRugi } from '#lib/ekspor/laporan.ts';
	import { onMount } from 'svelte';
	import { laporanKeuangan, rentangBulan, type LaporanKeuangan } from '#lib/kas/laporan.ts';
	import { labelMetode, METODE } from '#lib/kasir/bayar.ts';
	import { tanggalWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	const hariIni = tanggalWib(new Date());
	let outlets = $state<Outlet[]>([]);
	let pilihan = $state('semua');
	let mode = $state<'bulan' | 'rentang'>('bulan');
	let bulan = $state(hariIni.slice(0, 7));
	let dari = $state(rentangBulan(hariIni.slice(0, 7)).dari);
	let sampai = $state(hariIni);
	let data = $state<{ judul: string; r: LaporanKeuangan }[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let gen = 0;

	async function muat() {
		const g = ++gen;
		status = 'memuat';
		try {
			if (!outlets.length) outlets = await muatOutlets();
			const b = rentangBulan(bulan);
			// Bulan berjalan: sampai hari ini saja (sewa & gaji tidak dihitung untuk hari yang belum terjadi).
			const rg = mode === 'bulan' ? { dari: b.dari, sampai: b.sampai > hariIni ? hariIni : b.sampai } : { dari, sampai };
			const dipilih = pilihan === 'semua' ? outlets : outlets.filter((o) => o.id === pilihan);
			const hasil = await Promise.all(dipilih.map(async (o) => ({ judul: `${o.merek} ${o.nama}`, r: await laporanKeuangan(o.id, rg.dari, rg.sampai) })));
			if (pilihan === 'semua') hasil.unshift({ judul: 'Semua outlet', r: await laporanKeuangan(null, rg.dari, rg.sampai) });
			if (g !== gen) return;
			data = hasil;
			status = 'siap';
		} catch (e) {
			if (g !== gen) return;
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${formatAngka(Math.abs(n))}`;
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<svelte:head><title>Laba-Rugi · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Laba-rugi</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Cara sederhana: omzet − belanja bahan − gaji − sewa − pengeluaran lain. Omzet ojol masih bruto (sebelum potongan aplikasi). Kasbon bukan
	biaya (dipotong dari gaji). Penyesuaian gaji (bonus/potongan) ikut bila periode mencakup tanggal 1 bulan itu. Analisis kebocoran &
	proyeksi menyusul di dashboard (Tahap 7).
</p>

<form class="mt-4 flex flex-wrap items-end gap-3" onsubmit={(e) => (e.preventDefault(), void muat())}>
	<div class="grid gap-1.5">
		<label for="outlet" class="text-sm font-semibold">Outlet</label>
		<select id="outlet" bind:value={pilihan} class={kotak}>
			<option value="semua">Semua outlet</option>
			{#each outlets as o (o.id)}<option value={o.id}>{o.nama}</option>{/each}
		</select>
	</div>
	<div class="grid gap-1.5">
		<label for="mode" class="text-sm font-semibold">Periode</label>
		<select id="mode" bind:value={mode} class={kotak}>
			<option value="bulan">Per bulan</option>
			<option value="rentang">Rentang tanggal</option>
		</select>
	</div>
	{#if mode === 'bulan'}
		<div class="grid gap-1.5"><label for="bulan" class="text-sm font-semibold">Bulan</label><input id="bulan" type="month" bind:value={bulan} max={hariIni.slice(0, 7)} class={kotak} /></div>
	{:else}
		<div class="grid gap-1.5"><label for="dari" class="text-sm font-semibold">Dari</label><input id="dari" type="date" bind:value={dari} max={sampai} class={kotak} /></div>
		<div class="grid gap-1.5"><label for="sampai" class="text-sm font-semibold">Sampai</label><input id="sampai" type="date" bind:value={sampai} min={dari} max={hariIni} class={kotak} /></div>
	{/if}
	<button type="submit" class="min-h-12 rounded-xl bg-brand px-4 font-semibold text-on-brand">Tampilkan</button>
</form>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	<div class="mt-4"><TombolEkspor judul="Laba-rugi" cetak lembar={() => [lembarLabaRugi(data)]} /></div>
	<div class="mt-6 grid gap-6 lg:grid-cols-2">
		{#each data as d (d.judul)}
			{@const r = d.r}
			<section class="rounded-2xl border border-line bg-surface p-4" aria-label="Laba-rugi {d.judul}">
				<h2 class="font-display text-2xl">{d.judul}</h2>
				<p class="text-sm text-muted">{r.dari} s.d. {r.sampai}</p>
				<dl class="tabular mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
					<dt class="font-semibold">Omzet</dt><dd class="text-right font-semibold">{rp(r.omzet)}</dd>
					{#each METODE as m (m.kode)}
						{#if r.per_metode[m.kode]?.total}<dt class="pl-3 text-sm text-muted">{labelMetode(m.kode)} ({r.per_metode[m.kode].jumlah})</dt><dd class="text-right text-sm text-muted">{rp(Number(r.per_metode[m.kode].total))}</dd>{/if}
					{/each}
					<dt>Belanja bahan</dt><dd class="text-right">{rp(-r.belanja_bahan)}</dd>
					{#if r.belanja_bahan_lain}<dt class="pl-3 text-sm text-muted">termasuk di luar Barang masuk</dt><dd class="text-right text-sm text-muted">{rp(r.belanja_bahan_lain)}</dd>{/if}
					<dt>Gaji</dt><dd class="text-right">{rp(-r.gaji)}</dd>
					<dt>Sewa</dt><dd class="text-right">{rp(-r.sewa)}</dd>
					<dt>Pengeluaran lain</dt><dd class="text-right">{rp(-r.pengeluaran_lain_total)}</dd>
					{#each r.pengeluaran_lain as p (p.kategori)}<dt class="pl-3 text-sm text-muted">{p.kategori}</dt><dd class="text-right text-sm text-muted">{rp(p.jumlah)}</dd>{/each}
					<dt class="mt-2 border-t border-line pt-2 text-lg font-bold">{r.laba >= 0 ? 'Laba' : 'Rugi'}</dt>
					<dd class="mt-2 border-t border-line pt-2 text-right text-lg font-bold {r.laba >= 0 ? 'text-ok' : 'text-danger'}">{rp(r.laba)}</dd>
				</dl>

				<details class="mt-4">
					<summary class="min-h-12 cursor-pointer py-3 font-semibold">Arus kas</summary>
					<dl class="tabular grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-sm">
						<dt class="font-semibold">Uang masuk per kanal</dt><dd></dd><dd></dd>
						{#each METODE as m (m.kode)}<dt class="pl-3">{labelMetode(m.kode)}</dt><dd></dd><dd class="text-right">{rp(Number(r.per_metode[m.kode]?.total ?? 0))}</dd>{/each}
						<dt class="pt-2 font-semibold">Uang keluar</dt><dd class="pt-2 text-right text-muted">laci</dd><dd class="pt-2 text-right text-muted">luar laci</dd>
						<dt class="pl-3">Belanja bahan (Barang masuk)</dt><dd></dd><dd class="text-right">{rp(r.belanja_bahan_masuk)}</dd>
						{#each r.arus_keluar as k (k.kategori)}<dt class="pl-3">{k.kategori}</dt><dd class="text-right">{rp(k.laci)}</dd><dd class="text-right">{rp(k.luar)}</dd>{/each}
						<dt class="pt-2 font-semibold">Setoran diterima owner</dt><dd></dd><dd class="pt-2 text-right">{rp(r.setoran_diterima)}</dd>
						{#if r.selisih_setoran}<dt class="pl-3">Selisih setoran</dt><dd></dd><dd class="text-right text-danger">{rp(r.selisih_setoran)}</dd>{/if}
					</dl>
				</details>
			</section>
		{/each}
	</div>
{/if}
