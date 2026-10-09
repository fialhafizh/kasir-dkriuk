<script lang="ts">
	// Tombol "?" kecil: ringkasan satu topik Bantuan + tautan ke penjelasan lengkap.
	import { cariTopik, tebal } from '#lib/bantuan/isi.ts';
	import { href } from '#lib/nav.ts';

	let { topik, peran = 'kasir' }: { topik: string; peran?: 'kasir' | 'admin' } = $props();
	const t = $derived(cariTopik(topik));
	let buka = $state(false);
</script>

{#if t}
	<span class="tanpa-cetak relative inline-block">
		<button type="button" class="grid size-8 place-items-center rounded-full bg-surface-2 text-sm font-bold text-muted hover:text-fg"
			aria-label="Petunjuk: {t.judul}" aria-expanded={buka} onclick={() => (buka = !buka)}>?</button>
		{#if buka}
			<div class="absolute right-0 z-30 mt-1 w-72 max-w-[85vw] rounded-2xl border border-line bg-surface p-3 text-left text-sm font-normal shadow-lg" role="dialog" aria-label={t.judul}>
				<p class="font-semibold">{t.ikon} {t.judul}</p>
				<p class="mt-1">{@html tebal(t.ringkas)}</p>
				{#if t.langkah}
					<ol class="mt-1 list-decimal pl-5 text-xs">{#each t.langkah.slice(0, 4) as l (l)}<li>{@html tebal(l)}</li>{/each}</ol>
				{/if}
				<div class="mt-2 flex justify-between gap-2">
					<a class="text-xs font-semibold underline" href={href(`/${peran}/bantuan?topik=${t.id}`)}>Selengkapnya</a>
					<button type="button" class="text-xs text-muted" onclick={() => (buka = false)}>Tutup</button>
				</div>
			</div>
		{/if}
	</span>
{/if}
