<script lang="ts">
	import { onMount } from 'svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let pesan = $state('');

	onMount(async () => {
		try {
			outlets = (await muatOutlets()).filter((o) => o.aktif);
			const tersimpan = pos.outletTersimpan();
			const o = outlets.find((x) => x.id === tersimpan);
			if (o && !pos.outlet) pos.pilihOutlet(o);
		} catch (e) {
			pesan = (e as Error).message;
		}
	});
</script>

<div class="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
	<label for="pilih-outlet" class="text-sm font-semibold">Jualan untuk outlet</label>
	<select
		id="pilih-outlet"
		class="min-h-12 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-fg"
		value={pos.outlet?.id ?? ''}
		onchange={(e) => pos.pilihOutlet(outlets.find((o) => o.id === e.currentTarget.value) ?? null)}
	>
		<option value="" disabled>Pilih outlet…</option>
		{#each outlets as o (o.id)}<option value={o.id}>{o.merek} {o.nama}</option>{/each}
	</select>
	{#if pesan}<p class="w-full text-sm text-danger" role="alert">{pesan}</p>{/if}
</div>
