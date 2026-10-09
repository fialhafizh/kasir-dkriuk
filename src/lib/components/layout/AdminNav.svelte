<script lang="ts">
	import { href } from '#lib/nav.ts';

	let { aktif }: { aktif: string } = $props();

	const ITEM = [
		{ path: '/admin', label: 'Beranda' },
		{ path: '/admin/dasbor', label: 'Dasbor' },
		{ path: '/admin/kas', label: 'Kas' },
		{ path: '/admin/setoran', label: 'Setoran' },
		{ path: '/admin/pengeluaran', label: 'Pengeluaran' },
		{ path: '/admin/penjualan', label: 'Penjualan' },
		{ path: '/admin/ojol', label: 'Ojol' },
		{ path: '/admin/laba-rugi', label: 'Laba-rugi' },
		{ path: '/admin/analisis', label: 'Analisis' },
		{ path: '/admin/gaji', label: 'Gaji' },
		{ path: '/admin/biaya-tetap', label: 'Biaya tetap' },
		{ path: '/admin/belanja', label: 'Belanja' },
		{ path: '/admin/stok', label: 'Stok' },
		{ path: '/admin/bahan', label: 'Bahan' },
		{ path: '/admin/menu', label: 'Menu' },
		{ path: '/admin/harga-beli', label: 'Harga Beli' },
		{ path: '/admin/akun', label: 'Akun' },
		{ path: '/admin/perangkat', label: 'Perangkat' },
		{ path: '/admin/telegram', label: 'Telegram' },
		{ path: '/admin/bantuan', label: 'Bantuan' }
	] as const;

	const sedang = (p: string) => (p === '/admin' ? aktif === '/admin' : aktif === p || aktif.startsWith(`${p}/`));
</script>

<nav
	aria-label="Menu admin"
	class="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:sticky lg:top-20 lg:w-52 lg:shrink-0 lg:self-start lg:border-0 lg:bg-transparent lg:pt-6 lg:pb-0"
>
	<ul class="flex overflow-x-auto lg:flex-col lg:gap-1">
		{#each ITEM as i (i.path)}
			<li class="flex-1 lg:flex-none">
				<a
					href={href(i.path)}
					aria-current={sedang(i.path) ? 'page' : undefined}
					class="flex min-h-14 items-center justify-center border-t-3 border-transparent px-2 text-center text-xs font-semibold whitespace-nowrap text-muted hover:text-fg focus-visible:outline-3 focus-visible:outline-focus aria-[current=page]:border-brand aria-[current=page]:font-extrabold aria-[current=page]:text-brand lg:border-t-0 lg:min-h-12 lg:justify-start lg:rounded-xl lg:text-sm lg:aria-[current=page]:bg-surface-2"
				>
					{i.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
