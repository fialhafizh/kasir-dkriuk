<script lang="ts">
	import Petunjuk from '#lib/components/bantuan/Petunjuk.svelte';
	import DaftarStok from '#lib/components/stok/DaftarStok.svelte';
	import PitaSalinan from '#lib/components/stok/PitaSalinan.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { perluOpname } from '#lib/stok/opname.ts';
	import { stokKasir } from '#lib/stok/stok-kasir.svelte.ts';
	import { susunStok } from '#lib/stok/tampil.ts';

	const st = stokKasir();
	const status = $derived(st.status);
	const pesan = $derived(st.pesan);
	const v = $derived(st.nilai);
	const awal = $derived(v?.awal ?? []);
	const transfer = $derived(v?.transfer ?? []);
	const opname = $derived(v?.opname ?? []);
	const baris = $derived(v ? susunStok(v.data.bahan, v.data.satuan, v.data.isi, v.stok) : []);
	const disetujui = $derived(awal.some((a) => a.status === 'disetujui'));
	const menunggu = $derived(awal.some((a) => a.status === 'diajukan'));
	const masukMenunggu = $derived(transfer.filter((t) => t.ke_outlet_id === pos.outlet?.id && t.status === 'dikirim').length);
	const keluarMenunggu = $derived(transfer.filter((t) => t.dari_outlet_id === pos.outlet?.id && t.status === 'dikirim').length);
	const ingatOpname = $derived(perluOpname(new Date(), awal.find((a) => a.status === 'disetujui')?.dihitung_at ?? null, opname));
	const opnameMenunggu = $derived(opname.some((o) => o.status === 'diajukan'));
	const ditolak = $derived(!disetujui && !menunggu ? awal.find((a) => a.status === 'ditolak') : undefined);
</script>

<svelte:head><title>Stok · Kasir D'Kriuk</title></svelte:head>

<div class="flex items-center gap-2"><h1 class="font-display text-2xl">Stok {pos.outlet?.nama}</h1><Petunjuk topik="stok-kasir" peran="kasir" /></div>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => st.ulang++}>Coba lagi</button>
{:else}
	<PitaSalinan salinanAt={v?.salinanAt ?? null} belumTerkirim={v?.belumTerkirim ?? 0} />
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
	{#if disetujui}
		{#if ingatOpname}
			<p class="mt-4 rounded-xl border-2 border-warn bg-surface p-3 font-semibold" role="status">
				Waktunya opname mingguan. <a class="text-brand underline" href={href('/kasir/stok/opname')}>Mulai opname</a>
			</p>
		{:else if opnameMenunggu}
			<p class="mt-4 rounded-xl bg-surface-2 p-3 text-sm" role="status">Opname minggu ini sudah dikirim, menunggu persetujuan admin.</p>
		{/if}
		<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
			<a href={href('/kasir/stok/rusak')} class="flex min-h-14 items-center justify-center rounded-2xl bg-surface-2 px-3 text-center font-semibold">Catat rusak</a>
			<a href={href('/kasir/stok/kirim')} class="flex min-h-14 items-center justify-center rounded-2xl bg-surface-2 px-3 text-center font-semibold"
				>Kirim ke outlet lain{keluarMenunggu ? ` (${keluarMenunggu})` : ''}</a
			>
			<a href={href('/kasir/stok/terima')} class="flex min-h-14 items-center justify-center rounded-2xl px-3 text-center font-semibold {masukMenunggu ? 'bg-brand text-on-brand' : 'bg-surface-2'}"
				>Terima kiriman{masukMenunggu ? ` (${masukMenunggu})` : ''}</a
			>
			<a href={href('/kasir/stok/opname')} class="flex min-h-14 items-center justify-center rounded-2xl bg-surface-2 px-3 text-center font-semibold">Opname</a>
		</div>
	{/if}
	{#if !disetujui && masukMenunggu}
		<!-- Kiriman bisa datang sebelum stok awal disetujui; penerima tetap harus bisa mengonfirmasi. -->
		<a href={href('/kasir/stok/terima')} class="mt-4 flex min-h-14 items-center justify-center rounded-2xl bg-brand px-3 font-semibold text-on-brand"
			>Terima kiriman ({masukMenunggu})</a
		>
	{/if}
	<div class="mt-4"><DaftarStok {baris} tanpaStatus={!disetujui} tanpaAngka={ingatOpname} /></div>
{/if}
