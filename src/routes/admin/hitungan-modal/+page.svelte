<script lang="ts">
	import { onMount } from 'svelte';
	import { ATURAN_AWAL, hitungModalOutlet, type AturanModal, type DataModal } from '#lib/analisis/hitungan-modal.ts';
	import Petunjuk from '#lib/components/bantuan/Petunjuk.svelte';
	import TombolEkspor from '#lib/components/ekspor/TombolEkspor.svelte';
	import AturanHitungan from '#lib/components/hitungan/AturanHitungan.svelte';
	import RincianOutlet from '#lib/components/hitungan/RincianOutlet.svelte';
	import {
		muatBahan,
		muatHargaBeli,
		muatHargaJual,
		muatIsiSatuanBeli,
		muatMenu,
		muatOutlets,
		muatResep,
		muatSatuanBeli,
		muatSatuanOutlet
	} from '#lib/master/api.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import { href } from '#lib/nav.ts';
	import type { Outlet } from '#lib/types/db.ts';

	const KUNCI = 'hitungan-modal:aturan';
	let outlets = $state<Outlet[]>([]);
	let data = $state<DataModal | null>(null);
	let galat = $state('');
	let outletId = $state<string | null>(null);
	let aturan = $state<AturanModal>(bacaAturan());

	function bacaAturan(): AturanModal {
		try {
			const t = localStorage.getItem(KUNCI);
			if (t) return { ...ATURAN_AWAL, ...(JSON.parse(t) as Partial<AturanModal>) };
		} catch {
			// penyimpanan perangkat tidak tersedia: pakai aturan awal
		}
		return { ...ATURAN_AWAL, pelengkap: [...ATURAN_AWAL.pelengkap] };
	}
	$effect(() => {
		const t = JSON.stringify(aturan);
		try {
			localStorage.setItem(KUNCI, t);
		} catch {
			// abaikan
		}
	});

	async function muat() {
		galat = '';
		try {
			const [o, bahan, satuan, isi, pemakai, hargaBeli, menu, resep, hargaJual] = await Promise.all([
				muatOutlets(),
				muatBahan(),
				muatSatuanBeli(),
				muatIsiSatuanBeli(),
				muatSatuanOutlet(),
				muatHargaBeli(),
				muatMenu(),
				muatResep(),
				muatHargaJual()
			]);
			outlets = o.filter((x) => x.aktif);
			data = { bahan, satuan, isi, pemakai, hargaBeli, menu, resep, hargaJual };
			outletId ??= outlets[0]?.id ?? null;
		} catch (e) {
			galat = (e as Error).message;
		}
	}
	onMount(muat);

	const hasil = $derived(data ? outlets.map((o) => ({ o, h: hitungModalOutlet(data!, o.id, aturan) })) : []);
	const dipilih = $derived(hasil.find((x) => x.o.id === outletId) ?? null);
	const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${formatAngka(Math.abs(n))}`;
</script>

<svelte:head><title>Hitungan Modal · Admin D'Kriuk</title></svelte:head>

<a href={href('/admin/analisis')} class="text-sm text-muted underline">← Analisis</a>
<div class="mt-1 flex items-center gap-2"><h1 class="font-display text-3xl">Hitungan modal per potong</h1><Petunjuk topik="hitungan-modal" peran="admin" /></div>
<p class="mt-1 max-w-prose text-sm text-muted">
	Modal tiap potong ayam = bagian ayam dari pack + pelengkap + tepung campuran + minyak. Semua harga diambil dari
	<a class="underline" href={href('/admin/harga-beli')}>Harga Beli</a>, isi pack dari <a class="underline" href={href('/admin/bahan')}>Bahan</a>, dan harga jual
	dari <a class="underline" href={href('/admin/menu')}>Menu</a>; ubah di sana, halaman ini ikut berubah. Gas, sarung tangan, gaji, dan sewa belum termasuk.
</p>
{#if galat}<p class="mt-2 text-danger" role="alert">{galat}</p>{/if}

<div class="mt-3"><AturanHitungan bind:aturan bahan={data?.bahan ?? []} /></div>

{#if !data}
	{#if !galat}<p class="mt-4 text-muted" role="status">Memuat…</p>{/if}
{:else}
	<h2 class="mt-5 font-display text-2xl">Perbandingan outlet</h2>
	<div class="mt-2 overflow-x-auto">
		<table class="w-full min-w-[36rem] text-sm">
			<thead class="text-left text-xs text-muted">
				<tr><th class="py-1 pr-2">Outlet</th><th class="py-1 pr-2">Pack</th><th class="py-1 pr-2 text-right">Modal/pack</th><th class="py-1 pr-2 text-right">Jual/pack</th><th class="py-1 pr-2 text-right">Untung/pack</th><th class="py-1 text-right">%</th></tr>
			</thead>
			<tbody>
				{#each hasil as { o, h } (o.id)}
					{#each h.pack as p (p.nama)}
						<tr class="border-t border-line">
							<td class="py-1.5 pr-2">{o.merek} {o.nama}</td><td class="py-1.5 pr-2">{p.nama}</td>
							<td class="tabular py-1.5 pr-2 text-right">{rp(p.modalPack)}</td><td class="tabular py-1.5 pr-2 text-right">{rp(p.jualPack)}</td>
							<td class="tabular py-1.5 pr-2 text-right font-bold {p.untungPack < 0 ? 'text-danger' : ''}">{rp(p.untungPack)}</td>
							<td class="tabular py-1.5 text-right">{p.persenPack.toLocaleString('id-ID')}%</td>
						</tr>
					{/each}
				{/each}
			</tbody>
		</table>
	</div>

	<div class="mt-3">
		<TombolEkspor
			judul="Hitungan modal per potong"
			cetak
			lembar={() => [{
				nama: 'Modal per potong',
				kolom: ['Outlet', 'Pack', 'Potongan', 'Isi', 'Ayam', 'Pelengkap', 'Tepung', 'Minyak', 'Modal', 'Harga jual', 'Untung', 'Untung %'],
				baris: hasil.flatMap(({ o, h }) => h.pack.flatMap((p) => p.potong.map((x) => [o.nama, p.nama, x.nama, x.jumlah, x.ayam, x.pelengkap, x.tepung, x.minyak, x.modal, x.jual, x.untung, x.persen])))
			}]}
		/>
	</div>

	<div class="mt-5 flex flex-wrap gap-1" role="group" aria-label="Pilih outlet">
		{#each outlets as o (o.id)}
			<button type="button" aria-pressed={outletId === o.id} class="min-h-11 rounded-xl px-3 text-sm font-semibold {outletId === o.id ? 'bg-brand text-on-brand' : 'bg-surface-2'}" onclick={() => (outletId = o.id)}>{o.nama}</button>
		{/each}
	</div>
	{#if dipilih}
		<div class="mt-3"><RincianOutlet judul={dipilih.o.nama} h={dipilih.h} {aturan} /></div>
	{/if}
{/if}
