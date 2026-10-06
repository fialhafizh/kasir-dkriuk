<script lang="ts">
	import { labelMetode, METODE } from '#lib/kasir/bayar.ts';
	import type { Ringkasan } from '#lib/kasir/types.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { r }: { r: Ringkasan } = $props();

	// Catatan shift dari server (Tahap 4): penggabungan perangkat & data yang tiba setelah tutup toko.
	const catatan = $derived(
		[
			r.digabung && 'Digabung dari beberapa perangkat.',
			r.dibuka_lagi_setelah && `Dibuka lagi setelah ditutup jam ${formatWaktuWib(r.dibuka_lagi_setelah)} WIB.`,
			r.jual_setelah_tutup && `${r.jual_setelah_tutup} penjualan masuk setelah tutup toko.`,
			r.batal_setelah_tutup && `${r.batal_setelah_tutup} pembatalan masuk setelah tutup toko.`
		].filter((x): x is string => !!x)
	);
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
	{#if catatan.length}
		<ul class="grid gap-1 text-sm text-muted">
			{#each catatan as c (c)}<li>• {c}</li>{/each}
		</ul>
	{/if}
	{#if r.jumlah_ditolak}
		<p class="rounded-xl bg-surface-2 p-3 text-sm font-semibold text-warn" role="alert">
			Termasuk {r.jumlah_ditolak} transaksi ditolak server (Rp{formatAngka(r.total_ditolak ?? 0)}). Uangnya tetap dihitung; cek menu Perlu perhatian.
		</p>
	{/if}
</div>
