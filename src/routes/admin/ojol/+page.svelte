<script lang="ts">
	// Laporan ojol per aplikasi (harga toko) untuk dicocokkan owner dengan pencairan ke rekening.
	import { onMount } from 'svelte';
	import SaringanAtas from '#lib/components/dasbor/SaringanAtas.svelte';
	import TombolBagikan from '#lib/components/ekspor/TombolBagikan.svelte';
	import TombolEkspor from '#lib/components/ekspor/TombolEkspor.svelte';
	import { hitungPanel } from '#lib/dasbor/api.ts';
	import type { Hasil } from '#lib/dasbor/olah.ts';
	import { rentangPeriode, type Rentang } from '#lib/dasbor/periode.ts';
	import type { SaringanDasbor } from '#lib/dasbor/spek.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	const OJOL = ['gofood', 'grabfood', 'shopeefood'];
	let outlets = $state<Outlet[]>([]);
	let saringan = $state<SaringanDasbor>({ outlet_id: null, periode: '7_hari' });
	let perApp = $state<Hasil | null>(null);
	let perHari = $state<Hasil | null>(null);
	let galat = $state('');
	const rentang: Rentang = $derived(
		rentangPeriode(saringan.periode, new Date(), saringan.periode === 'kustom' && saringan.dari && saringan.sampai ? { dari: saringan.dari, sampai: saringan.sampai } : undefined)
	);

	onMount(() => {
		muatOutlets()
			.then((o) => (outlets = o))
			.catch((e) => (galat = (e as Error).message));
	});
	$effect(() => {
		const r = rentang;
		const o = saringan.outlet_id;
		let batal = false;
		const dasar = { sumber: 'penjualan' as const, ukuran: ['transaksi', 'omzet'], saringan: { kanal: OJOL } };
		Promise.all([
			hitungPanel('tabel', { ...dasar, kelompok: [{ kolom: 'kanal' }] }, o, r),
			hitungPanel('tabel', { ...dasar, kelompok: [{ kolom: 'waktu', satuan: 'hari' }, { kolom: 'kanal' }] }, o, r)
		])
			.then(([a, h]) => {
				if (!batal) (perApp = a), (perHari = h), (galat = '');
			})
			.catch((e) => {
				if (!batal) (galat = (e as Error).message), (perApp = null), (perHari = null);
			});
		return () => {
			batal = true;
		};
	});

	const rp = (n: number) => `Rp${formatAngka(Math.round(n))}`;
	const tgl = (d: Date) => d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' });
	const judulPeriode = $derived(`${tgl(rentang.dari)}–${tgl(new Date(rentang.sampai.getTime() - 1))}`);
	const namaOutlet = $derived(outlets.find((x) => x.id === saringan.outlet_id)?.nama ?? 'Semua outlet');
	function teks(): string {
		const baris = (perApp?.baris ?? []).map((b) => `${b.l[0]}: ${b.n[0]} pesanan · ${rp(b.n[1])}`);
		const total = (perApp?.baris ?? []).reduce((t, b) => t + b.n[1], 0);
		return [`Ojol ${namaOutlet} ${judulPeriode} (harga toko)`, ...(baris.length ? baris : ['(tidak ada pesanan ojol)']), `Total: ${rp(total)}`].join('\n');
	}
	const lembar = () => [
		{ nama: 'Per aplikasi', kolom: ['Aplikasi', 'Pesanan', 'Total harga toko'], baris: (perApp?.baris ?? []).map((b) => [b.l[0], b.n[0], b.n[1]]) },
		{ nama: 'Per hari', kolom: ['Tanggal', 'Aplikasi', 'Pesanan', 'Total harga toko'], baris: (perHari?.baris ?? []).map((b) => [b.l[0], b.l[1], b.n[0], b.n[1]]) }
	];
</script>

<svelte:head><title>Ojol · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Ojol</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Pesanan GoFood, GrabFood & ShopeeFood yang dicatat kasir dengan harga toko. Cocokkan totalnya dengan pencairan di aplikasi masing-masing.
</p>
<div class="mt-3"><SaringanAtas bind:saringan {outlets} /></div>
{#if galat}<p class="mt-3 text-danger" role="alert">{galat}</p>{/if}

{#if perApp}
	<div class="mt-4 grid gap-3 sm:grid-cols-3">
		{#each perApp.baris as b (b.k[0])}
			<div class="rounded-2xl bg-surface-2 p-3">
				<p class="text-sm font-bold">{b.l[0]}</p>
				<p class="tabular font-display text-2xl">{rp(b.n[1])}</p>
				<p class="text-xs text-muted">{b.n[0]} pesanan</p>
			</div>
		{:else}
			<p class="text-muted">Tidak ada pesanan ojol di periode ini.</p>
		{/each}
	</div>
	<div class="mt-3 flex flex-wrap gap-2">
		<TombolBagikan jenis="ojol" teks={teks} />
		<TombolEkspor judul="Ojol {namaOutlet}" {lembar} cetak />
	</div>
{/if}

{#if perHari?.baris.length}
	<h2 class="mt-6 font-display text-xl">Per hari</h2>
	<div class="mt-2 overflow-x-auto">
		<table class="w-full min-w-[24rem] text-sm">
			<thead class="text-left text-xs text-muted">
				<tr><th class="py-1 pr-2">Tanggal</th><th class="py-1 pr-2">Aplikasi</th><th class="py-1 pr-2 text-right">Pesanan</th><th class="py-1 text-right">Total harga toko</th></tr>
			</thead>
			<tbody>
				{#each perHari.baris as b (b.k.join('|'))}
					<tr class="border-t border-line">
						<td class="py-1 pr-2">{b.l[0]}</td><td class="py-1 pr-2">{b.l[1]}</td>
						<td class="tabular py-1 pr-2 text-right">{b.n[0]}</td><td class="tabular py-1 text-right">{rp(b.n[1])}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
