<script lang="ts">
	import { printer } from '#lib/kasir/printer.svelte.ts';
</script>

<div class="flex flex-wrap items-center gap-2 text-sm">
	{#if printer.status === 'siap'}
		<span class="inline-flex min-h-10 items-center gap-2 rounded-full bg-surface-2 px-3 font-semibold text-ok">● {printer.nama}</span>
		<button type="button" class="min-h-12 rounded-xl px-3 text-muted hover:bg-surface-2" onclick={() => printer.putus()}>Putuskan</button>
	{:else}
		<button
			type="button"
			class="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-3 font-semibold hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus"
			onclick={() => printer.sambung()}
			disabled={printer.status === 'menyambung'}
		>
			{printer.status === 'menyambung' ? 'Menyambung…' : 'Sambungkan printer'}
		</button>
	{/if}
	{#if printer.pesan}<span class="text-xs text-muted" role="status">{printer.pesan}</span>{/if}
</div>
