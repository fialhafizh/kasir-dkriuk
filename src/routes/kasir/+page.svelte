<script lang="ts">
	import { auth } from '#lib/auth/session.svelte.ts';
	import AppShell from '#lib/components/layout/AppShell.svelte';
</script>

<svelte:head><title>Kasir · Kasir D'Kriuk</title></svelte:head>

<AppShell title="Kasir">
	{#if auth.outlet}
		<h1 class="font-display text-3xl">{auth.outlet.merek} {auth.outlet.nama}</h1>
		<p class="mt-1 text-muted">Layar jualan dibangun di Tahap 2.</p>
	{:else}
		<h1 class="font-display text-3xl">Pilih outlet</h1>
		<p class="mt-1 text-muted">Admin akan bisa memilih outlet untuk berjualan di Tahap 2.</p>
	{/if}
</AppShell>
