<script lang="ts">
	import { onMount } from 'svelte';
	import ResepEditor from '#lib/components/master/ResepEditor.svelte';
	import HargaInput from '#lib/components/ui/HargaInput.svelte';
	import { muatBahan, muatHargaJual, muatMenu, muatOutlets, muatResep, simpanHargaJual, simpanResep } from '#lib/master/api.ts';
	import { kunciHarga, petaHarga, teksIsi } from '#lib/master/susun.ts';
	import type { Bahan, BarisIsi, HargaJual, Menu, Resep } from '#lib/master/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let menu = $state<Menu[]>([]);
	let harga = $state<HargaJual[]>([]);
	let resep = $state<Resep[]>([]);
	let bahan = $state<Bahan[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let diedit = $state<string | null>(null);

	const KELOMPOK: { judul: string; cocok: (m: Menu) => boolean }[] = [
		{ judul: 'Ayam Ori', cocok: (m) => m.varian === 'ori' },
		{ judul: 'Ayam Hot', cocok: (m) => m.varian === 'hot' },
		{ judul: 'Kulit, Nasi & Box', cocok: (m) => ['kulit', 'nasi', 'box'].includes(m.kategori) },
		{ judul: 'Pelengkap (Rp0)', cocok: (m) => m.kategori === 'pelengkap' }
	];

	async function muat() {
		status = 'memuat';
		try {
			[outlets, menu, harga, resep, bahan] = await Promise.all([muatOutlets(), muatMenu(), muatHargaJual(), muatResep(), muatBahan()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const peta = $derived(petaHarga(harga, (h) => h.menu_id));
	const resepDari = (m: Menu): BarisIsi[] => resep.filter((r) => r.menu_id === m.id);

	async function ubahHarga(o: Outlet, m: Menu, n: number) {
		await simpanHargaJual(o.id, m.id, n);
		harga = [...harga.filter((h) => !(h.outlet_id === o.id && h.menu_id === m.id)), { outlet_id: o.id, menu_id: m.id, harga: n }];
	}

	async function ubahResep(m: Menu, isi: BarisIsi[]) {
		await simpanResep(m.id, isi);
		resep = [...resep.filter((r) => r.menu_id !== m.id), ...isi.map((i) => ({ ...i, menu_id: m.id }))];
		diedit = null;
	}
</script>

<svelte:head><title>Menu & Harga · Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Menu & Harga</h1>
<p class="mt-1 max-w-prose text-muted">Harga jual per outlet. Ubah angka lalu tekan Enter atau pindah kolom untuk menyimpan.</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#each KELOMPOK as k (k.judul)}
		<h2 class="mt-8 font-display text-2xl">{k.judul}</h2>
		<ul class="mt-3 grid gap-3">
			{#each menu.filter(k.cocok) as m (m.id)}
				<li class="rounded-2xl border border-line bg-surface p-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<p class="font-semibold">{m.nama}</p>
						<button
							type="button"
							class="min-h-12 rounded-xl px-3 text-left text-sm text-muted hover:bg-surface-2"
							onclick={() => (diedit = diedit === m.id ? null : m.id)}
							aria-expanded={diedit === m.id}
						>
							Resep: {teksIsi(resepDari(m), bahan)} · <span class="font-semibold text-brand">Ubah</span>
						</button>
					</div>
					<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
						{#each outlets as o (o.id)}
							<div>
								<p class="mb-1 text-xs font-semibold text-muted">{o.nama}</p>
								<HargaInput
									id="harga-{o.id}-{m.id}"
									label="Harga {m.nama} di {o.nama}"
									nilai={peta.get(kunciHarga(o.id, m.id)) ?? null}
									maks={10_000_000}
									onsimpan={(n) => ubahHarga(o, m, n)}
								/>
							</div>
						{/each}
					</div>
					{#if diedit === m.id}
						<ResepEditor menu={m} {bahan} isi={resepDari(m)} onsimpan={(isi) => ubahResep(m, isi)} onbatal={() => (diedit = null)} />
					{/if}
				</li>
			{/each}
		</ul>
	{/each}
{/if}
