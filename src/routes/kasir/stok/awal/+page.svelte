<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import PitaSalinan from '#lib/components/stok/PitaSalinan.svelte';
	import { antrekan } from '#lib/kasir/antre.ts';
	import { buatKejadianHitung } from '#lib/kasir/offline-kasir.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import { stokKasir } from '#lib/stok/stok-kasir.svelte.ts';
	import type { ItemHitung } from '#lib/stok/types.ts';

	const st = stokKasir();
	let terkirim = $state(false);
	const idHitung = crypto.randomUUID();

	const v = $derived(st.nilai);
	const isian = $derived(v ? bentukIsian(v.data.bahan, v.data.satuan, v.data.isi) : []);
	const bisa = $derived(!(v?.awal ?? []).some((a) => a.status === 'diajukan' || a.status === 'disetujui'));

	async function kirim(item: ItemHitung[]) {
		await antrekan(buatKejadianHitung('stok_awal', pos.outlet!.id, item, new Date(), idHitung));
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

{#if terkirim}
	<p class="mt-4 rounded-xl bg-surface-2 p-4 font-semibold text-ok" role="status">Tercatat dan dikirim ke admin (otomatis saat online). Menunggu persetujuan admin.</p>
	<a href={href('/kasir/stok')} class="mt-3 inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Kembali ke Stok</a>
{:else if st.status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if st.status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{st.pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => st.ulang++}>Coba lagi</button>
{:else if !bisa}
	<p class="mt-4 rounded-xl bg-surface-2 p-4">Stok awal outlet ini sudah dikirim atau sudah disetujui.</p>
{:else}
	<PitaSalinan salinanAt={v?.salinanAt ?? null} belumTerkirim={0} />
	<div class="mt-4"><FormStokAwal {isian} labelKirim="Kirim ke admin" onkirim={kirim} /></div>
{/if}
