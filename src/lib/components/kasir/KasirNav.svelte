<script lang="ts">
	import { href } from '#lib/nav.ts';

	let { aktif }: { aktif: string } = $props();
	const ITEM = [
		{ path: '/kasir', label: 'Jualan' },
		{ path: '/kasir/riwayat', label: 'Riwayat' },
		{ path: '/kasir/stok', label: 'Stok' },
		{ path: '/kasir/kas', label: 'Kas' },
		{ path: '/kasir/tutup', label: 'Tutup toko' },
		{ path: '/kasir/bantuan', label: 'Bantuan' }
	] as const;

	const sedang = (p: string) => (p === '/kasir' ? aktif === '/kasir' : aktif === p || aktif.startsWith(`${p}/`));
</script>

<nav
	aria-label="Menu kasir"
	class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:sticky lg:top-20 lg:w-44 lg:shrink-0 lg:self-start lg:border-0 lg:bg-transparent lg:pt-6 lg:pb-0"
>
	<ul class="flex lg:flex-col lg:gap-1">
		{#each ITEM as i (i.path)}
			<li class="flex-1 lg:flex-none">
				<a
					href={href(i.path)}
					aria-current={sedang(i.path) ? 'page' : undefined}
					class="flex min-h-14 items-center justify-center border-t-3 border-transparent px-1 text-xs font-semibold sm:px-2 sm:text-sm text-muted hover:text-fg focus-visible:outline-3 focus-visible:outline-focus aria-[current=page]:border-brand aria-[current=page]:font-extrabold aria-[current=page]:text-brand lg:min-h-12 lg:justify-start lg:rounded-xl lg:border-t-0 lg:px-3 lg:aria-[current=page]:bg-surface-2"
				>
					{i.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
