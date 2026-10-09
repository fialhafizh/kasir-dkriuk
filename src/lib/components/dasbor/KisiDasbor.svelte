<script lang="ts">
	// Tampilan kisi: layar lebar = kisi 12 kolom sesuai letak tersimpan; HP = berjajar ke bawah (urut atas→bawah, kiri→kanan).
	import { urutHp, type Panel, type SaringanDasbor } from '#lib/dasbor/spek.ts';
	import type { Outlet } from '#lib/types/db.ts';
	import PanelDasbor from './PanelDasbor.svelte';

	let { panel, saringan, outlets, sekarang, segar }: { panel: Panel[]; saringan: SaringanDasbor; outlets: Outlet[]; sekarang: Date; segar: number } =
		$props();
	const urut = $derived(urutHp(panel));
	/** Tinggi satu baris kisi (px). */
	const BARIS = 64;
</script>

{#if !panel.length}
	<p class="mt-6 rounded-2xl bg-surface-2 p-6 text-center text-muted">Dasbor ini masih kosong. Tekan <b>Ubah dasbor</b> lalu <b>Tambah panel</b>.</p>
{:else}
	<div class="kisi mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12" style:--baris="{BARIS}px">
		{#each urut as p (p.id ?? `${p.x}-${p.y}`)}
			<div class="panel min-w-0" style:--x={p.x + 1} style:--y={p.y + 1} style:--w={p.w} style:--h={p.h}>
				<PanelDasbor panel={p} {saringan} {outlets} {sekarang} {segar} />
			</div>
		{/each}
	</div>
{/if}

<style>
	.panel {
		/* HP: tinggi mengikuti tinggi panel (minimal 2 baris) */
		height: calc(max(var(--h), 2) * var(--baris) * 0.85);
	}
	@media (min-width: 64rem) {
		.kisi {
			grid-auto-rows: var(--baris);
		}
		.panel {
			height: auto;
			grid-column: var(--x) / span var(--w);
			grid-row: var(--y) / span var(--h);
		}
	}
</style>
