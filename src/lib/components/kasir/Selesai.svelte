<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { encodeStruk, urlRawBT } from '#lib/kasir/escpos.ts';
	import { printer } from '#lib/kasir/printer.svelte.ts';
	import { barisStruk, type DataStruk } from '#lib/kasir/struk.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { data, onbaru }: { data: DataStruk; onbaru: () => void } = $props();

	let pesanCetak = $state('');
	let tombolBaru = $state<HTMLDivElement>();
	const bytes = $derived(encodeStruk(barisStruk(data)));

	async function cetak() {
		pesanCetak = '';
		try {
			await printer.cetak(bytes);
			pesanCetak = 'Struk tercetak.';
		} catch (e) {
			pesanCetak = (e as Error).message;
		}
	}

	onMount(() => {
		// Struk otomatis tercetak bila printer tersambung.
		if (printer.status === 'siap') void cetak();
		tombolBaru?.querySelector('button')?.focus();
	});
</script>

<div class="mx-auto grid max-w-md gap-4 rounded-2xl border-2 border-ok bg-surface p-5 text-center">
	<p class="text-sm text-muted">{data.nomor}</p>
	{#if data.kembalian !== null}
		<p class="text-lg">Kembalian</p>
		<p class="tabular font-display text-5xl text-ok">Rp{formatAngka(data.kembalian)}</p>
	{:else}
		<p class="font-display text-3xl text-ok">Lunas</p>
	{/if}
	<div class="flex flex-wrap justify-center gap-2">
		{#if printer.status === 'siap'}
			<Button variant="secondary" onclick={cetak}>Cetak ulang</Button>
		{:else}
			<a
				href={urlRawBT(bytes)}
				class="inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold hover:bg-line focus-visible:outline-3 focus-visible:outline-focus"
			>
				Cetak lewat RawBT
			</a>
		{/if}
	</div>
	{#if pesanCetak}<p class="text-sm text-muted" role="status">{pesanCetak}</p>{/if}
	<div bind:this={tombolBaru}><Button class="min-h-14 w-full text-lg" onclick={onbaru}>Transaksi baru</Button></div>
</div>
