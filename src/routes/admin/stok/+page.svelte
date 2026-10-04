<script lang="ts">
	import { onMount } from 'svelte';
	import DaftarStok from '#lib/components/stok/DaftarStok.svelte';
	import RiwayatGerakan from '#lib/components/stok/RiwayatGerakan.svelte';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatDataStok, muatGerakan, muatStok, muatStokAwal, petaStok, type DataStok } from '#lib/stok/api.ts';
	import { susunStok } from '#lib/stok/tampil.ts';
	import type { BarisStok, Gerakan, StokAwal } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let outletId = $state<string | null>(null);
	let data = $state<DataStok | null>(null);
	let stok = $state<Map<string, number>>(new Map());
	let awal = $state<StokAwal[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let dipilih = $state<BarisStok | null>(null);
	let gerakan = $state<Gerakan[]>([]);
	let pesanRiwayat = $state('');

	async function muatSemua() {
		status = 'memuat';
		try {
			[outlets, data] = await Promise.all([muatOutlets(), muatDataStok()]);
			outletId ??= outlets.find((o) => o.aktif)?.id ?? null;
			await muatOutlet();
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}

	async function muatOutlet() {
		const id = outletId;
		if (!id) {
			status = 'siap';
			return;
		}
		status = 'memuat';
		dipilih = null;
		gerakan = [];
		try {
			const [s, a] = await Promise.all([muatStok(id), muatStokAwal(id)]);
			if (id !== outletId) return;
			stok = petaStok(s, id);
			awal = a;
			status = 'siap';
		} catch (e) {
			if (id !== outletId) return;
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muatSemua);

	function gantiOutlet(id: string) {
		outletId = id;
		void muatOutlet();
	}

	async function pilih(b: BarisStok) {
		const oid = outletId!;
		dipilih = b;
		gerakan = [];
		pesanRiwayat = '';
		// Jawaban yang telat (outlet/bahan sudah berganti) diabaikan; kunci bahan sama di semua outlet.
		const masihSama = () => dipilih === b && outletId === oid;
		try {
			const g = await muatGerakan(oid, b.bahan_id);
			if (masihSama()) gerakan = g;
		} catch (e) {
			if (masihSama()) pesanRiwayat = (e as Error).message;
		}
	}

	const baris = $derived(data ? susunStok(data.bahan, data.satuan, data.isi, stok) : []);
	const disetujui = $derived(awal.some((a) => a.status === 'disetujui'));
	const menunggu = $derived(awal.some((a) => a.status === 'diajukan'));
	const namaBahan = $derived(new Map((data?.bahan ?? []).map((b) => [b.id, b.nama])));
</script>

<svelte:head><title>Stok · Admin · Kasir D'Kriuk</title></svelte:head>

<div class="flex flex-wrap items-center justify-between gap-3">
	<h1 class="font-display text-3xl">Stok</h1>
	<div class="flex flex-wrap gap-2">
		<a href={href('/admin/stok/masuk')} class="inline-flex min-h-12 items-center rounded-xl bg-brand px-4 font-semibold text-on-brand"
			>Barang masuk</a
		>
		<a href={href('/admin/stok/awal')} class="inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold"
			>Stok awal</a
		>
	</div>
</div>

<div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Pilih outlet">
	{#each outlets.filter((o) => o.aktif) as o (o.id)}
		<button
			type="button"
			aria-pressed={outletId === o.id}
			onclick={() => gantiOutlet(o.id)}
			class="min-h-12 rounded-xl border-2 border-line px-4 font-semibold aria-pressed:border-brand aria-pressed:text-brand">{o.nama}</button
		>
	{/each}
</div>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muatSemua}>Coba lagi</button>
{:else}
	{#if !disetujui}
		<p class="mt-4 rounded-xl border-2 border-warn bg-surface p-3 text-sm font-semibold" role="status">
			Belum ada stok awal untuk outlet ini{menunggu ? ' — ada ajuan yang menunggu persetujuan Anda' : ''}. Angka di bawah
			hanya dari barang masuk & penjualan, tanpa tanda menipis/minus.
			{#if menunggu}<a class="text-brand underline" href={href('/admin/stok/awal')}>Tinjau sekarang</a>{/if}
		</p>
	{/if}
	<div class="mt-4 grid gap-4 lg:grid-cols-2">
		<DaftarStok {baris} tanpaStatus={!disetujui} dipilih={dipilih?.kunci ?? null} onpilih={pilih} />
		<section aria-label="Riwayat gerakan" class="lg:sticky lg:top-20 lg:self-start">
			{#if dipilih}
				<h2 class="mb-2 font-display text-xl">Riwayat {dipilih.label}</h2>
				{#if pesanRiwayat}<p class="text-sm text-danger" role="alert">{pesanRiwayat}</p>{/if}
				<RiwayatGerakan {gerakan} {namaBahan} />
			{:else}
				<p class="rounded-xl bg-surface-2 p-4 text-sm text-muted">Ketuk satu bahan untuk melihat riwayatnya.</p>
			{/if}
		</section>
	</div>
{/if}
