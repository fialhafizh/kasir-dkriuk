<script lang="ts">
	import TombolEkspor from '#lib/components/ekspor/TombolEkspor.svelte';
	import DaftarStok from '#lib/components/stok/DaftarStok.svelte';
	import { muatDataStok, muatStok, petaStok } from '#lib/stok/api.ts';
	import { susunStok } from '#lib/stok/tampil.ts';
	import type { BarisStok } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { outlets, outlet, segar }: { outlets: Outlet[]; outlet: string | null; segar: number } = $props();
	let isi = $state<{ outlet: Outlet; perhatian: BarisStok[]; aman: number }[]>([]);
	let galat = $state('');

	let nomor = 0;
	async function muat() {
		const ini = ++nomor;
		try {
			const [data, stok] = await Promise.all([muatDataStok(), muatStok(outlet ?? undefined)]);
			if (ini !== nomor) return;
			isi = outlets
				.filter((o) => o.aktif && (!outlet || o.id === outlet))
				.map((o) => {
					const baris = susunStok(data.bahan, data.satuan, data.isi, petaStok(stok, o.id));
					return { outlet: o, perhatian: baris.filter((b) => b.status !== 'aman'), aman: baris.filter((b) => b.status === 'aman').length };
				});
			if (ini === nomor) galat = '';
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
	<div class="grid h-full content-start gap-3 overflow-y-auto">
		<div><TombolEkspor kecil judul="Status stok" lembar={() => [{
			nama: 'Status stok',
			kolom: ['Outlet', 'Barang', 'Stok', 'Status'],
			baris: isi.flatMap((o) => o.perhatian.map((b) => [o.outlet.nama, b.label, b.teks, b.status === 'minus' ? 'Minus' : 'Menipis']))
		}]} /></div>
		{#each isi as o (o.outlet.id)}
			<section>
				<h3 class="mb-1 text-sm font-bold">{o.outlet.nama} <span class="font-normal text-muted">· {o.aman} aman</span></h3>
				{#if o.perhatian.length}<DaftarStok baris={o.perhatian} />{:else}<p class="text-sm text-ok">Semua aman</p>{/if}
			</section>
		{/each}
	</div>
{/if}
