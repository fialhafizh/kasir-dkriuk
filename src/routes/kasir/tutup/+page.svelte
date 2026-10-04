<script lang="ts">
	import RingkasanShift from '#lib/components/kasir/RingkasanShift.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { ringkasanShift, tutupShift } from '#lib/kasir/api.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import type { Ringkasan } from '#lib/kasir/types.ts';
	import { href } from '#lib/nav.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';

	let r = $state<Ringkasan | null>(null);
	let hasil = $state<Ringkasan | null>(null);
	let teks = $state('');
	let catatan = $state('');
	let pesan = $state('');

	$effect(() => {
		const s = pos.shift;
		if (!s) return;
		ringkasanShift(s.id)
			.then((x) => (r = x))
			.catch((e) => (pesan = (e as Error).message));
	});

	const uang = $derived(parseRupiah(teks));
	const selisih = $derived(r && uang !== null ? uang - r.cash_seharusnya : null);

	async function tutup() {
		pesan = '';
		if (!pos.shift || uang === null) {
			pesan = 'Isi jumlah uang yang ada di laci, mis. 350.000.';
			return;
		}
		try {
			hasil = await tutupShift(pos.shift.id, uang, catatan);
			await pos.muatShift();
		} catch (e) {
			pesan = (e as Error).message;
			// Sudah ditutup di tablet lain: muat ulang supaya halaman tidak menunggu yang mustahil.
			if (/Shift belum dibuka|Shift sudah ditutup/.test(pesan)) void pos.muatShift();
		}
	}
</script>

<svelte:head><title>Tutup toko · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Tutup toko</h1>

{#if hasil}
	<p class="mt-2 font-semibold text-ok" role="status">
		Toko ditutup. Setorkan Rp{formatAngka(Math.max(0, (hasil.uang_fisik ?? 0) - hasil.modal))} ke owner dan sisakan modal
		Rp{formatAngka(hasil.modal)} di laci untuk besok.
	</p>
	<div class="mt-4 max-w-md"><RingkasanShift r={hasil} /></div>
	<a href={href('/kasir')} class="mt-4 inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Ke layar jualan</a>
{:else if pos.status === 'memuat' && !pos.shift}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if pos.status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pos.pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => pos.muatShift()}>Coba lagi</button>
{:else if !pos.shift}
	<p class="mt-2 text-muted">Tidak ada shift terbuka. Toko sudah ditutup.</p>
{:else if r}
	<div class="mt-4 grid max-w-md gap-4">
		<RingkasanShift {r} />
		<div class="grid gap-1.5">
			<label for="uang-laci" class="text-sm font-semibold">Uang cash yang ada di laci sekarang</label>
			<input
				id="uang-laci"
				bind:value={teks}
				inputmode="numeric"
				autocomplete="off"
				placeholder="0"
				class="tabular min-h-14 rounded-xl border border-line-strong bg-surface px-3 text-right text-2xl text-fg"
			/>
			{#if selisih !== null}
				<p class="text-sm font-semibold {selisih === 0 ? 'text-ok' : 'text-danger'}">
					{selisih === 0 ? 'Pas dengan catatan.' : `${selisih > 0 ? 'Lebih' : 'Kurang'} Rp${formatAngka(Math.abs(selisih))} dari catatan.`}
				</p>
			{/if}
		</div>
		<div class="grid gap-1.5">
			<label for="catatan-tutup" class="text-sm font-semibold">Catatan (opsional)</label>
			<input id="catatan-tutup" bind:value={catatan} maxlength="500" class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg" />
		</div>
		{#if pesan}<p class="text-sm text-danger" role="alert">{pesan}</p>{/if}
		{#if uang === null}
			<p class="text-sm text-muted">Isi jumlah uang di laci dulu untuk menutup toko.</p>
		{:else}
			<Konfirmasi label="Tutup toko" konfirmasiLabel="Ya, tutup toko" variant="primary" onkonfirmasi={tutup} />
		{/if}
	</div>
{:else if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{/if}
