<script lang="ts">
	import { onMount } from 'svelte';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatOpname, muatTransfer } from '#lib/stok/api-lanjut.ts';
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
			const [outlets, data, stok, awal, opname, transfer] = await Promise.all([
				muatOutlets(),
				muatDataStok(),
				muatStok(),
				muatStokAwal(),
				muatOpname(),
				muatTransfer()
			]);
			baris = outlets
				.filter((o) => o.aktif)
				.map((o) => {
					const sah = awal.some((a) => a.outlet_id === o.id && a.status === 'disetujui');
					const menunggu = awal.some((a) => a.outlet_id === o.id && a.status === 'diajukan');
					if (!sah) return { id: o.id, nama: o.nama, teks: menunggu ? 'Stok awal menunggu persetujuan' : 'Belum ada stok awal', bahaya: menunggu };
					const r = hitungRingkasan(susunStok(data.bahan, data.satuan, data.isi, petaStok(stok, o.id)));
					const tambahan = [
						opname.some((x) => x.outlet_id === o.id && x.status === 'diajukan') ? 'opname menunggu persetujuan' : '',
						transfer.some((x) => x.ke_outlet_id === o.id && x.status === 'dikirim') ? 'kiriman belum diterima' : ''
					].filter(Boolean);
					const teks = [r.minus + r.menipis === 0 ? 'Semua aman' : `${r.menipis} menipis, ${r.minus} minus`, ...tambahan].join(' · ');
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
