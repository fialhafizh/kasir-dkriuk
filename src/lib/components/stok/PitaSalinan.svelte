<script lang="ts">
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';

	let { salinanAt, belumTerkirim }: { salinanAt: string | null; belumTerkirim: number } = $props();
</script>

{#if salinanAt || belumTerkirim}
	<p class="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted" role="status">
		{#if salinanAt}Data dari perangkat (terakhir online {formatWaktuWib(salinanAt)} WIB).{/if}
		{#if belumTerkirim}Angka perkiraan: {belumTerkirim} data belum terkirim.{/if}
	</p>
{/if}
