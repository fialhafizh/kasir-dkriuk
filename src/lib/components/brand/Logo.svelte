<script lang="ts">
	import logoIcon from '#lib/assets/brand/logo-icon.jpg';
	import logoWordmark from '#lib/assets/brand/logo-wordmark.jpg';

	let {
		size = 'md',
		wordmark = false,
		alt
	}: { size?: 'sm' | 'md' | 'lg'; wordmark?: boolean; alt?: string } = $props();
	const px = { sm: 36, md: 56, lg: 96 } as const;
</script>

{#if wordmark}
	<img src={logoWordmark} alt={alt ?? "D'Kriuk Fried Chicken"} width={px[size] * 2} height={px[size] * 2} class="rounded-2xl" />
{:else}
	<img src={logoIcon} alt={alt ?? "Logo D'Kriuk"} width={px[size]} height={px[size]} class="rounded-full" />
{/if}
