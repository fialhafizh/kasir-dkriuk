<script lang="ts">
	import { perubahan } from '#lib/dasbor/periode.ts';

	let { nilai, sebelum = null, teks }: { nilai: number; sebelum?: number | null; teks: string } = $props();
	const p = $derived(sebelum === null ? null : perubahan(nilai, sebelum));
</script>

<div class="flex h-full flex-col justify-center">
	<p class="tabular font-display text-2xl leading-tight break-all text-fg sm:text-3xl">{teks}</p>
	{#if sebelum !== null}
		<p class="text-xs {p === null ? 'text-muted' : p >= 0 ? 'text-ok' : 'text-danger'}">
			{p === null ? 'Periode sebelumnya 0' : `${p >= 0 ? '↑' : '↓'} ${Math.abs(p).toLocaleString('id-ID')}% dari periode sebelumnya`}
		</p>
	{/if}
</div>
