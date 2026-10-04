<script lang="ts">
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { LABEL_JENIS, angkaStok } from '#lib/stok/tampil.ts';
	import type { Gerakan } from '#lib/stok/types.ts';

	let { gerakan, namaBahan }: { gerakan: Gerakan[]; namaBahan: ReadonlyMap<string, string> } = $props();
</script>

{#if gerakan.length === 0}
	<p class="rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada gerakan stok.</p>
{:else}
	<ul class="grid gap-1">
		{#each gerakan as g (g.id)}
			<li class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl bg-surface-2 px-3 py-2 text-sm">
				<span class="tabular text-muted">{formatWaktuWib(g.waktu)}</span>
				<span class="font-semibold">{LABEL_JENIS[g.jenis]}</span>
				{#if g.nomor}<span class="text-muted">{g.nomor}</span>{/if}
				<span class="tabular ml-auto font-bold {g.qty < 0 ? 'text-danger' : 'text-ok'}"
					>{g.qty > 0 ? '+' : ''}{angkaStok(g.qty)} {namaBahan.get(g.bahan_id) ?? ''}</span
				>
			</li>
		{/each}
	</ul>
{/if}
