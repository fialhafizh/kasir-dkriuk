<script lang="ts">
	import { jumlahItem, totalKeranjang } from '#lib/kasir/keranjang.ts';
	import type { BarisKeranjang } from '#lib/kasir/types.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let {
		isi,
		onubah,
		onkosongkan
	}: { isi: BarisKeranjang[]; onubah: (menuId: string, qty: number) => void; onkosongkan: () => void } = $props();
</script>

<div class="grid gap-2">
	<div class="flex items-center justify-between">
		<h2 class="font-display text-xl">Pesanan ({jumlahItem(isi)})</h2>
		{#if isi.length}
			<button type="button" class="min-h-12 rounded-xl px-3 text-sm text-danger hover:bg-surface-2" onclick={onkosongkan}>Kosongkan</button>
		{/if}
	</div>
	{#if isi.length === 0}
		<p class="rounded-xl bg-surface-2 p-4 text-sm text-muted">Tap menu untuk menambah pesanan.</p>
	{:else}
		<ul class="grid gap-1">
			{#each isi as b (b.menu_id)}
				<li class="flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1">
					<span class="min-w-0 flex-1 truncate font-semibold">{b.nama}</span>
					<button
						type="button"
						class="size-12 rounded-xl bg-surface text-xl font-bold"
						aria-label="Kurangi {b.nama}"
						onclick={() => onubah(b.menu_id, b.qty - 1)}>−</button
					>
					<span class="tabular w-8 text-center font-bold" aria-label="Jumlah {b.nama}">{b.qty}</span>
					<button
						type="button"
						class="size-12 rounded-xl bg-surface text-xl font-bold"
						aria-label="Tambah {b.nama}"
						onclick={() => onubah(b.menu_id, b.qty + 1)}>+</button
					>
					<span class="tabular w-20 text-right text-sm">{formatAngka(b.harga * b.qty)}</span>
				</li>
			{/each}
		</ul>
		<p class="flex items-baseline justify-between px-2 pt-2 text-lg font-bold">
			<span>Total</span><span class="tabular font-display text-3xl text-brand">Rp{formatAngka(totalKeranjang(isi))}</span>
		</p>
	{/if}
</div>
