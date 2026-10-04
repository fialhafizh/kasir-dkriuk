<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'ghost';
	let {
		type = 'button',
		variant = 'primary',
		loading = false,
		disabled,
		class: cls = '',
		children,
		...rest
	}: HTMLButtonAttributes & { variant?: Variant; loading?: boolean } = $props();

	const styles: Record<Variant, string> = {
		primary: 'bg-brand text-on-brand hover:bg-brand-ink',
		secondary: 'bg-surface-2 text-fg hover:bg-line',
		ghost: 'bg-transparent text-fg hover:bg-surface-2'
	};
</script>

<button
	{...rest}
	{type}
	disabled={disabled || loading}
	aria-busy={loading || undefined}
	class="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 {styles[variant]} {cls}"
>
	{#if loading}
		<span class="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true"></span>
	{/if}
	{@render children?.()}
</button>
