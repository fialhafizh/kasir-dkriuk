<script lang="ts">
	import { LABEL_PERIODE, PERIODE, type Periode } from '#lib/dasbor/periode.ts';
	import type { SaringanDasbor } from '#lib/dasbor/spek.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { saringan = $bindable(), outlets }: { saringan: SaringanDasbor; outlets: Outlet[] } = $props();
	const kotak = 'min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg';

	function ubahPeriode(p: Periode) {
		saringan = { ...saringan, periode: p };
	}
</script>

<div class="flex flex-wrap items-end gap-2">
	<label class="grid gap-1 text-xs font-semibold">
		Outlet
		<select class={kotak} value={saringan.outlet_id ?? ''} onchange={(e) => (saringan = { ...saringan, outlet_id: e.currentTarget.value || null })}>
			<option value="">Semua outlet</option>
			{#each outlets.filter((o) => o.aktif) as o (o.id)}<option value={o.id}>{o.nama}</option>{/each}
		</select>
	</label>
	<label class="grid gap-1 text-xs font-semibold">
		Periode
		<select class={kotak} value={saringan.periode} onchange={(e) => ubahPeriode(e.currentTarget.value as Periode)}>
			{#each PERIODE as p (p)}<option value={p}>{LABEL_PERIODE[p]}</option>{/each}
		</select>
	</label>
	{#if saringan.periode === 'kustom'}
		<label class="grid gap-1 text-xs font-semibold">
			Dari
			<input type="date" class={kotak} value={saringan.dari ?? ''} onchange={(e) => (saringan = { ...saringan, dari: e.currentTarget.value })} />
		</label>
		<label class="grid gap-1 text-xs font-semibold">
			Sampai
			<input type="date" class={kotak} value={saringan.sampai ?? ''} onchange={(e) => (saringan = { ...saringan, sampai: e.currentTarget.value })} />
		</label>
	{/if}
</div>
