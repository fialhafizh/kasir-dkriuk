<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { ajukanStokAwal, muatDataStok, muatStokAwal, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import type { ItemHitung, StokAwal } from '#lib/stok/types.ts';

	let data = $state<DataStok | null>(null);
	let awal = $state<StokAwal[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let terkirim = $state(false);
	let ulang = $state(0);

	$effect(() => {
		const o = pos.outlet;
		if (!o) return;
		let batal = false;
		void ulang;
		terkirim = false;
		status = 'memuat';
		Promise.all([muatDataStok(), muatStokAwal(o.id)])
			.then(([d, a]) => {
				if (batal) return;
				data = d;
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

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const bisa = $derived(!awal.some((a) => a.status === 'diajukan' || a.status === 'disetujui'));

	async function kirim(item: ItemHitung[]) {
		await ajukanStokAwal(pos.outlet!.id, item);
		terkirim = true;
	}
</script>

<svelte:head><title>Isi Stok Awal · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Isi stok awal {pos.outlet?.nama}</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Hitung semua bahan yang ada sekarang. Ayam dihitung per potongan. Isi 0 bila habis. Penjualan setelah dikirim tetap
	memotong stok otomatis.
</p>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ulang++}>Coba lagi</button>
{:else if terkirim}
	<p class="mt-4 rounded-xl bg-surface-2 p-4 font-semibold text-ok" role="status">Terkirim. Menunggu persetujuan admin.</p>
	<a href={href('/kasir/stok')} class="mt-3 inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Kembali ke Stok</a>
{:else if !bisa}
	<p class="mt-4 rounded-xl bg-surface-2 p-4">Stok awal outlet ini sudah dikirim atau sudah disetujui.</p>
{:else}
	<div class="mt-4"><FormStokAwal {isian} labelKirim="Kirim ke admin" onkirim={kirim} /></div>
{/if}
