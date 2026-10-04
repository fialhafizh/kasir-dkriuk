<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		id,
		label,
		value = $bindable(''),
		error = '',
		...rest
	}: Omit<HTMLInputAttributes, 'value'> & { id: string; label: string; value?: string; error?: string } = $props();
</script>

<div class="grid gap-1.5">
	<label for={id} class="text-sm font-semibold">{label}</label>
	<input
		{id}
		{...rest}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${id}-error` : undefined}
		class="min-h-12 rounded-xl border border-line bg-surface px-4 text-base text-fg placeholder:text-muted focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none"
	/>
	{#if error}
		<p id="{id}-error" class="text-sm text-danger">{error}</p>
	{/if}
</div>
