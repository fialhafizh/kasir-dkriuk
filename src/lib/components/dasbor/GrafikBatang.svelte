<script lang="ts">
	// Batang tegak bertumpuk: sumbu waktu atau 2 pengelompokan (seri = kelompok kedua, satuan sama).
	// Batang datar: peringkat & beberapa ukuran berbeda satuan (tiap ukuran skala & formatnya sendiri); nilai minus ditampilkan merah.
	import { ringkas, skala, type DataSeri } from '#lib/dasbor/olah.ts';
	import Legenda from './Legenda.svelte';
	import { warnaSeri } from './warna.ts';

	let {
		data,
		format,
		formatSeri,
		banyakUkuran = false,
		tegak = false
	}: { data: DataSeri; format: (n: number) => string; formatSeri?: (i: number) => (n: number) => string; banyakUkuran?: boolean; tegak?: boolean } = $props();
	let lebar = $state(320);
	let tinggi = $state(200);

	const bertumpuk = $derived(!banyakUkuran && (tegak || data.seri.length > 1));
	const total = $derived(data.kategori.map((_, i) => data.seri.reduce((t, s) => t + Math.max(0, s.nilai[i] ?? 0), 0)));
	const garis = $derived(skala(Math.max(0, ...total)));
	const atas = $derived(garis.at(-1) || 1);
	/** Skala per seri untuk batang datar: nilai mutlak terbesar. */
	const maksSeri = $derived(data.seri.map((s) => Math.max(0, ...s.nilai.map((v) => Math.abs(v)))));

	const KIRI = 44;
	const BAWAH = 22;
	const lebarKat = $derived(data.kategori.length ? (lebar - KIRI) / data.kategori.length : 0);
	const tiap = $derived(Math.max(1, Math.ceil(data.kategori.length / Math.max(1, Math.floor((lebar - KIRI) / 46)))));
	const y = (v: number) => (tinggi - BAWAH) * (1 - v / atas);
	const fmt = (j: number) => (banyakUkuran && formatSeri ? formatSeri(j) : format);
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
				<li class="grid gap-0.5">
					{#each data.seri as s, j (j)}
						{@const v = s.nilai[i] ?? 0}
						<div class="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2">
							<span class="truncate {j ? 'text-xs text-muted' : ''}" title={k}>{j ? s.nama : k}</span>
							<span class="h-4 rounded-sm bg-surface-2">
								<span class="block h-4 rounded-sm" style:width="{maksSeri[j] ? (Math.abs(v) / maksSeri[j]) * 100 : 0}%"
									style:background={v < 0 ? 'var(--color-danger)' : warnaSeri(j)}></span>
							</span>
							<span class="tabular text-right font-semibold {v < 0 ? 'text-danger' : ''}">{fmt(j)(v)}</span>
						</div>
					{/each}
				</li>
			{/each}
		</ul>
		{#if banyakUkuran}<Legenda nama={data.seri.map((s) => s.nama)} />{/if}
	{/if}
</div>
