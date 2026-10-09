<script lang="ts">
	import Petunjuk from '#lib/components/bantuan/Petunjuk.svelte';
	import { onMount } from 'svelte';
	import TabMinyakTepung from '#lib/components/analisis/TabMinyakTepung.svelte';
	import TabProyeksi from '#lib/components/analisis/TabProyeksi.svelte';
	import TabSusut from '#lib/components/analisis/TabSusut.svelte';
	import TabUntungMenu from '#lib/components/analisis/TabUntungMenu.svelte';
	import SaringanAtas from '#lib/components/dasbor/SaringanAtas.svelte';
	import { rentangPeriode } from '#lib/dasbor/periode.ts';
	import type { SaringanDasbor } from '#lib/dasbor/spek.ts';
	import { href } from '#lib/nav.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import type { Outlet } from '#lib/types/db.ts';

	const TAB = [
		{ id: 'untung', label: 'Untung per menu' },
		{ id: 'susut', label: 'Susut & terbuang' },
		{ id: 'minyak', label: 'Minyak & tepung' },
		{ id: 'proyeksi', label: 'Proyeksi' }
	] as const;
	let tab = $state<(typeof TAB)[number]['id']>('untung');
	let outlets = $state<Outlet[]>([]);
	let saringan = $state<SaringanDasbor>({ outlet_id: null, periode: 'bulan_ini' });
	let galat = $state('');
	const rentang = $derived(
		rentangPeriode(saringan.periode, new Date(), saringan.periode === 'kustom' && saringan.dari && saringan.sampai ? { dari: saringan.dari, sampai: saringan.sampai } : undefined)
	);

	onMount(() => {
		muatOutlets()
			.then((o) => (outlets = o))
			.catch((e) => (galat = (e as Error).message));
	});
</script>

<svelte:head><title>Analisis · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Analisis <Petunjuk topik="analisis" peran="admin" /></h1>
<p class="mt-1 max-w-prose rounded-xl bg-accent/30 p-2 text-sm">
	Semua angka di halaman ini <b>perkiraan</b> untuk mencari kebocoran. Laba riil ada di <a class="underline" href={href('/admin/laba-rugi')}>Laba-rugi</a>.
</p>
{#if galat}<p class="mt-2 text-danger" role="alert">{galat}</p>{/if}

<div class="mt-3 flex flex-wrap gap-1" role="group" aria-label="Bagian analisis">
	{#each TAB as t (t.id)}
		<button type="button" aria-pressed={tab === t.id} class="min-h-11 rounded-xl px-3 text-sm font-semibold {tab === t.id ? 'bg-brand text-on-brand' : 'bg-surface-2'}"
			onclick={() => (tab = t.id)}>{t.label}</button>
	{/each}
</div>
<div class="mt-3"><SaringanAtas bind:saringan {outlets} /></div>
{#if tab === 'proyeksi'}<p class="mt-1 text-xs text-muted">Proyeksi selalu untuk bulan berjalan.</p>{/if}

<div class="mt-4">
	{#if tab === 'untung'}
		<TabUntungMenu outlet={saringan.outlet_id} {rentang} {outlets} />
	{:else if tab === 'susut'}
		<TabSusut outlet={saringan.outlet_id} {rentang} {outlets} />
	{:else if tab === 'minyak'}
		<TabMinyakTepung outlet={saringan.outlet_id} {rentang} />
	{:else}
		<TabProyeksi outlet={saringan.outlet_id} />
	{/if}
</div>
