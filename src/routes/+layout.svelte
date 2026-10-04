<script lang="ts">
	import '../app.css';
	import '@fontsource/lilita-one';
	import '@fontsource-variable/plus-jakarta-sans';
	import { onMount } from 'svelte';
	import { theme } from '#lib/theme/theme.svelte.ts';

	let { children } = $props();
	onMount(() => theme.init());
</script>

{@render children()}
