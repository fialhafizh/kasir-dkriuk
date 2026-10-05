<script lang="ts">
	import DaftarStok from '#lib/components/stok/DaftarStok.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { muatDataStok, muatStok, muatStokAwal, petaStok, type DataStok } from '#lib/stok/api.ts';
	import { susunStok } from '#lib/stok/tampil.ts';
	import type { StokAwal } from '#lib/stok/types.ts';
	import { muatOpname, muatTransfer } from '#lib/stok/api-lanjut.ts';
	import { perluOpname } from '#lib/stok/opname.ts';
	import type { Opname, Transfer } from '#lib/stok/types.ts';

	let data = $state<DataStok | null>(null);
	let stok = $state<Map<string, number>>(new Map());
	let awal = $state<StokAwal[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let ulang = $state(0);
	let transfer = $state<Transfer[]>([]);
	let opname = $state<Opname[]>([]);

	$effect(() => {
		const o = pos.outlet;
		void ulang;
		if (!o) return;
		let batal = false;
		status = 'memuat';
		Promise.all([muatDataStok(), muatStok(o.id), muatStokAwal(o.id), muatTransfer(o.id), muatOpname(o.id)])
			.then(([d, s, a, t, op]) => {
				if (batal) return;
				data = d;
				stok = petaStok(s, o.id);
				awal = a;
				transfer = t;
				opname = op;
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
	const masukMenunggu = $derived(transfer.filter((t) => t.ke_outlet_id === pos.outlet?.id && t.status === 'dikirim').length);
	const keluarMenunggu = $derived(transfer.filter((t) => t.dari_outlet_id === pos.outlet?.id && t.status === 'dikirim').length);
	const ingatOpname = $derived(perluOpname(new Date(), awal.find((a) => a.status === 'disetujui')?.dihitung_at ?? null, opname));
	const opnameMenunggu = $derived(opname.some((o) => o.status === 'diajukan'));
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
