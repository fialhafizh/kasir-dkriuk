<script lang="ts">
	import { onMount } from 'svelte';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatDataStok, muatStok, muatStokAwal, petaStok } from '#lib/stok/api.ts';
	import { hitungRingkasan, susunStok } from '#lib/stok/tampil.ts';

	interface Baris {
		id: string;
		nama: string;
		teks: string;
		bahaya: boolean;
	}
	let baris = $state<Baris[]>([]);
	let gagal = $state('');

	onMount(async () => {
		try {
			const [outlets, data, stok, awal] = await Promise.all([muatOutlets(), muatDataStok(), muatStok(), muatStokAwal()]);
			baris = outlets
				.filter((o) => o.aktif)
				.map((o) => {
					const sah = awal.some((a) => a.outlet_id === o.id && a.status === 'disetujui');
					const menunggu = awal.some((a) => a.outlet_id === o.id && a.status === 'diajukan');
					if (!sah) return { id: o.id, nama: o.nama, teks: menunggu ? 'Stok awal menunggu persetujuan' : 'Belum ada stok awal', bahaya: menunggu };
					const r = hitungRingkasan(susunStok(data.bahan, data.satuan, data.isi, petaStok(stok, o.id)));
					const teks = r.minus + r.menipis === 0 ? 'Semua aman' : `${r.menipis} menipis, ${r.minus} minus`;
					return { id: o.id, nama: o.nama, teks, bahaya: r.minus > 0 };
				});
		} catch (e) {
			gagal = (e as Error).message;
		}
	});
</script>

<section class="mt-8">
	<h2 class="font-display text-2xl">Stok</h2>
	{#if gagal}<p class="mt-2 text-sm text-danger" role="alert">{gagal}</p>{/if}
	<ul class="mt-3 grid gap-3 sm:grid-cols-3">
		{#each baris as b (b.id)}
			<li>
				<a
					href={href('/admin/stok')}
					class="block rounded-2xl border bg-surface p-4 hover:border-brand focus-visible:outline-3 focus-visible:outline-focus {b.bahaya
						? 'border-danger'
						: 'border-line'}"
				>
					<p class="font-semibold">{b.nama}</p>
					<p class="text-sm {b.bahaya ? 'font-semibold text-danger' : 'text-muted'}">{b.teks}</p>
				</a>
			</li>
		{/each}
	</ul>
</section>
