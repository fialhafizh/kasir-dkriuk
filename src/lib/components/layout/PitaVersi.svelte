<script lang="ts">
	import { onMount } from 'svelte';
	import { sinkron } from '#lib/offline/sinkron.svelte.ts';

	let siap = $state<ServiceWorker | null>(null);

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;
		void navigator.serviceWorker.getRegistration().then((reg) => {
			if (!reg) return;
			if (reg.waiting) siap = reg.waiting;
			reg.addEventListener('updatefound', () => {
				const w = reg.installing;
				w?.addEventListener('statechange', () => {
					if (w.state === 'installed' && navigator.serviceWorker.controller) siap = w;
				});
			});
		});
		navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
		// Minta penyimpanan permanen supaya antrean tidak dihapus browser.
		void navigator.storage?.persist?.();
	});

	const tertahan = $derived(sinkron.menunggu + sinkron.ditolak > 0);
</script>

{#if siap}
	<div class="flex flex-wrap items-center gap-2 bg-accent px-4 py-2 text-sm font-semibold text-on-accent" role="status">
		<span class="flex-1">Versi baru tersedia.</span>
		{#if tertahan}
			<span>Sinkronkan dulu sebelum memperbarui.</span>
		{:else}
			<button type="button" class="min-h-12 rounded-xl bg-surface px-3 text-fg" onclick={() => siap?.postMessage('pasang-versi-baru')}>Muat ulang</button>
		{/if}
	</div>
{/if}
