<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { catatRusak } from '#lib/stok/api-lanjut.ts';
	import { muatDataStok, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import { ALASAN_RUSAK, LABEL_ALASAN } from '#lib/stok/tampil.ts';
	import type { AlasanRusak, ItemHitung } from '#lib/stok/types.ts';

	let data = $state<DataStok | null>(null);
	let pesan = $state('');
	let alasan = $state<AlasanRusak>('gosong');
	let catatan = $state('');
	let tercatat = $state('');
	let ulang = $state(0);
	// id per formulir: simpan dua kali tidak menggandakan.
	let id = $state(crypto.randomUUID());

	$effect(() => {
		void ulang;
		muatDataStok()
			.then((d) => (data = d))
			.catch((e) => (pesan = (e as Error).message));
	});

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);

	async function kirim(item: ItemHitung[]) {
		await catatRusak({ id, outlet_id: pos.outlet!.id, alasan, ...(catatan.trim() ? { catatan: catatan.trim() } : {}), item });
		tercatat = `Tercatat: ${item.length} bahan (${LABEL_ALASAN[alasan]}).`;
		id = crypto.randomUUID();
		catatan = '';
	}
</script>

<svelte:head><title>Catat Rusak · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Catat rusak/terbuang</h1>

{#if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ((pesan = ''), ulang++)}>Coba lagi</button>
{:else if !data}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else}
	<div class="mt-4 grid gap-3">
		<div class="grid gap-1.5">
			<label for="alasan-rusak" class="text-sm font-semibold">Alasan</label>
			<select id="alasan-rusak" bind:value={alasan} class="min-h-12 rounded-xl border border-line-strong bg-surface px-3">
				{#each ALASAN_RUSAK as a (a)}<option value={a}>{LABEL_ALASAN[a]}</option>{/each}
			</select>
		</div>
		<div class="grid gap-1.5">
			<label for="catatan-rusak" class="text-sm font-semibold">Catatan {alasan === 'lainnya' ? '(wajib)' : '(opsional)'}</label>
			<input id="catatan-rusak" bind:value={catatan} maxlength="200" class="min-h-12 rounded-xl border border-line-strong bg-surface px-3" />
		</div>
		{#if tercatat}<p class="rounded-xl bg-surface-2 p-3 font-semibold text-ok" role="status">{tercatat}</p>{/if}
		{#key id}<FormStokAwal {isian} opsional labelKirim="Catat rusak" onkirim={kirim} />{/key}
	</div>
{/if}
