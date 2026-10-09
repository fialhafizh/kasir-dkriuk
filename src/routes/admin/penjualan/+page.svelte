<script lang="ts">
	import TombolEkspor from '#lib/components/ekspor/TombolEkspor.svelte';
	import { onMount } from 'svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { muatPenjualanTanggal, type PenjualanAdmin } from '#lib/kas/admin.ts';
	import { voidPenjualan } from '#lib/kasir/api.ts';
	import { labelMetode } from '#lib/kasir/bayar.ts';
	import { formatWaktuWib, tanggalWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	const hariIni = tanggalWib(new Date());
	let outlets = $state<Outlet[]>([]);
	let outletId = $state('');
	let tanggal = $state(hariIni);
	let cari = $state('');
	let daftar = $state<PenjualanAdmin[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		status = 'memuat';
		try {
			if (!outlets.length) outlets = await muatOutlets();
			outletId ||= outlets[0]?.id ?? '';
			daftar = outletId ? await muatPenjualanTanggal(outletId, tanggal) : [];
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const tampil = $derived.by(() => {
		const t = cari.trim().toUpperCase();
		return t ? daftar.filter((p) => [p.nomor, p.nomor_sementara, p.kode_struk].some((x) => !!x && x.toUpperCase().includes(t))) : daftar;
	});
	const total = $derived(daftar.filter((p) => !p.void_at).reduce((a, p) => a + p.total, 0));

	async function batal(p: PenjualanAdmin) {
		pesanBaris[p.id] = '';
		try {
			await voidPenjualan(p.id, alasan[p.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[p.id] = (e as Error).message;
		}
	}
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<svelte:head><title>Penjualan · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Penjualan</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Riwayat penjualan per outlet & tanggal. Membatalkan transaksi dari toko yang sudah ditutup dianggap koreksi catatan (mis. transaksi
	dobel): selisih laci shift itu ikut terkoreksi, uang laci sekarang tidak berubah. Stok tetap dikembalikan.
</p>

<form class="mt-4 flex flex-wrap items-end gap-3" onsubmit={(e) => (e.preventDefault(), void muat())}>
	<div class="grid gap-1.5">
		<label for="outlet" class="text-sm font-semibold">Outlet</label>
		<select id="outlet" bind:value={outletId} class={kotak}>{#each outlets as o (o.id)}<option value={o.id}>{o.nama}</option>{/each}</select>
	</div>
	<div class="grid gap-1.5"><label for="tgl" class="text-sm font-semibold">Tanggal</label><input id="tgl" type="date" bind:value={tanggal} max={hariIni} class={kotak} /></div>
	<button type="submit" class="min-h-12 rounded-xl bg-brand px-4 font-semibold text-on-brand">Tampilkan</button>
	<div class="grid min-w-0 flex-1 gap-1.5">
		<label for="cari" class="text-sm font-semibold">Cari nomor / kode struk</label>
		<input id="cari" bind:value={cari} autocomplete="off" placeholder="mis. K7Q2MX" class={kotak} />
	</div>
</form>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	<p class="mt-3 font-semibold">{daftar.filter((p) => !p.void_at).length} transaksi · Rp{formatAngka(total)}</p>
	{#if tampil.length === 0}
		<p class="mt-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">Tidak ada transaksi.</p>
	{:else}
		{#if tampil.length}<div class="mb-2"><TombolEkspor judul="Penjualan" cetak lembar={() => [{
			nama: 'Penjualan',
			kolom: ['Nomor', 'Kode struk', 'Waktu', 'Cara bayar', 'Total', 'Item', 'Batal'],
			baris: tampil.map((x) => [x.nomor, x.kode_struk, formatWaktuWib(x.waktu), labelMetode(x.metode), Number(x.total), x.item.map((i) => `${i.qty}× ${i.nama}`).join(', '), x.void_alasan])
		}]} /></div>{/if}
		<ul class="mt-2 grid gap-2">
			{#each tampil as p (p.id)}
				<li class="rounded-2xl border border-line bg-surface p-3 {p.void_at ? 'opacity-70' : ''}">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<p class="font-semibold">{p.nomor} <span class="text-sm font-normal text-muted">{formatWaktuWib(p.waktu)}</span></p>
						<p class="tabular font-bold {p.void_at ? 'line-through' : ''}">Rp{formatAngka(p.total)} · {labelMetode(p.metode)}</p>
					</div>
					<p class="text-sm text-muted">{p.item.map((i) => `${i.qty}× ${i.nama}`).join(', ')}</p>
					<p class="text-xs text-muted">
						{#if p.kode_struk}Kode struk {p.kode_struk}{/if}{#if p.nomor_sementara} · No. sementara {p.nomor_sementara}{/if}
					</p>
					{#if p.void_at}
						<p class="mt-1 text-sm font-semibold text-danger">Dibatalkan{p.void_koreksi ? ' (koreksi)' : ''}: {p.void_alasan}</p>
					{:else}
						<div class="mt-2 flex flex-wrap items-center gap-2">
							<label class="sr-only" for="alasan-{p.id}">Alasan batal</label>
							<input id="alasan-{p.id}" bind:value={alasan[p.id]} maxlength="200" placeholder="Alasan batal" class="min-w-0 flex-1 {kotak}" />
							<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(p)} />
						</div>
					{/if}
					{#if pesanBaris[p.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[p.id]}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/if}
