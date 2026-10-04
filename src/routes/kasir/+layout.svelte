<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { routePath } from '#lib/auth/guard.ts';
	import KasirNav from '#lib/components/kasir/KasirNav.svelte';
	import PilihOutlet from '#lib/components/kasir/PilihOutlet.svelte';
	import AppShell from '#lib/components/layout/AppShell.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';

	let { children } = $props();

	// Muat shift setiap kali outlet berganti, dan lagi saat internet kembali.
	$effect(() => {
		if (pos.outlet && !auth.offline) void pos.muatShift();
	});
</script>

<AppShell title="Kasir">
	{#snippet nav()}<KasirNav aktif={routePath(page.url)} />{/snippet}
	{#if auth.offline}
		<p class="mb-4 rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold text-warn" role="status">
			Internet terputus. Data terakhir dipakai; penjualan butuh koneksi sampai Tahap 4 (mode offline) selesai.
		</p>
	{/if}
	{#if auth.profile?.role === 'admin'}<div class="mb-4"><PilihOutlet /></div>{/if}
	{#if !pos.outlet}
		<p class="text-muted">Pilih outlet untuk mulai.</p>
	{:else}
		{@render children()}
	{/if}
</AppShell>
