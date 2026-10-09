<script lang="ts">
	// Tabel angka hasil panel; bila ada pembanding, tiap ukuran diberi kolom perubahan persen.
	import { LABEL_KELOMPOK, labelUkuran } from '#lib/dasbor/katalog.ts';
	import type { Hasil } from '#lib/dasbor/olah.ts';
	import { perubahan } from '#lib/dasbor/periode.ts';

	let { hasil, pembanding = null, format }: { hasil: Hasil; pembanding?: Hasil | null; format: (u: string, n: number) => string } = $props();
	const lalu = $derived(new Map((pembanding?.baris ?? []).map((b) => [b.k.join('\u0000'), b.n])));
</script>

<div class="h-full overflow-auto">
	<table class="w-full text-sm">
		<thead class="sticky top-0 bg-surface text-left text-xs text-muted">
			<tr>
				{#each hasil.kolom as k (k.kolom)}<th class="py-1 pr-2 font-semibold">{LABEL_KELOMPOK[k.kolom] ?? k.kolom}</th>{/each}
				{#each hasil.ukuran as u (u)}
					<th class="py-1 pl-2 text-right font-semibold">{labelUkuran(u)}</th>
					{#if pembanding}<th class="py-1 pl-1 text-right font-semibold">±</th>{/if}
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each hasil.baris as b, i (i)}
				{@const sebelum = lalu.get(b.k.join('\u0000'))}
				<tr class="border-t border-line">
					{#each b.l as l, j (j)}<td class="py-1 pr-2">{l}</td>{/each}
					{#each hasil.ukuran as u, j (u)}
						<td class="tabular py-1 pl-2 text-right">{format(u, b.n[j])}</td>
						{#if pembanding}
							{@const p = perubahan(b.n[j], sebelum?.[j] ?? 0)}
							<td class="tabular py-1 pl-1 text-right text-xs {p === null ? 'text-muted' : p >= 0 ? 'text-ok' : 'text-danger'}">
								{p === null ? '–' : `${p >= 0 ? '↑' : '↓'}${Math.abs(p).toLocaleString('id-ID')}%`}
							</td>
						{/if}
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
	{#if hasil.terpotong}<p class="mt-1 text-xs text-muted">Hanya sebagian baris yang ditampilkan.</p>{/if}
</div>
