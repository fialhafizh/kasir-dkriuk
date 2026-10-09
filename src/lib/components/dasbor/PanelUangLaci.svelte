<script lang="ts">
	import { muatSaldoLaci } from '#lib/kas/api.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { outlets, outlet, segar }: { outlets: Outlet[]; outlet: string | null; segar: number } = $props();
	let isi = $state<{ nama: string; saldo: number }[]>([]);
	let galat = $state('');
	const total = $derived(isi.reduce((t, x) => t + x.saldo, 0));

	let nomor = 0;
	async function muat() {
		const ini = ++nomor;
		try {
			const pilih = outlets.filter((o) => o.aktif && (!outlet || o.id === outlet));
			const hasil = await Promise.all(pilih.map(async (o) => ({ nama: o.nama, saldo: Number((await muatSaldoLaci(o.id)).saldo) || 0 })));
			if (ini !== nomor) return;
			isi = hasil;
			galat = '';
		} catch (e) {
			if (ini === nomor) galat = (e as Error).message;
		}
	}
	$effect(() => {
		void segar;
		void outlet;
		void muat();
	});
</script>

{#if galat}
	<p class="text-sm text-danger" role="alert">{galat}</p>
{:else}
	<div class="flex h-full flex-col justify-center">
		<p class="tabular font-display text-2xl leading-tight sm:text-3xl">Rp{formatAngka(total)}</p>
		{#if isi.length > 1}
			<ul class="text-xs text-muted">
				{#each isi as x (x.nama)}<li>{x.nama}: <span class="tabular">Rp{formatAngka(x.saldo)}</span></li>{/each}
			</ul>
		{/if}
	</div>
{/if}
