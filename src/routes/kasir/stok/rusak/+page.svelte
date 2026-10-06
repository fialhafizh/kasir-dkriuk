<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import PitaSalinan from '#lib/components/stok/PitaSalinan.svelte';
	import { antrekan } from '#lib/kasir/antre.ts';
	import { buatKejadianRusak } from '#lib/kasir/offline-kasir.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import { stokKasir } from '#lib/stok/stok-kasir.svelte.ts';
	import { ALASAN_RUSAK, LABEL_ALASAN } from '#lib/stok/tampil.ts';
	import type { AlasanRusak, ItemHitung } from '#lib/stok/types.ts';

	const st = stokKasir();
	let alasan = $state<AlasanRusak>('gosong');
	let catatan = $state('');
	let tercatat = $state('');
	// Formulir baru setelah tersimpan (simpan dua kali dari formulir yang sama tidak menggandakan).
	let formulir = $state(0);

	const isian = $derived(st.nilai ? bentukIsian(st.nilai.data.bahan, st.nilai.data.satuan, st.nilai.data.isi) : []);

	async function kirim(item: ItemHitung[]) {
		const c = catatan.trim();
		if (alasan === 'lainnya' && c.length < 3) throw new Error('Catatan wajib diisi untuk alasan lainnya (3–200 karakter).');
		await antrekan(buatKejadianRusak(pos.outlet!.id, alasan, item, new Date(), c || undefined));
		tercatat = `Tercatat: ${item.length} bahan (${LABEL_ALASAN[alasan]}).`;
		catatan = '';
		formulir++;
	}
</script>

<svelte:head><title>Catat Rusak · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Catat rusak/terbuang</h1>

{#if st.status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{st.pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => st.ulang++}>Coba lagi</button>
{:else if !st.nilai}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else}
	<PitaSalinan salinanAt={st.nilai.salinanAt} belumTerkirim={0} />
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
		{#key formulir}<FormStokAwal {isian} opsional labelKirim="Catat rusak" onkirim={kirim} />{/key}
	</div>
{/if}
