<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { ajukanOpname, muatOpname, muatTransfer } from '#lib/stok/api-lanjut.ts';
	import { muatDataStok, muatStokAwal, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import type { ItemHitung } from '#lib/stok/types.ts';

	let data = $state<DataStok | null>(null);
	let halangan = $state('');
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let terkirim = $state(false);
	let ulang = $state(0);

	$effect(() => {
		const o = pos.outlet;
		void ulang;
		if (!o) return;
		let batal = false;
		status = 'memuat';
		terkirim = false;
		Promise.all([muatDataStok(), muatStokAwal(o.id), muatOpname(o.id), muatTransfer(o.id)])
			.then(([d, a, op, t]) => {
				if (batal) return;
				data = d;
				halangan = !a.some((x) => x.status === 'disetujui')
					? 'Stok awal outlet ini belum disetujui admin.'
					: op.some((x) => x.status === 'diajukan')
						? 'Opname sebelumnya masih menunggu persetujuan admin.'
						: t.some((x) => x.status === 'dikirim')
							? 'Masih ada kiriman/penerimaan yang belum selesai. Selesaikan dulu sebelum opname.'
							: '';
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

	async function kirim(item: ItemHitung[]) {
		await ajukanOpname(pos.outlet!.id, item);
		terkirim = true;
	}
</script>

<svelte:head><title>Opname · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Opname mingguan {pos.outlet?.nama}</h1>
<p class="mt-1 max-w-prose text-sm text-muted">Hitung semua bahan yang ada sekarang dan isi apa adanya. Isi 0 bila habis. Penjualan sesudah dikirim tetap memotong stok.</p>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ulang++}>Coba lagi</button>
{:else if terkirim}
	<p class="mt-4 rounded-xl bg-surface-2 p-4 font-semibold text-ok" role="status">Opname terkirim. Menunggu persetujuan admin.</p>
	<a href={href('/kasir/stok')} class="mt-3 inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Kembali ke Stok</a>
{:else if halangan}
	<p class="mt-4 rounded-xl border-2 border-warn bg-surface p-4" role="status">{halangan}</p>
{:else}
	<div class="mt-4"><FormStokAwal {isian} labelKirim="Kirim opname ke admin" onkirim={kirim} /></div>
{/if}
