<script lang="ts">
	import type { MenuJual } from '#lib/kasir/types.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { menu, ontambah, onnasibox }: { menu: MenuJual[]; ontambah: (m: MenuJual) => void; onnasibox: () => void } = $props();

	const KELOMPOK = [
		{ judul: 'Ori', cocok: (m: MenuJual) => m.varian === 'ori' },
		{ judul: 'Hot', cocok: (m: MenuJual) => m.varian === 'hot' },
		{ judul: 'Kulit · Nasi · Box', cocok: (m: MenuJual) => ['kulit', 'nasi', 'box'].includes(m.kategori) },
		{ judul: 'Pelengkap', cocok: (m: MenuJual) => m.kategori === 'pelengkap' }
	];
	const adaNasiBox = $derived(menu.some((m) => m.kode === 'nasi') && menu.some((m) => m.kode === 'box'));
</script>

<div class="grid gap-4">
	{#each KELOMPOK as k (k.judul)}
		{@const isi = menu.filter(k.cocok)}
		{#if isi.length}
			<section aria-label={k.judul}>
				<h2 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{k.judul}</h2>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{#each isi as m (m.id)}
						<button
							type="button"
							onclick={() => ontambah(m)}
							class="flex min-h-20 flex-col items-start justify-between rounded-2xl border-2 p-3 text-left active:scale-[0.98] focus-visible:outline-3 focus-visible:outline-focus {m.varian === 'hot'
								? 'border-brand bg-brand/10'
								: m.kategori === 'pelengkap'
									? 'border-line bg-surface-2'
									: 'border-accent bg-accent/15'}"
						>
							<span class="font-bold leading-tight">{m.nama}</span>
							<span class="tabular text-sm text-muted">{m.harga ? `Rp${formatAngka(m.harga)}` : 'Gratis'}</span>
						</button>
					{/each}
					{#if k.judul === 'Kulit · Nasi · Box' && adaNasiBox}
						<button
							type="button"
							onclick={onnasibox}
							class="flex min-h-20 flex-col items-start justify-between rounded-2xl border-2 border-dashed border-brand p-3 text-left font-bold focus-visible:outline-3 focus-visible:outline-focus"
						>
							Nasi Box
							<span class="text-sm font-normal text-muted">Nasi + Box</span>
						</button>
					{/if}
				</div>
			</section>
		{/if}
	{/each}
</div>
