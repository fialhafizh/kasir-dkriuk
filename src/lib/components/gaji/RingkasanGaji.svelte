<script lang="ts">
	// Ringkasan gaji sebulan untuk outlet terpilih atau semua outlet; salin WA, kirim Telegram, Excel.
	import TombolBagikan from '#lib/components/ekspor/TombolBagikan.svelte';
	import TombolEkspor from '#lib/components/ekspor/TombolEkspor.svelte';
	import { hitungGaji, type RekapGaji } from '#lib/kas/gaji.ts';
	import { lembarGaji, namaBulan, ringkasGaji, teksGaji, type BarisRingkasGaji } from '#lib/kas/ringkasan-gaji.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { outlets, outletId, bulan, rekap }: { outlets: Outlet[]; outletId: string; bulan: string; rekap: RekapGaji[] } = $props();
	let semua = $state(false);
	let lain = $state<{ outlet: string; rekap: RekapGaji[] }[] | null>(null);
	let galat = $state('');

	$effect(() => {
		if (!semua) return;
		void rekap; // dimuat ulang setelah gaji/kasbon outlet terpilih berubah
		const b = bulan;
		lain = null;
		let batal = false;
		Promise.all(outlets.filter((o) => o.aktif).map(async (o) => ({ outlet: o.nama, rekap: await hitungGaji(o.id, b) })))
			.then((d) => {
				if (!batal) (lain = d), (galat = '');
			})
			.catch((e) => {
				if (!batal) (galat = (e as Error).message), (lain = []);
			});
		return () => {
			batal = true;
		};
	});
	const namaOutlet = $derived(outlets.find((o) => o.id === outletId)?.nama ?? '');
	const baris: BarisRingkasGaji[] = $derived(semua ? ringkasGaji(lain ?? []) : ringkasGaji([{ outlet: namaOutlet, rekap }]));
	const total = (k: 'kotor' | 'kasbon' | 'total') => baris.reduce((t, b) => t + b[k], 0);
	const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${formatAngka(Math.abs(n))}`;
</script>

<section class="mt-8">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="font-display text-2xl">Ringkasan gaji {namaBulan(bulan)}</h2>
		<label class="tanpa-cetak flex items-center gap-2 text-sm"><input type="checkbox" class="size-5" bind:checked={semua} />Semua outlet</label>
	</div>
	{#if galat}<p class="text-danger" role="alert">{galat}</p>{/if}
	{#if semua && !lain}
		<p class="text-muted" role="status">Memuat…</p>
	{:else}
		<div class="mt-2 overflow-x-auto">
			<table class="w-full min-w-[36rem] text-sm">
				<thead class="text-left text-xs text-muted">
					<tr>
						<th class="py-1 pr-2">Nama</th>
						{#if semua}<th class="py-1 pr-2">Outlet</th>{/if}
						<th class="py-1 pr-2 text-right">Gaji/hari</th>
						<th class="py-1 pr-2 text-right">Hari masuk</th>
						<th class="py-1 pr-2 text-right">Gaji sebulan</th>
						<th class="py-1 pr-2 text-right">Kasbon</th>
						<th class="py-1 text-right">Total</th>
					</tr>
				</thead>
				<tbody>
					{#each baris as b, i (i)}
						<tr class="border-t border-line">
							<td class="py-1.5 pr-2">{b.nama}{b.dibayar ? '' : ' *'}</td>
							{#if semua}<td class="py-1.5 pr-2 text-muted">{b.outlet}</td>{/if}
							<td class="tabular py-1.5 pr-2 text-right">{rp(b.upah)}</td>
							<td class="tabular py-1.5 pr-2 text-right">{b.hari}</td>
							<td class="tabular py-1.5 pr-2 text-right">{rp(b.kotor)}{b.penyesuaian ? ` (${b.penyesuaian > 0 ? '+' : '−'}${formatAngka(Math.abs(b.penyesuaian))})` : ''}</td>
							<td class="tabular py-1.5 pr-2 text-right">{b.kasbon ? rp(b.kasbon) : ''}</td>
							<td class="tabular py-1.5 text-right font-semibold">{rp(b.total)}</td>
						</tr>
					{/each}
					<tr class="border-t-2 border-line-strong font-bold">
						<td class="py-2" colspan={semua ? 4 : 3}>Jumlah</td>
						<td class="tabular py-2 pr-2 text-right">{rp(total('kotor'))}</td>
						<td class="tabular py-2 pr-2 text-right">{rp(total('kasbon'))}</td>
						<td class="tabular py-2 text-right">{rp(total('total'))}</td>
					</tr>
				</tbody>
			</table>
		</div>
		<p class="mt-1 text-xs text-muted">* belum dibayar: kasbon & total masih perkiraan (seluruh sisa kasbon dipotong sebatas gaji).</p>
		<div class="mt-2 flex flex-wrap gap-2">
			<TombolBagikan jenis="gaji" teks={() => teksGaji(bulan, baris, semua)} />
			<TombolEkspor judul="Gaji {namaBulan(bulan)}" lembar={() => [lembarGaji(bulan, baris)]} cetak />
		</div>
	{/if}
</section>
