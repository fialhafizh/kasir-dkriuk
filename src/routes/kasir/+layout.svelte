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
		<div class="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-4 py-2" role="status">
			<p class="min-w-0 flex-1 text-sm font-semibold text-warn">
				Internet terputus. Data terakhir dipakai; penjualan butuh koneksi sampai Tahap 4 (mode offline) selesai.
			</p>
			<button type="button" class="min-h-12 rounded-xl bg-surface px-4 text-sm font-semibold" onclick={() => auth.cobaLagi()}
				>Coba sambung lagi</button
			>
		</div>
	{/if}
	{#if auth.profile?.role === 'admin'}<div class="mb-4"><PilihOutlet /></div>{/if}
	{#if !pos.outlet}
		<p class="text-muted">
			{auth.profile?.role === 'admin' ? 'Pilih outlet untuk mulai.' : 'Akun ini belum terhubung ke outlet. Hubungi admin.'}
		</p>
	{:else}
		{@render children()}
	{/if}
</AppShell>
