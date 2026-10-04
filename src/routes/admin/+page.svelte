<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth/session.svelte.ts';
	import AppShell from '#lib/components/layout/AppShell.svelte';
	import { supabase } from '#lib/supabase/client.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let gagal = $state<string | null>(null);

	onMount(async () => {
		const { data, error } = await supabase
			.from('outlets')
			.select('id, kode, nama, merek, alamat, telepon, aktif')
			.order('kode');
		if (error) gagal = 'Daftar outlet tidak bisa dimuat. Periksa koneksi, lalu muat ulang.';
		else outlets = data ?? [];
	});
</script>

<svelte:head><title>Admin · Kasir D'Kriuk</title></svelte:head>

<AppShell title="Admin">
	<h1 class="font-display text-3xl">Halo, {auth.profile?.nama_tampilan}</h1>
	<p class="mt-1 text-muted">Dashboard lengkap dibangun di Tahap 7. Untuk sekarang, ini outlet yang terdaftar.</p>

	{#if gagal}
		<p class="mt-6 text-danger" role="alert">{gagal}</p>
	{/if}

	<ul class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each outlets as o (o.id)}
			<li class="rounded-2xl border border-line bg-surface p-5">
				<span class="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">{o.kode}</span>
				<p class="mt-3 font-display text-xl">{o.merek} {o.nama}</p>
				<p class="mt-1 text-sm text-muted">{o.alamat}</p>
			</li>
		{/each}
	</ul>
</AppShell>
