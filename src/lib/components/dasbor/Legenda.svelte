<script lang="ts">
	import { warnaSeri } from './warna.ts';

	let { nama }: { nama: string[] } = $props();
</script>

{#if nama.length > 1}
	<ul class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Keterangan warna">
		{#each nama as n, i (i)}
			<li class="flex items-center gap-1.5"><span class="inline-block size-3 rounded-sm" style:background={warnaSeri(i)}></span>{n}</li>
		{/each}
	</ul>
{/if}
