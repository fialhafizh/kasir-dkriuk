<script lang="ts">
	// Pindah antara Rencana belanja (saran) dan Belanja riil (yang benar-benar dibeli).
	import { href } from '#lib/nav.ts';

	let { aktif }: { aktif: 'rencana' | 'riil' } = $props();
	const ITEM = [
		{ id: 'rencana', label: 'Rencana belanja', path: '/admin/belanja' },
		{ id: 'riil', label: 'Belanja riil', path: '/admin/belanja/riil' }
	] as const;
</script>

<nav class="tanpa-cetak mb-3 flex flex-wrap gap-1" aria-label="Jenis belanja">
	{#each ITEM as i (i.id)}
		<a
			href={href(i.path)}
			aria-current={aktif === i.id ? 'page' : undefined}
			class="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold {aktif === i.id ? 'bg-brand text-on-brand' : 'bg-surface-2'}">{i.label}</a
		>
	{/each}
</nav>
