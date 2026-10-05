<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { routePath } from '#lib/auth/guard.ts';
	import KasirNav from '#lib/components/kasir/KasirNav.svelte';
	import PilihOutlet from '#lib/components/kasir/PilihOutlet.svelte';
	import AppShell from '#lib/components/layout/AppShell.svelte';
	import { onMount } from 'svelte';
	import PenandaSinkron from '#lib/components/kasir/PenandaSinkron.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { bacaPerangkat, simpanKode } from '#lib/offline/perangkat.ts';
	import { sinkron } from '#lib/offline/sinkron.svelte.ts';
	import { supabase } from '#lib/supabase/client.ts';

	let { children } = $props();

	const perangkat = typeof localStorage === 'undefined' ? null : bacaPerangkat(localStorage);
	onMount(() => {
		if (perangkat) sinkron.mulai(perangkat.id);
	});

	// Muat shift setiap kali outlet berganti, saat status online berubah, dan setelah antrean terkirim.
	$effect(() => {
		void auth.offline;
		void sinkron.terakhir;
		if (pos.outlet) void pos.muatShift();
	});

	// Daftarkan perangkat (saat online) supaya punya kode untuk nomor struk sementara.
	$effect(() => {
		const o = pos.outlet;
		if (!o || auth.offline || !perangkat) return;
		void supabase.rpc('daftar_perangkat', { p_id: perangkat.id, p_outlet: o.id }).then(({ data }) => {
			if (typeof data === 'number') simpanKode(localStorage, data);
		});
	});
</script>

<AppShell title="Kasir">
	{#snippet nav()}<KasirNav aktif={routePath(page.url)} />{/snippet}
	{#if auth.offline}
		<div class="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-4 py-2" role="status">
			<p class="min-w-0 flex-1 text-sm font-semibold text-warn">
				Internet terputus. Jualan tetap jalan; data terkirim otomatis saat internet kembali.
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
		<PenandaSinkron />
		{@render children()}
	{/if}
</AppShell>
