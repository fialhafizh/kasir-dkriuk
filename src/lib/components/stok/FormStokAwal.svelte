<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
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
	// Hitungan panjang diketik manual: jangan hilang karena tersentuh menu bawah / tombol kembali.
	let kotor = $state(false);
	beforeNavigate(({ cancel }) => {
		if (kotor && !confirm('Hitungan belum dikirim dan akan hilang. Tinggalkan halaman ini?')) cancel();
	});
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
			kotor = false;
		} catch (err) {
			pesan = (err as Error).message;
		} finally {
			mengirim = false;
		}
	}
</script>

<svelte:window
	onbeforeunload={(e) => {
		if (kotor) e.preventDefault();
	}}
/>

<form class="grid gap-3" onsubmit={kirim} oninput={() => (kotor = true)} novalidate>
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
