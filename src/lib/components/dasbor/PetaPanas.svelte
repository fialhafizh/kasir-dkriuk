<script lang="ts">
	import type { Matriks } from '#lib/dasbor/olah.ts';

	let { data, format }: { data: Matriks; format: (n: number) => string } = $props();
	const kuat = (v: number) => (data.maks ? 0.08 + (v / data.maks) * 0.92 : 0);
</script>

<div class="h-full overflow-auto">
	<table class="border-separate border-spacing-0.5 text-[10px]">
		<thead>
			<tr>
				<th></th>
				{#each data.kolom as k (k)}<th class="px-0.5 font-normal text-muted">{k.replace('.00', '')}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each data.baris as b, i (b)}
				<tr>
					<th class="pr-1 text-right font-normal whitespace-nowrap text-muted">{b}</th>
					{#each data.nilai[i] as v, j (j)}
						<td class="relative size-6 min-w-6 rounded-sm bg-surface-2" title="{b} {data.kolom[j]}: {format(v)}">
							<span class="absolute inset-0 rounded-sm bg-brand" style:opacity={kuat(v)}></span>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
