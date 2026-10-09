<script lang="ts">
	// Halaman Bantuan: daftar topik untuk peran ini, pencarian, buka-tutup, cetak. Isi dari #lib/bantuan/isi.ts.
	import { page } from '$app/state';
	import { ALUR_HARIAN, bagianUntuk, cocok, tebal } from '#lib/bantuan/isi.ts';

	let { peran }: { peran: 'kasir' | 'admin' } = $props();
	let kata = $state('');
	const bagian = $derived(bagianUntuk(peran).map((b) => ({ ...b, topik: b.topik.filter((t) => cocok(t, kata)) })).filter((b) => b.topik.length));
	// ?topik=… di alamat (dari tombol "?") → topik itu terbuka & digulir
	const tujuan = $derived(page.url.searchParams.get('topik') ?? '');
	$effect(() => {
		if (tujuan) requestAnimationFrame(() => document.getElementById(tujuan)?.scrollIntoView({ block: 'start' }));
	});
</script>

<svelte:head><title>Bantuan · D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Bantuan</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Panduan singkat semua fitur. Bisa dibuka tanpa internet.
	<a class="underline" href="panduan.html" target="_blank" rel="noopener">Buka panduan infografis lengkap</a>.
</p>

<div class="tanpa-cetak mt-3 flex flex-wrap gap-2">
	<input type="search" bind:value={kata} placeholder="Cari, mis. setoran, opname, printer…" aria-label="Cari bantuan"
		class="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-sm" />
	<button type="button" class="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold" onclick={() => print()}>Cetak</button>
</div>

{#if !kata}
	<section class="mt-4 rounded-2xl bg-surface-2 p-3">
		<h2 class="font-bold">Alur harian</h2>
		<ol class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
			{#each ALUR_HARIAN as a, i (a.judul)}
				<li class="rounded-xl bg-surface p-2 text-sm">
					<span class="text-xl" aria-hidden="true">{a.ikon}</span>
					<p class="font-semibold">{i + 1}. {a.judul}</p>
					<p class="text-xs text-muted">{a.isi}</p>
				</li>
			{/each}
		</ol>
	</section>
{/if}

{#each bagian as b (b.id)}
	<section class="mt-6">
		<h2 class="font-display text-2xl"><span aria-hidden="true">{b.ikon}</span> {b.judul}</h2>
		<p class="text-sm text-muted">{b.pengantar}</p>
		<div class="mt-2 grid gap-2">
			{#each b.topik as t (t.id)}
				<details id={t.id} class="rounded-2xl border border-line bg-surface p-3" open={!!kata || tujuan === t.id}>
					<summary class="cursor-pointer font-semibold"><span aria-hidden="true">{t.ikon}</span> {t.judul}</summary>
					{#if t.menu}<p class="mt-1 text-xs text-muted">Di menu: {t.menu}</p>{/if}
					<p class="mt-2 text-sm">{@html tebal(t.ringkas)}</p>
					{#if t.langkah}
						<ol class="mt-2 grid list-decimal gap-1 pl-5 text-sm">{#each t.langkah as l (l)}<li>{@html tebal(l)}</li>{/each}</ol>
					{/if}
					{#if t.catatan}
						<ul class="mt-2 grid list-disc gap-1 pl-5 text-sm">{#each t.catatan as c (c)}<li>{@html tebal(c)}</li>{/each}</ul>
					{/if}
					{#if t.awas}
						<ul class="mt-2 grid gap-1 rounded-xl border-2 border-warn p-2 text-sm">{#each t.awas as a (a)}<li>⚠️ {@html tebal(a)}</li>{/each}</ul>
					{/if}
				</details>
			{/each}
		</div>
	</section>
{:else}
	<p class="mt-6 text-muted">Tidak ada topik yang cocok.</p>
{/each}
