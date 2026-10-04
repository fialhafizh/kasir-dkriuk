<script lang="ts">
	import { labelMetode, METODE } from '#lib/kasir/bayar.ts';
	import type { Ringkasan } from '#lib/kasir/types.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { r }: { r: Ringkasan } = $props();
</script>

<div class="grid gap-3 rounded-2xl border border-line bg-surface p-4">
	<p class="text-sm text-muted">Shift dibuka {formatWaktuWib(r.dibuka_at)} WIB{r.ditutup_at ? ` · ditutup ${formatWaktuWib(r.ditutup_at)}` : ''}</p>
	<dl class="tabular grid grid-cols-2 gap-x-4 gap-y-1">
		<dt>Transaksi</dt><dd class="text-right font-semibold">{r.jumlah_transaksi}{r.jumlah_void ? ` (+${r.jumlah_void} batal)` : ''}</dd>
		{#each METODE as m (m.kode)}
			<dt class="text-muted">{labelMetode(m.kode)} ({r.per_metode[m.kode].jumlah})</dt>
			<dd class="text-right">Rp{formatAngka(r.per_metode[m.kode].total)}</dd>
		{/each}
		<dt class="font-bold">Total penjualan</dt><dd class="text-right font-bold">Rp{formatAngka(r.total)}</dd>
		<dt class="pt-2">Modal kembalian</dt><dd class="pt-2 text-right">Rp{formatAngka(r.modal)}</dd>
		<dt class="font-semibold">Cash seharusnya di laci</dt><dd class="text-right font-semibold">Rp{formatAngka(r.cash_seharusnya)}</dd>
		{#if r.uang_fisik !== null && r.selisih !== null}
			<dt>Uang dihitung</dt><dd class="text-right">Rp{formatAngka(r.uang_fisik)}</dd>
			<dt class="font-bold">Selisih</dt>
			<dd class="text-right font-bold {r.selisih === 0 ? 'text-ok' : 'text-danger'}">
				{r.selisih === 0 ? 'Pas' : `${r.selisih > 0 ? 'Lebih' : 'Kurang'} Rp${formatAngka(Math.abs(r.selisih))}`}
			</dd>
		{/if}
	</dl>
</div>
