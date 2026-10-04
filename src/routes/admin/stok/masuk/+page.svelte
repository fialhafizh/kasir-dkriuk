<script lang="ts">
	import { onMount } from 'svelte';
	import FormBarangMasuk from '#lib/components/stok/FormBarangMasuk.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatHargaBeli, muatOutlets, muatSatuanBeli } from '#lib/master/api.ts';
	import { formatAngka, formatQty } from '#lib/master/rupiah.ts';
	import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
	import { href } from '#lib/nav.ts';
	import { batalBarangMasuk, catatBarangMasuk, muatBarangMasuk } from '#lib/stok/api.ts';
	import type { BarangMasuk, KirimBarangMasuk } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let satuan = $state<SatuanBeli[]>([]);
	let hargaBeli = $state<HargaBeli[]>([]);
	let outletId = $state<string | null>(null);
	let daftar = $state<BarangMasuk[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});
	// Galat memuat daftar ditampilkan di dekat daftar: daftar kosong karena galat ≠ belum ada barang masuk.
	let pesanDaftar = $state('');

	const outlet = $derived(outlets.find((o) => o.id === outletId) ?? null);

	async function muatSemua() {
		status = 'memuat';
		try {
			[outlets, satuan, hargaBeli] = await Promise.all([muatOutlets(), muatSatuanBeli(), muatHargaBeli()]);
			outletId ??= outlets.find((o) => o.aktif)?.id ?? null;
			await muatDaftar();
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	async function muatDaftar() {
		const id = outletId;
		if (!id) return;
		pesanDaftar = '';
		try {
			const d = await muatBarangMasuk(id);
			if (id === outletId) daftar = d;
		} catch (e) {
			if (id === outletId) pesanDaftar = `Daftar tidak bisa dimuat: ${(e as Error).message}`;
		}
	}
	onMount(muatSemua);

	function gantiOutlet(id: string) {
		outletId = id;
		daftar = [];
		void muatDaftar();
	}

	async function simpan(p: KirimBarangMasuk) {
		await catatBarangMasuk(p);
		await muatDaftar();
	}

	async function batal(b: BarangMasuk) {
		pesanBaris[b.id] = '';
		try {
			await batalBarangMasuk(b.id, alasan[b.id] ?? '');
			await muatDaftar();
		} catch (e) {
			pesanBaris[b.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Barang Masuk · Admin · Kasir D'Kriuk</title></svelte:head>

<a href={href('/admin/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-3xl">Barang masuk</h1>
<p class="mt-1 max-w-prose text-muted">Isi pack dipecah otomatis ke bahan. Nilainya tersimpan sebagai pengeluaran outlet (laporan di Tahap 5).</p>

<div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Pilih outlet">
	{#each outlets.filter((o) => o.aktif) as o (o.id)}
		<button
			type="button"
			aria-pressed={outletId === o.id}
			onclick={() => gantiOutlet(o.id)}
			class="min-h-12 rounded-xl border-2 border-line px-4 font-semibold aria-pressed:border-brand aria-pressed:text-brand">{o.nama}</button
		>
	{/each}
</div>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muatSemua}>Coba lagi</button>
{:else if outlet}
	<div class="mt-4 grid gap-6 lg:grid-cols-2">
		{#key outlet.id}<FormBarangMasuk {outlet} {satuan} {hargaBeli} onsimpan={simpan} />{/key}
		<section aria-label="Barang masuk terakhir">
			<h2 class="font-display text-xl">Terakhir di {outlet.nama}</h2>
			{#if pesanDaftar}
				<p class="mt-2 text-sm text-danger" role="alert">{pesanDaftar}</p>
				<button type="button" class="mt-2 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muatDaftar}>Coba lagi</button>
			{:else if daftar.length === 0}
				<p class="mt-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada barang masuk.</p>
			{:else}
				<ul class="mt-2 grid gap-2">
					{#each daftar as b (b.id)}
						<li class="rounded-2xl border border-line bg-surface p-3 {b.batal_at ? 'opacity-60' : ''}">
							<div class="flex flex-wrap items-baseline justify-between gap-2">
								<span class="text-sm text-muted">{formatWaktuWib(b.waktu)}</span>
								<span class="tabular font-bold">Rp{formatAngka(b.total)}</span>
							</div>
							<ul class="mt-1 text-sm">
								{#each b.item as i (i.satuan_beli_id)}<li>{formatQty(i.qty)} × {i.nama} @ Rp{formatAngka(i.harga)}</li>{/each}
							</ul>
							{#if b.catatan}<p class="mt-1 text-sm text-muted">{b.catatan}</p>{/if}
							{#if b.batal_at}
								<p class="mt-1 text-sm font-semibold text-danger">Dibatalkan: {b.batal_alasan}</p>
							{:else}
								<div class="mt-2 flex flex-wrap items-center gap-2">
									<label class="sr-only" for="alasan-{b.id}">Alasan pembatalan</label>
									<input
										id="alasan-{b.id}"
										bind:value={alasan[b.id]}
										maxlength="200"
										placeholder="Alasan batal, mis. salah input"
										class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3"
									/>
									<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(b)} />
								</div>
								{#if pesanBaris[b.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[b.id]}</p>{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
{/if}
