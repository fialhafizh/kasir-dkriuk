<script lang="ts">
	import { onMount } from 'svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatBahan, muatOutlets } from '#lib/master/api.ts';
	import type { Bahan } from '#lib/master/types.ts';
	import { href } from '#lib/nav.ts';
	import { batalRusak, muatRusak } from '#lib/stok/api-lanjut.ts';
	import { LABEL_ALASAN, angkaStok } from '#lib/stok/tampil.ts';
	import type { Rusak } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let bahan = $state<Bahan[]>([]);
	let outletId = $state<string | null>(null);
	let daftar = $state<Rusak[]>([]);
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muatDaftar() {
		const id = outletId;
		if (!id) return;
		pesan = '';
		try {
			const d = await muatRusak(id);
			if (id === outletId) daftar = d;
		} catch (e) {
			if (id === outletId) pesan = (e as Error).message;
		}
	}
	onMount(async () => {
		try {
			[outlets, bahan] = await Promise.all([muatOutlets(), muatBahan()]);
			outletId = outlets.find((o) => o.aktif)?.id ?? null;
			await muatDaftar();
		} catch (e) {
			pesan = (e as Error).message;
		}
	});
	const nama = (id: string) => bahan.find((b) => b.id === id)?.nama ?? '';

	async function batal(r: Rusak) {
		pesanBaris[r.id] = '';
		try {
			await batalRusak(r.id, alasan[r.id] ?? '');
			await muatDaftar();
		} catch (e) {
			pesanBaris[r.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Rusak · Admin · Kasir D'Kriuk</title></svelte:head>

<a href={href('/admin/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-3xl">Rusak/terbuang</h1>
<div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Pilih outlet">
	{#each outlets.filter((o) => o.aktif) as o (o.id)}
		<button type="button" aria-pressed={outletId === o.id} onclick={() => ((outletId = o.id), (daftar = []), void muatDaftar())}
			class="min-h-12 rounded-xl border-2 border-line px-4 font-semibold aria-pressed:border-brand aria-pressed:text-brand">{o.nama}</button>
	{/each}
</div>
{#if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-2 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muatDaftar}>Coba lagi</button>
{:else if daftar.length === 0}
	<p class="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada catatan rusak.</p>
{:else}
	<ul class="mt-4 grid gap-2">
		{#each daftar as r (r.id)}
			<li class="rounded-2xl border border-line bg-surface p-3 {r.batal_at ? 'opacity-60' : ''}">
				<p class="flex flex-wrap justify-between gap-2"><span class="font-semibold">{LABEL_ALASAN[r.alasan]}</span><span class="text-sm text-muted">{formatWaktuWib(r.waktu)}</span></p>
				<p class="text-sm">{r.item.map((i) => `${angkaStok(i.qty)} ${nama(i.bahan_id)}`).join(', ')}</p>
				{#if r.catatan}<p class="text-sm text-muted">{r.catatan}</p>{/if}
				{#if r.batal_at}
					<p class="text-sm font-semibold text-danger">Dibatalkan: {r.batal_alasan}</p>
				{:else}
					<div class="mt-2 flex flex-wrap items-center gap-2">
						<label class="sr-only" for="alasan-{r.id}">Alasan pembatalan</label>
						<input id="alasan-{r.id}" bind:value={alasan[r.id]} maxlength="200" placeholder="Alasan batal" class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3" />
						<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(r)} />
					</div>
					{#if pesanBaris[r.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[r.id]}</p>{/if}
				{/if}
			</li>
		{/each}
	</ul>
{/if}
