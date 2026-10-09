<script lang="ts">
	// Batang datar (peringkat, mis. menu terlaris) untuk 1 seri; batang tegak bertumpuk bila lebih dari 1 seri atau sumbu waktu.
	import { ringkas, skala, type DataSeri } from '#lib/dasbor/olah.ts';
	import Legenda from './Legenda.svelte';
	import { warnaSeri } from './warna.ts';

	let { data, format, tegak = false }: { data: DataSeri; format: (n: number) => string; tegak?: boolean } = $props();
	let lebar = $state(320);
	let tinggi = $state(200);

	const bertumpuk = $derived(tegak || data.seri.length > 1);
	const total = $derived(data.kategori.map((_, i) => data.seri.reduce((t, s) => t + Math.max(0, s.nilai[i] ?? 0), 0)));
	const maks = $derived(Math.max(0, ...(bertumpuk ? total : (data.seri[0]?.nilai ?? []))));
	const garis = $derived(skala(maks));
	const atas = $derived(garis.at(-1) || 1);

	// tegak
	const KIRI = 44;
	const BAWAH = 22;
	const lebarKat = $derived(data.kategori.length ? (lebar - KIRI) / data.kategori.length : 0);
	const tiap = $derived(Math.max(1, Math.ceil(data.kategori.length / Math.max(1, Math.floor((lebar - KIRI) / 46)))));
	const y = (v: number) => (tinggi - BAWAH) * (1 - v / atas);
</script>

<div class="flex h-full flex-col gap-2">
	{#if bertumpuk}
		<div class="min-h-0 flex-1" bind:clientWidth={lebar} bind:clientHeight={tinggi}>
			<svg width={lebar} height={tinggi} role="img" aria-label="Grafik batang">
				{#each garis as g (g)}
					<line x1={KIRI} x2={lebar} y1={y(g)} y2={y(g)} class="stroke-line" />
					<text x={KIRI - 4} y={y(g) + 4} text-anchor="end" class="fill-muted text-[10px]">{ringkas(g)}</text>
				{/each}
				{#each data.kategori as k, i (i)}
					{@const x = KIRI + i * lebarKat + lebarKat * 0.15}
					{#each data.seri as s, j (j)}
						{@const bawah = data.seri.slice(0, j).reduce((t, z) => t + Math.max(0, z.nilai[i] ?? 0), 0)}
						{@const v = Math.max(0, s.nilai[i] ?? 0)}
						{#if v > 0}
							<rect x={x} width={Math.max(1, lebarKat * 0.7)} y={y(bawah + v)} height={y(bawah) - y(bawah + v)} fill={warnaSeri(j)}>
								<title>{k} · {s.nama}: {format(v)}</title>
							</rect>
						{/if}
					{/each}
					{#if i % tiap === 0}
						<text x={x + lebarKat * 0.35} y={tinggi - 6} text-anchor="middle" class="fill-muted text-[10px]">{k}</text>
					{/if}
				{/each}
			</svg>
		</div>
		<Legenda nama={data.seri.map((s) => s.nama)} />
	{:else}
		<ul class="grid gap-1.5 overflow-y-auto text-sm">
			{#each data.kategori as k, i (i)}
				{@const v = data.seri[0]?.nilai[i] ?? 0}
				<li class="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2">
					<span class="truncate" title={k}>{k}</span>
					<span class="h-4 rounded-sm bg-surface-2">
						<span class="block h-4 rounded-sm" style:width="{maks ? Math.max(0, (v / maks) * 100) : 0}%" style:background={warnaSeri(0)}></span>
					</span>
					<span class="tabular text-right font-semibold">{format(v)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
