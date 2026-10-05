<script lang="ts">
	import DaftarStok from '#lib/components/stok/DaftarStok.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { muatDataStok, muatStok, muatStokAwal, petaStok, type DataStok } from '#lib/stok/api.ts';
	import { susunStok } from '#lib/stok/tampil.ts';
	import type { StokAwal } from '#lib/stok/types.ts';

	let data = $state<DataStok | null>(null);
	let stok = $state<Map<string, number>>(new Map());
	let awal = $state<StokAwal[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let ulang = $state(0);

	$effect(() => {
		const o = pos.outlet;
		void ulang;
		if (!o) return;
		let batal = false;
		status = 'memuat';
		Promise.all([muatDataStok(), muatStok(o.id), muatStokAwal(o.id)])
			.then(([d, s, a]) => {
				if (batal) return;
				data = d;
				stok = petaStok(s, o.id);
				awal = a;
				status = 'siap';
			})
			.catch((e) => {
				if (batal) return;
				pesan = (e as Error).message;
				status = 'gagal';
			});
		return () => {
			batal = true;
		};
	});

	const baris = $derived(data ? susunStok(data.bahan, data.satuan, data.isi, stok) : []);
	const disetujui = $derived(awal.some((a) => a.status === 'disetujui'));
	const menunggu = $derived(awal.some((a) => a.status === 'diajukan'));
	const ditolak = $derived(!disetujui && !menunggu ? awal.find((a) => a.status === 'ditolak') : undefined);
</script>

<svelte:head><title>Stok · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-2xl">Stok {pos.outlet?.nama}</h1>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ulang++}>Coba lagi</button>
{:else}
	{#if !disetujui}
		<div class="mt-4 rounded-2xl border-2 border-warn bg-surface p-4">
			{#if menunggu}
				<p class="font-semibold">Stok awal sudah dikirim, menunggu persetujuan admin.</p>
			{:else}
				<p class="font-semibold">Stok awal belum diisi.</p>
				<p class="mt-1 text-sm text-muted">Hitung semua bahan di outlet, lalu kirim ke admin. Jualan tetap bisa jalan.</p>
				{#if ditolak?.catatan}<p class="mt-1 text-sm text-danger">Ditolak admin: {ditolak.catatan}</p>{/if}
				<a href={href('/kasir/stok/awal')} class="mt-3 inline-flex min-h-12 items-center rounded-xl bg-brand px-4 font-semibold text-on-brand"
					>Isi stok awal</a
				>
			{/if}
		</div>
	{/if}
	<div class="mt-4"><DaftarStok {baris} tanpaStatus={!disetujui} /></div>
{/if}
