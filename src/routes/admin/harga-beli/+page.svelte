<script lang="ts">
	import { onMount } from 'svelte';
	import HargaInput from '#lib/components/ui/HargaInput.svelte';
	import { muatHargaBeli, muatOutlets, muatSatuanBeli, simpanHargaBeli } from '#lib/master/api.ts';
	import { kunciHarga, petaHarga } from '#lib/master/susun.ts';
	import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let satuan = $state<SatuanBeli[]>([]);
	let harga = $state<HargaBeli[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');

	async function muat() {
		status = 'memuat';
		try {
			[outlets, satuan, harga] = await Promise.all([muatOutlets(), muatSatuanBeli(), muatHargaBeli()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const peta = $derived(petaHarga(harga, (h) => h.satuan_beli_id));

	async function ubah(o: Outlet, s: SatuanBeli, n: number) {
		await simpanHargaBeli(o.id, s.id, n);
		harga = [
			...harga.filter((h) => !(h.outlet_id === o.id && h.satuan_beli_id === s.id)),
			{ outlet_id: o.id, satuan_beli_id: s.id, harga: n, diubah_at: new Date().toISOString() }
		];
	}
</script>

<svelte:head><title>Harga Beli · Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Harga Beli</h1>
<p class="mt-1 max-w-prose text-muted">
	Harga beli per satuan beli di tiap outlet. Untuk barang berharga berubah-ubah (beras, tepung A, minyak), angka ini hanya acuan;
	harga sebenarnya diisi saat barang masuk.
</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	<ul class="mt-6 grid gap-3">
		{#each satuan as s (s.id)}
			<li class="rounded-2xl border border-line bg-surface p-4">
				<p class="font-semibold">{s.nama}</p>
				<p class="text-xs text-muted">{s.harga_tetap ? 'Harga tetap' : 'Harga berubah-ubah — acuan'}</p>
				<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
					{#each outlets as o (o.id)}
						<div>
							<p class="mb-1 text-xs font-semibold text-muted">{o.nama}</p>
							<HargaInput
								id="beli-{o.id}-{s.id}"
								label="Harga beli {s.nama} di {o.nama}"
								nilai={peta.get(kunciHarga(o.id, s.id)) ?? null}
								onsimpan={(n) => ubah(o, s, n)}
							/>
						</div>
					{/each}
				</div>
			</li>
		{/each}
	</ul>
{/if}
