<script lang="ts">
	import { themeLabel } from '#lib/theme/theme.ts';
	import { theme } from '#lib/theme/theme.svelte.ts';
</script>

<button
	type="button"
	onclick={() => theme.cycle()}
	class="inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-fg hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus"
	aria-label="Ganti tema, sekarang {themeLabel(theme.pref)}"
>
	<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
		{#if theme.pref === 'dark'}
			<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
		{:else if theme.pref === 'light'}
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
		{:else}
			<rect x="3" y="4" width="18" height="12" rx="2" />
			<path d="M8 20h8M12 16v4" />
		{/if}
	</svg>
	<span class="hidden sm:inline">{themeLabel(theme.pref)}</span>
</button>
