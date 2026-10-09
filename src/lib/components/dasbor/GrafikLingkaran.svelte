<script lang="ts">
	import type { DataSeri } from '#lib/dasbor/olah.ts';
	import { warnaSeri } from './warna.ts';

	let { data, format }: { data: DataSeri; format: (n: number) => string } = $props();
	const nilai = $derived((data.seri[0]?.nilai ?? []).map((v) => Math.max(0, v)));
	const total = $derived(nilai.reduce((a, b) => a + b, 0));
	const R = 40;
	const KELILING = 2 * Math.PI * R;
	const potong = $derived.by(() => {
		let awal = 0;
		return nilai.map((v) => {
			const panjang = total ? (v / total) * KELILING : 0;
			const p = { panjang, awal };
			awal += panjang;
			return p;
		});
	});
	const persen = (v: number) => (total ? Math.round((v / total) * 1000) / 10 : 0);
</script>

<div class="flex h-full flex-wrap items-center justify-center gap-4">
	<svg viewBox="0 0 100 100" class="size-32 shrink-0 -rotate-90" role="img" aria-label="Grafik lingkaran">
		<circle cx="50" cy="50" r={R} fill="none" class="stroke-surface-2" stroke-width="18" />
		{#each potong as p, i (i)}
			{#if p.panjang > 0}
				<circle cx="50" cy="50" r={R} fill="none" stroke={warnaSeri(i)} stroke-width="18"
					stroke-dasharray="{p.panjang} {KELILING - p.panjang}" stroke-dashoffset={-p.awal}>
					<title>{data.kategori[i]}: {format(nilai[i])}</title>
				</circle>
			{/if}
		{/each}
	</svg>
	<ul class="grid gap-1 text-sm">
		{#each data.kategori as k, i (i)}
			<li class="flex items-center gap-2">
				<span class="inline-block size-3 rounded-sm" style:background={warnaSeri(i)}></span>
				<span>{k}</span>
				<span class="tabular font-semibold">{format(nilai[i])}</span>
				<span class="text-muted">({persen(nilai[i]).toLocaleString('id-ID')}%)</span>
			</li>
		{/each}
	</ul>
</div>
