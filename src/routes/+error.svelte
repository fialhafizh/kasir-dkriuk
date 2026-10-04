<script lang="ts">
	import { page } from '$app/state';
	import Logo from '#lib/components/brand/Logo.svelte';
	import { href } from '#lib/nav.ts';
</script>

<svelte:head><title>Halaman tidak ditemukan · Kasir D'Kriuk</title></svelte:head>

<main class="grid min-h-dvh place-items-center bg-bg px-4">
	<div class="grid max-w-sm justify-items-center gap-4 text-center">
		<Logo size="lg" />
		<h1 class="font-display text-3xl text-brand">
			{page.status === 404 ? 'Halaman tidak ditemukan' : 'Terjadi kesalahan'}
		</h1>
		<p class="text-muted">
			{page.status === 404 ? 'Alamat yang dibuka tidak ada di aplikasi ini.' : 'Coba muat ulang halaman. Jika masih terjadi, hubungi admin.'}
		</p>
		<a
			href={href('/')}
			class="inline-flex min-h-12 items-center rounded-xl bg-brand px-5 font-semibold text-on-brand hover:bg-brand-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
		>
			Kembali ke beranda
		</a>
	</div>
</main>
