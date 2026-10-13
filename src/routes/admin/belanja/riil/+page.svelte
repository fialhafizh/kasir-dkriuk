<script lang="ts">
	import { onMount } from 'svelte';
	import { lembarRiil, muatBelanjaRiil, susunRiil, type BagiRiil, type LainRiil, type MasukRiil } from '#lib/belanja/riil.ts';
	import Petunjuk from '#lib/components/bantuan/Petunjuk.svelte';
	import PengeluaranBagi from '#lib/components/belanja/PengeluaranBagi.svelte';
	import PindahBelanja from '#lib/components/belanja/PindahBelanja.svelte';
	import SaringanAtas from '#lib/components/dasbor/SaringanAtas.svelte';
	import TombolEkspor from '#lib/components/ekspor/TombolEkspor.svelte';
	import { rentangPeriode } from '#lib/dasbor/periode.ts';
	import type { SaringanDasbor } from '#lib/dasbor/spek.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import { href } from '#lib/nav.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let masuk = $state<MasukRiil[]>([]);
	let lain = $state<LainRiil[]>([]);
	let bagi = $state<BagiRiil[]>([]);
	let saringan = $state<SaringanDasbor>({ outlet_id: null, periode: 'bulan_ini' });
	let galat = $state('');
	let memuat = $state(true);
	let nomor = 0;

	const rentang = $derived(
		rentangPeriode(saringan.periode, new Date(), saringan.periode === 'kustom' && saringan.dari && saringan.sampai ? { dari: saringan.dari, sampai: saringan.sampai } : undefined)
	);
	onMount(() => {
		muatOutlets()
			.then((o) => (outlets = o.filter((x) => x.aktif)))
			.catch((e) => (galat = (e as Error).message));
	});
	async function muat() {
		const ini = ++nomor;
		memuat = true;
		try {
			const h = await muatBelanjaRiil(rentang);
			if (ini !== nomor) return;
			masuk = h.masuk;
			lain = h.lain;
			bagi = h.bagi;
			galat = '';
		} catch (e) {
			if (ini === nomor) galat = (e as Error).message;
		} finally {
			if (ini === nomor) memuat = false;
		}
	}
	$effect(() => {
		void rentang;
		void muat();
	});

	const tampil = $derived(saringan.outlet_id ? outlets.filter((o) => o.id === saringan.outlet_id) : outlets);
	const s = $derived(susunRiil(masuk, lain, tampil.map((o) => o.id), bagi));
	const nota = $derived(masuk.filter((m) => tampil.some((o) => o.id === m.outlet_id)));
	const namaOutlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '';
	const rp = (n: number) => `Rp${formatAngka(n)}`;
	const jml = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
</script>

<svelte:head><title>Belanja riil · Admin D'Kriuk</title></svelte:head>

<PindahBelanja aktif="riil" />
<div class="flex items-center gap-2"><h1 class="font-display text-3xl">Belanja riil</h1><Petunjuk topik="belanja-riil" peran="admin" /></div>
<p class="mt-1 max-w-prose text-sm text-muted">
	Barang yang benar-benar dibeli tiap outlet, dari <a class="underline" href={href('/admin/stok/masuk')}>Barang masuk</a>, ditambah belanja bahan yang
	dicatat di Pengeluaran, ditambah pengeluaran lainnya yang dibagi rata ke semua outlet. Begitu barang masuk dicatat untuk satu outlet, uang keluarnya langsung terhitung di outlet itu (juga di Laba-rugi). Barang masuk
	yang dibatalkan tidak dihitung.
</p>

<div class="mt-3"><SaringanAtas bind:saringan {outlets} /></div>
{#if galat}<p class="mt-3 text-danger" role="alert">{galat}</p>{/if}

<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
	{#each tampil as o (o.id)}
		<div class="rounded-2xl bg-surface-2 p-3">
			<p class="text-xs text-muted">Uang keluar {o.nama}</p>
			<p class="tabular font-display text-2xl">{rp(s.totalOutlet[o.id] ?? 0)}</p>
			<p class="text-xs text-muted">
				{s.jumlahNota[o.id] ?? 0} barang masuk {rp(s.masukOutlet[o.id] ?? 0)}{#if s.lainOutlet[o.id]} · bahan lain {rp(s.lainOutlet[o.id])}{/if}{#if s.bagiOutlet[o.id]} · dibagi {rp(s.bagiOutlet[o.id])}{/if}
			</p>
		</div>
	{/each}
	{#if tampil.length > 1}
		<div class="rounded-2xl border-2 border-brand p-3">
			<p class="text-xs text-muted">Total semua outlet</p>
			<p class="tabular font-display text-2xl">{rp(s.total)}</p>
		</div>
	{/if}
</div>

<div class="mt-4"><PengeluaranBagi {outlets} daftar={bagi} onubah={muat} /></div>

{#if memuat && !masuk.length}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if !s.barang.length && !s.total}
	<p class="mt-4 text-muted">Belum ada barang masuk di periode ini. Catat lewat Admin → Stok → Barang masuk.</p>
{:else}
	<div class="mt-4 overflow-x-auto">
		<table class="w-full min-w-[42rem] text-sm">
			<thead class="text-left text-xs text-muted">
				<tr>
					<th class="py-1 pr-2">Barang</th>
					<th class="py-1 pr-2 text-right">Jumlah total</th>
					{#each tampil as o (o.id)}<th class="py-1 pr-2 text-right">{o.nama}</th>{/each}
					<th class="py-1 pr-2 text-right">Harga rata-rata</th>
					<th class="py-1 text-right">Total</th>
				</tr>
			</thead>
			<tbody>
				{#each s.barang as b (b.satuan_beli_id)}
					<tr class="border-t border-line align-top">
						<td class="py-1.5 pr-2 font-semibold">{b.nama}</td>
						<td class="tabular py-1.5 pr-2 text-right font-bold">{jml(b.qty)}</td>
						{#each tampil as o (o.id)}
							{@const p = b.per_outlet[o.id]}
							<td class="tabular py-1.5 pr-2 text-right">
								{#if p}{jml(p.qty)}<span class="block text-[11px] text-muted">{rp(p.rupiah)}</span>{:else}<span class="text-muted">-</span>{/if}
							</td>
						{/each}
						<td class="tabular py-1.5 pr-2 text-right">{rp(b.hargaRata)}</td>
						<td class="tabular py-1.5 text-right">{rp(b.rupiah)}</td>
					</tr>
				{/each}
				{#if tampil.some((o) => s.lainOutlet[o.id])}
					<tr class="border-t border-line">
						<td class="py-1.5 pr-2 font-semibold">Belanja bahan lain (Pengeluaran)</td>
						<td></td>
						{#each tampil as o (o.id)}<td class="tabular py-1.5 pr-2 text-right">{s.lainOutlet[o.id] ? rp(s.lainOutlet[o.id]) : '-'}</td>{/each}
						<td></td>
						<td class="tabular py-1.5 text-right">{rp(tampil.reduce((t, o) => t + s.lainOutlet[o.id], 0))}</td>
					</tr>
				{/if}
				{#if tampil.some((o) => s.bagiOutlet[o.id])}
					<tr class="border-t border-line">
						<td class="py-1.5 pr-2 font-semibold">Pengeluaran lainnya (dibagi rata)</td>
						<td></td>
						{#each tampil as o (o.id)}<td class="tabular py-1.5 pr-2 text-right">{s.bagiOutlet[o.id] ? rp(s.bagiOutlet[o.id]) : '-'}</td>{/each}
						<td></td>
						<td class="tabular py-1.5 text-right">{rp(tampil.reduce((t, o) => t + s.bagiOutlet[o.id], 0))}</td>
					</tr>
				{/if}
				<tr class="border-t-2 border-line-strong font-bold">
					<td class="py-2" colspan="2">Jumlah uang keluar</td>
					{#each tampil as o (o.id)}<td class="tabular py-2 pr-2 text-right">{rp(s.totalOutlet[o.id])}</td>{/each}
					<td></td>
					<td class="tabular py-2 text-right">{rp(s.total)}</td>
				</tr>
			</tbody>
		</table>
	</div>

	<div class="mt-4"><TombolEkspor judul="Belanja riil" cetak lembar={() => lembarRiil(s, tampil)} /></div>

	<details class="mt-4 rounded-2xl border border-line bg-surface p-3">
		<summary class="cursor-pointer font-semibold">Rincian per nota ({nota.length})</summary>
		<ul class="mt-2 grid gap-2 text-sm">
			{#each nota as m (m.id)}
				<li class="rounded-xl bg-surface-2 p-2">
					<p class="font-semibold">{namaOutlet(m.outlet_id)} · {formatWaktuWib(m.waktu)} · {rp(m.total)}</p>
					<ul class="text-muted">
						{#each m.item as i (i.satuan_beli_id)}<li>{jml(i.qty)} × {i.nama} @ {rp(i.harga)} = {rp(i.subtotal)}</li>{/each}
					</ul>
					{#if m.catatan}<p class="text-xs text-muted">{m.catatan}</p>{/if}
				</li>
			{/each}
		</ul>
	</details>
{/if}
