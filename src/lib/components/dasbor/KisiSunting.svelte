<script lang="ts">
	// Penyunting kisi layar lebar: panel diseret (pegangan ⠿) & ditarik ukurannya; gridstack dimuat hanya di sini.
	import { onMount, type Snippet } from 'svelte';
	import type { Panel, SaringanDasbor } from '#lib/dasbor/spek.ts';
	import type { Outlet } from '#lib/types/db.ts';
	import type { GridStack } from 'gridstack';
	import PanelDasbor from './PanelDasbor.svelte';

	type PanelKerja = Panel & { _kunci: string };
	let {
		panel,
		saringan,
		outlets,
		sekarang,
		onletak,
		aksi
	}: {
		panel: PanelKerja[];
		saringan: SaringanDasbor;
		outlets: Outlet[];
		sekarang: Date;
		onletak: (kunci: string, l: { x: number; y: number; w: number; h: number }) => void;
		aksi: Snippet<[PanelKerja]>;
	} = $props();

	let wadah = $state<HTMLDivElement>();
	let grid: GridStack | null = null;
	let siap = $state(false);

	onMount(() => {
		let batal = false;
		void (async () => {
			const [{ GridStack }] = await Promise.all([import('gridstack'), import('gridstack/dist/gridstack.min.css')]);
			if (batal || !wadah) return;
			grid = GridStack.init({ column: 12, cellHeight: 64, margin: 6, float: true, draggable: { handle: '.pegangan-panel' }, columnOpts: { breakpoints: [] } }, wadah);
			grid.on('change', (_e, items) => {
				for (const it of items) {
					const k = (it.el as HTMLElement | undefined)?.dataset.kunci;
					if (k) onletak(k, { x: it.x ?? 0, y: it.y ?? 0, w: it.w ?? 1, h: it.h ?? 1 });
				}
			});
			siap = true;
		})();
		return () => {
			batal = true;
			grid?.destroy(false);
			grid = null;
		};
	});

	/** Letak awal untuk gridstack (atribut gs-*). */
	const atributGs = (p: PanelKerja): Record<string, number> => ({ 'gs-x': p.x, 'gs-y': p.y, 'gs-w': p.w, 'gs-h': p.h, 'gs-min-h': 2, 'gs-max-h': 20 });

	/** Panel yang ditambahkan setelah kisi siap didaftarkan ke gridstack; yang dihapus dilepas tanpa menghapus DOM (Svelte yang menghapus). */
	function widget(node: HTMLElement) {
		if (grid) grid.makeWidget(node);
		return {
			destroy() {
				grid?.removeWidget(node, false, false);
			}
		};
	}
</script>

<div class="mt-4 rounded-2xl bg-surface-2/50 {siap ? '' : 'opacity-70'}">
<div class="grid-stack min-h-40" bind:this={wadah}>
	{#each panel as p (p._kunci)}
		<div class="grid-stack-item" data-kunci={p._kunci} {...atributGs(p)} use:widget>
			<div class="grid-stack-item-content">
				<PanelDasbor panel={p} {saringan} {outlets} {sekarang} segar={0}>
					{#snippet aksi()}{@render aksiPanel(p)}{/snippet}
				</PanelDasbor>
			</div>
		</div>
	{/each}
</div>
</div>

{#snippet aksiPanel(p: PanelKerja)}
	<span class="pegangan-panel cursor-move rounded-lg px-2 py-1 text-muted hover:bg-surface-2" title="Seret untuk memindah" aria-hidden="true">⠿</span>
	{@render aksi(p)}
{/snippet}
