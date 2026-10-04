<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { supabase } from '#lib/supabase/client.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let gagal = $state<string | null>(null);

	onMount(async () => {
		const { data, error } = await supabase.from('outlets').select('id, kode, nama, merek, alamat, telepon, aktif').order('kode');
		if (error) gagal = 'Daftar outlet tidak bisa dimuat. Periksa koneksi, lalu muat ulang.';
		else outlets = data ?? [];
	});

	const pintasan = [
		{ path: '/admin/menu', judul: 'Menu & Harga', isi: 'Harga jual per outlet dan resep pemotongan stok.' },
		{ path: '/admin/bahan', judul: 'Bahan', isi: 'Isi pack dan ambang stok menipis.' },
		{ path: '/admin/harga-beli', judul: 'Harga Beli', isi: 'Harga beli bahan per outlet.' },
		{ path: '/admin/akun', judul: 'Akun', isi: 'Tambah kasir, reset password, nonaktifkan akun.' }
	];
</script>

<svelte:head><title>Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Halo, {auth.profile?.nama_tampilan}</h1>
<p class="mt-1 text-muted">Dashboard lengkap dibangun di Tahap 7.</p>

<ul class="mt-6 grid gap-3 sm:grid-cols-2">
	{#each pintasan as p (p.path)}
		<li>
			<a
				href={href(p.path)}
				class="block rounded-2xl border border-line bg-surface p-5 hover:border-brand focus-visible:outline-3 focus-visible:outline-focus"
			>
				<p class="font-display text-xl text-brand">{p.judul}</p>
				<p class="mt-1 text-sm text-muted">{p.isi}</p>
			</a>
		</li>
	{/each}
</ul>

{#if gagal}<p class="mt-6 text-danger" role="alert">{gagal}</p>{/if}

<h2 class="mt-8 font-display text-2xl">Outlet</h2>
<ul class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
	{#each outlets as o (o.id)}
		<li class="rounded-2xl border border-line bg-surface p-5">
			<span class="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">{o.kode}</span>
			<p class="mt-3 font-display text-xl">{o.merek} {o.nama}</p>
			<p class="mt-1 text-sm text-muted">{o.alamat}</p>
		</li>
	{/each}
</ul>
