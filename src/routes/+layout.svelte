<script lang="ts">
	import '../app.css';
	import '@fontsource/lilita-one';
	import '@fontsource-variable/plus-jakarta-sans';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { cekAkses, routePath } from '#lib/auth/guard.ts';
	import { auth } from '#lib/auth/session.svelte.ts';
	import SplashScreen from '#lib/components/layout/SplashScreen.svelte';
	import { href } from '#lib/nav.ts';
	import { theme } from '#lib/theme/theme.svelte.ts';

	let { children } = $props();

	onMount(() => {
		theme.init();
		auth.start();
	});

	const keputusan = $derived(auth.status === 'loading' ? null : cekAkses(routePath(page.url), auth.profile));

	$effect(() => {
		if (keputusan && !keputusan.ok) goto(href(keputusan.redirect), { replaceState: true });
	});
</script>

{#if keputusan?.ok}
	{@render children()}
{:else}
	<SplashScreen />
{/if}
