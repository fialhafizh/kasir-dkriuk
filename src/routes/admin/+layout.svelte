<script lang="ts">
	import { page } from '$app/state';
	import { routePath } from '#lib/auth/guard.ts';
	import AdminNav from '#lib/components/layout/AdminNav.svelte';
	import AppShell from '#lib/components/layout/AppShell.svelte';

	let { children } = $props();
</script>

<AppShell title="Admin">
	{#snippet nav()}<AdminNav aktif={routePath(page.url)} />{/snippet}
	{@render children()}
</AppShell>
