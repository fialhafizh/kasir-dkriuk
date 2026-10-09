<script lang="ts">
	import { ringkas, skala, type DataSeri } from '#lib/dasbor/olah.ts';
	import Legenda from './Legenda.svelte';
	import { warnaSeri } from './warna.ts';

	let { data, format, formatSeri }: { data: DataSeri; format: (n: number) => string; formatSeri?: (i: number) => (n: number) => string } = $props();
	let lebar = $state(320);
	let tinggi = $state(200);

	const KIRI = 44;
	const BAWAH = 22;
	const ATAS = 6;
	const nilai = $derived(data.seri.flatMap((s) => s.nilai));
	const minimum = $derived(Math.min(0, ...nilai));
	const garis = $derived(skala(Math.max(0, ...nilai) - minimum).map((g) => g + minimum));
	const puncak = $derived(garis.at(-1) ?? 1);
	const n = $derived(data.kategori.length);
	const x = (i: number) => KIRI + (n <= 1 ? (lebar - KIRI) / 2 : (i * (lebar - KIRI - 8)) / (n - 1));
	const y = (v: number) => ATAS + (tinggi - BAWAH - ATAS) * (1 - (v - minimum) / (puncak - minimum || 1));
	const tiap = $derived(Math.max(1, Math.ceil(n / Math.max(1, Math.floor((lebar - KIRI) / 46)))));
</script>

<div class="flex h-full flex-col gap-2">
	<div class="min-h-0 flex-1" bind:clientWidth={lebar} bind:clientHeight={tinggi}>
		<svg width={lebar} height={tinggi} role="img" aria-label="Grafik garis">
			{#each garis as g (g)}
				<line x1={KIRI} x2={lebar} y1={y(g)} y2={y(g)} class="stroke-line" />
				<text x={KIRI - 4} y={y(g) + 4} text-anchor="end" class="fill-muted text-[10px]">{ringkas(g)}</text>
			{/each}
			{#each data.kategori as k, i (i)}
				{#if i % tiap === 0}<text x={x(i)} y={tinggi - 6} text-anchor="middle" class="fill-muted text-[10px]">{k}</text>{/if}
			{/each}
			{#each data.seri as s, j (j)}
				<polyline fill="none" stroke={warnaSeri(j)} stroke-width="2" points={s.nilai.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
				{#each s.nilai as v, i (i)}
					<circle cx={x(i)} cy={y(v)} r={n > 40 ? 1.5 : 3} fill={warnaSeri(j)}><title>{data.kategori[i]} · {s.nama}: {(formatSeri && data.seri.length > 1 ? formatSeri(j) : format)(v)}</title></circle>
				{/each}
			{/each}
		</svg>
	</div>
	<Legenda nama={data.seri.map((s) => s.nama)} />
</div>
