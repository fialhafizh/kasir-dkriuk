<script lang="ts">
	import type { Snippet } from 'svelte';
	import { auth } from '#lib/auth/session.svelte.ts';
	import Logo from '#lib/components/brand/Logo.svelte';
	import ThemeToggle from '#lib/components/theme/ThemeToggle.svelte';

	let { title, nav, children }: { title: string; nav?: Snippet; children: Snippet } = $props();

	const lingkup = $derived(
		auth.profile?.role === 'admin' ? 'Admin · Semua outlet' : auth.outlet ? `${auth.outlet.merek} ${auth.outlet.nama}` : ''
	);
</script>

<div class="min-h-dvh bg-bg">
	<header
		class="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur"
	>
		<div class="flex min-h-16 min-w-0 flex-1 items-center gap-3">
			<Logo size="sm" alt="" />
			<div class="min-w-0">
				<p class="font-display text-xl leading-none text-brand">{title}</p>
				<p class="truncate text-xs font-semibold text-muted">{lingkup}</p>
			</div>
		</div>
		<ThemeToggle />
		<button
			type="button"
			onclick={() => auth.signOut()}
			class="min-h-12 rounded-xl px-3 text-sm font-semibold text-fg hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus"
		>
			Keluar
		</button>
	</header>
	<div class="mx-auto flex w-full max-w-7xl lg:gap-6 lg:px-4">
		{#if nav}{@render nav()}{/if}
		<main class="min-w-0 flex-1 px-4 py-6 lg:px-0 {nav ? 'pb-28 lg:pb-6' : ''}">
			{@render children()}
		</main>
	</div>
</div>
