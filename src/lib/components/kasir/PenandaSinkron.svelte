<script lang="ts">
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { href } from '#lib/nav.ts';
	import { sinkron } from '#lib/offline/sinkron.svelte.ts';
</script>

<div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm" role="status" aria-live="polite">
	<span class="font-semibold {sinkron.online ? 'text-ok' : 'text-danger'}">{sinkron.online ? '● Online' : '● Offline'}</span>
	{#if sinkron.menunggu}<span>{sinkron.menunggu} belum terkirim</span>{/if}
	{#if sinkron.ditolak}<a href={href('/kasir/perlu-perhatian')} class="font-semibold text-danger underline">Perlu perhatian ({sinkron.ditolak})</a>{/if}
	{#if sinkron.terakhir}<span class="text-muted">Sinkron {formatWaktuWib(sinkron.terakhir).slice(-8, -3)}</span>{/if}
	<button type="button" class="ml-auto min-h-12 rounded-xl bg-surface px-3 font-semibold" disabled={sinkron.sedang} onclick={() => sinkron.jalankan()}>
		{sinkron.sedang ? 'Mengirim…' : 'Sinkron sekarang'}
	</button>
</div>
