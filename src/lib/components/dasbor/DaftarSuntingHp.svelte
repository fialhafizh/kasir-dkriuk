<script lang="ts">
	// Penyunting sederhana untuk HP: urutan naik/turun, lebar & tinggi; letak dihitung ulang mengalir.
	import { LABEL_JENIS } from '#lib/dasbor/katalog.ts';
	import { PILIHAN_LEBAR, susunUlang, urutHp, type Panel } from '#lib/dasbor/spek.ts';
	import type { Snippet } from 'svelte';

	type PanelKerja = Panel & { _kunci: string };
	let { panel, onubah, aksi }: { panel: PanelKerja[]; onubah: (p: PanelKerja[]) => void; aksi: Snippet<[PanelKerja]> } = $props();
	const urut = $derived(urutHp(panel));

	function pindah(i: number, arah: -1 | 1) {
		const u = [...urut];
		const j = i + arah;
		if (j < 0 || j >= u.length) return;
		[u[i], u[j]] = [u[j], u[i]];
		onubah(susunUlang(u));
	}
	function ukuran(i: number, ubah: Partial<Pick<Panel, 'w' | 'h'>>) {
		onubah(susunUlang(urut.map((p, k) => (k === i ? { ...p, ...ubah } : p))));
	}
	const kotak = 'min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-sm';
	const tombol = 'grid min-h-10 min-w-10 place-items-center rounded-lg bg-surface-2 font-bold disabled:opacity-40';
</script>

<ol class="mt-4 grid gap-2">
	{#each urut as p, i (p._kunci)}
		<li class="grid gap-2 rounded-2xl border border-line bg-surface p-3">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<p class="truncate font-semibold">{p.judul}</p>
					<p class="text-xs text-muted">{LABEL_JENIS[p.jenis]}</p>
				</div>
				<div class="flex shrink-0 gap-1">{@render aksi(p)}</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<button type="button" class={tombol} aria-label="Naikkan" disabled={i === 0} onclick={() => pindah(i, -1)}>↑</button>
				<button type="button" class={tombol} aria-label="Turunkan" disabled={i === urut.length - 1} onclick={() => pindah(i, 1)}>↓</button>
				<label class="flex items-center gap-1 text-xs">Lebar
					<select class={kotak} value={p.w} onchange={(e) => ukuran(i, { w: Number(e.currentTarget.value) })}>
						{#each PILIHAN_LEBAR as l (l.w)}<option value={l.w}>{l.label}</option>{/each}
						{#if !PILIHAN_LEBAR.some((l) => l.w === p.w)}<option value={p.w}>{p.w}/12</option>{/if}
					</select>
				</label>
				<label class="flex items-center gap-1 text-xs">Tinggi
					<select class={kotak} value={p.h} onchange={(e) => ukuran(i, { h: Number(e.currentTarget.value) })}>
						{#each [2, 3, 4, 5, 6, 8, 10] as h (h)}<option value={h}>{h}</option>{/each}
						{#if ![2, 3, 4, 5, 6, 8, 10].includes(p.h)}<option value={p.h}>{p.h}</option>{/if}
					</select>
				</label>
			</div>
		</li>
	{/each}
</ol>
