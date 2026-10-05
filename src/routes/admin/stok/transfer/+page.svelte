<script lang="ts">
	import { onMount } from 'svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatBahan, muatOutlets } from '#lib/master/api.ts';
	import type { Bahan } from '#lib/master/types.ts';
	import { href } from '#lib/nav.ts';
	import { batalTransfer, muatTransfer } from '#lib/stok/api-lanjut.ts';
	import { angkaStok } from '#lib/stok/tampil.ts';
	import type { Transfer } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let bahan = $state<Bahan[]>([]);
	let daftar = $state<Transfer[]>([]);
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		pesan = '';
		try {
			[outlets, bahan, daftar] = await Promise.all([muatOutlets(), muatBahan(), muatTransfer()]);
		} catch (e) {
			pesan = (e as Error).message;
		}
	}
	onMount(muat);
	const outlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '';
	const nama = (id: string) => bahan.find((b) => b.id === id)?.nama ?? '';
	const LABEL = { dikirim: 'Menunggu diterima', diterima: 'Diterima', dibatalkan: 'Dibatalkan' } as const;

	async function batal(t: Transfer) {
		pesanBaris[t.id] = '';
		try {
			await batalTransfer(t.id, alasan[t.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[t.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Transfer · Admin · Kasir D'Kriuk</title></svelte:head>

<a href={href('/admin/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-3xl">Transfer antar outlet</h1>
{#if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-2 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else if daftar.length === 0}
	<p class="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada transfer.</p>
{:else}
	<ul class="mt-4 grid gap-2">
		{#each daftar as t (t.id)}
			<li class="rounded-2xl border bg-surface p-3 {t.status === 'dikirim' ? 'border-warn' : 'border-line'}">
				<p class="flex flex-wrap justify-between gap-2">
					<span class="font-semibold">{outlet(t.dari_outlet_id)} → {outlet(t.ke_outlet_id)}</span>
					<span class="text-sm text-muted">{LABEL[t.status]} · {formatWaktuWib(t.dikirim_at)}</span>
				</p>
				<p class="text-sm">{t.item.map((i) => `${angkaStok(i.qty)} ${nama(i.bahan_id)}`).join(', ')}</p>
				{#if t.catatan}<p class="text-sm text-muted">{t.catatan}</p>{/if}
				{#if t.status === 'dibatalkan'}<p class="text-sm text-danger">Dibatalkan: {t.batal_alasan}</p>{/if}
				{#if t.status === 'dikirim'}
					<div class="mt-2 flex flex-wrap items-center gap-2">
						<label class="sr-only" for="alasan-{t.id}">Alasan pembatalan</label>
						<input id="alasan-{t.id}" bind:value={alasan[t.id]} maxlength="200" placeholder="Alasan batal" class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3" />
						<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(t)} />
					</div>
					{#if pesanBaris[t.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[t.id]}</p>{/if}
				{/if}
			</li>
		{/each}
	</ul>
{/if}
