<script lang="ts">
	import type { BarisStok, StatusStok } from '#lib/stok/types.ts';

	let {
		baris,
		tanpaStatus = false,
		tanpaAngka = false,
		dipilih = null,
		onpilih
	}: {
		baris: BarisStok[];
		tanpaStatus?: boolean;
		/** Opname jatuh tempo (keputusan owner): angka disembunyikan agar hitungan kasir tidak menyalin sistem. */
		tanpaAngka?: boolean;
		dipilih?: string | null;
		onpilih?: (b: BarisStok) => void;
	} = $props();

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
		<span class="tabular block text-sm text-muted">{tanpaAngka ? 'Disembunyikan sampai opname dikirim' : b.teks}</span>
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
