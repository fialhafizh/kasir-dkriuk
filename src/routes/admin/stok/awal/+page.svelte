<script lang="ts">
	import { onMount } from 'svelte';
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatDataStok, muatStokAwal, putuskanStokAwal, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import type { ItemHitung, StokAwal } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let data = $state<DataStok | null>(null);
	let ajuan = $state<StokAwal[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		status = 'memuat';
		try {
			[outlets, data, ajuan] = await Promise.all([muatOutlets(), muatDataStok(), muatStokAwal()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const namaOutlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '';
	const menunggu = $derived(ajuan.filter((a) => a.status === 'diajukan'));
	const selesai = $derived(ajuan.filter((a) => a.status !== 'diajukan'));

	async function setujui(a: StokAwal, item: ItemHitung[]) {
		await putuskanStokAwal(a.id, true, item, null);
		await muat();
	}
	async function tolak(a: StokAwal) {
		pesanBaris[a.id] = '';
		try {
			await putuskanStokAwal(a.id, false, null, alasan[a.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[a.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Stok Awal · Admin · Kasir D'Kriuk</title></svelte:head>

<a href={href('/admin/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-3xl">Stok awal</h1>
<p class="mt-1 max-w-prose text-muted">
	Periksa hitungan kasir, betulkan bila perlu, lalu setujui. Hitungan berlaku pada saat kasir menghitung; penjualan
	sesudahnya tetap memotong.
</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#if menunggu.length === 0}
		<p class="mt-6 rounded-xl bg-surface-2 p-4 text-sm text-muted">Tidak ada ajuan yang menunggu.</p>
	{/if}
	{#each menunggu as a (a.id)}
		<section class="mt-6 grid gap-3 rounded-2xl border-2 border-brand p-4" aria-label="Ajuan {namaOutlet(a.outlet_id)}">
			<h2 class="font-display text-xl">{namaOutlet(a.outlet_id)} — dihitung {formatWaktuWib(a.dihitung_at)}</h2>
			{#key a.id}
				<FormStokAwal
					{isian}
					awal={new Map(a.item.map((i) => [i.bahan_id, i.qty_hitung]))}
					labelKirim="Setujui stok awal"
					onkirim={(item) => setujui(a, item)}
				/>
			{/key}
			<div class="flex flex-wrap items-center gap-2 border-t border-line pt-3">
				<label class="sr-only" for="tolak-{a.id}">Alasan penolakan</label>
				<input
					id="tolak-{a.id}"
					bind:value={alasan[a.id]}
					maxlength="200"
					placeholder="Alasan tolak, mis. hitung ulang ayam"
					class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3"
				/>
				<Konfirmasi label="Tolak" konfirmasiLabel="Ya, tolak" variant="ghost" onkonfirmasi={() => tolak(a)} />
			</div>
			{#if pesanBaris[a.id]}<p class="text-sm text-danger" role="alert">{pesanBaris[a.id]}</p>{/if}
		</section>
	{/each}

	{#if selesai.length}
		<h2 class="mt-8 font-display text-xl">Riwayat</h2>
		<ul class="mt-2 grid gap-2">
			{#each selesai as a (a.id)}
				<li class="rounded-xl bg-surface-2 px-3 py-2 text-sm">
					<span class="font-semibold">{namaOutlet(a.outlet_id)}</span> — {a.status === 'disetujui' ? 'Disetujui' : 'Ditolak'},
					dihitung {formatWaktuWib(a.dihitung_at)}{a.catatan ? ` — ${a.catatan}` : ''}
				</li>
			{/each}
		</ul>
	{/if}
{/if}
