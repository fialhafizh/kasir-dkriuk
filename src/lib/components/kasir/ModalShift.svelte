<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { saldoLaciPerangkat, type SaldoLaci } from '#lib/kas/laci.ts';
	import { buatKejadianBuka } from '#lib/kasir/offline-kasir.ts';
	import { tambahKejadian } from '#lib/offline/antrean.ts';
	import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { outlet, onbuka }: { outlet: Outlet; onbuka: (shiftId: string) => void } = $props();

	let laci = $state<SaldoLaci | null>(null);
	let dimuat = $state(false);
	let teks = $state('');
	let error = $state('');
	let memproses = $state(false);
	let input = $state<HTMLInputElement>();

	// Uang laci menumpuk lintas hari: modal = saldo laci. Hanya pertama kali (atau saldo tak diketahui) kasir mengisi.
	const perluIsi = $derived(dimuat && !laci?.adaAwal);

	onMount(async () => {
		laci = await saldoLaciPerangkat(outlet.id).catch(() => null);
		dimuat = true;
		if (perluIsi) {
			if (teks.trim() === '') teks = '0';
			queueMicrotask(() => {
				input?.focus();
				input?.select();
			});
		}
	});

	async function mulai(e: SubmitEvent) {
		e.preventDefault();
		let modal = laci?.saldo ?? 0;
		let awal: number | undefined;
		if (perluIsi) {
			const n = parseRupiah(teks);
			if (n === null) {
				error = 'Isi jumlah uang yang ada di laci, mis. 100.000 (isi 0 bila kosong).';
				return;
			}
			modal = n;
			awal = n;
		}
		memproses = true;
		error = '';
		try {
			// Buka toko masuk antrean (bisa tanpa internet); server menggabungkan bila perangkat lain sudah membuka.
			const k = buatKejadianBuka(outlet.id, modal, new Date(), awal);
			await tambahKejadian(dbKasir, { ...k, user_id: auth.profile?.id ?? null });
			void sinkron.jalankan();
			onbuka(k.shift_id!);
		} catch (err) {
			error = (err as Error).message;
		} finally {
			memproses = false;
		}
	}
</script>

<form class="mx-auto mt-6 grid max-w-sm gap-4 rounded-2xl border-2 border-brand bg-surface p-5" onsubmit={mulai} novalidate>
	<h2 class="font-display text-2xl">Mulai jualan</h2>
	{#if !dimuat}
		<p class="text-muted" role="status">Memuat uang laci…</p>
	{:else if perluIsi}
		<p class="text-sm text-muted">
			{outlet.merek} {outlet.nama} · {laci ? 'pertama kali memakai catatan laci:' : 'data laci belum tersimpan di perangkat ini:'} hitung uang yang ada di laci sekarang.
		</p>
		<div class="grid gap-1.5">
			<label for="modal-shift" class="text-sm font-semibold">Uang di laci sekarang</label>
			<div class="relative">
				<span class="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted" aria-hidden="true">Rp</span>
				<input
					id="modal-shift"
					bind:this={input}
					bind:value={teks}
					inputmode="numeric"
					autocomplete="off"
					class="tabular min-h-14 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-right text-2xl text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none"
				/>
			</div>
		</div>
	{:else}
		<p class="text-sm text-muted">{outlet.merek} {outlet.nama}</p>
		<p class="text-lg">Uang di laci sekarang</p>
		<p class="tabular font-display text-4xl text-brand">Rp{formatAngka(laci?.saldo ?? 0)}</p>
		<p class="text-xs text-muted">
			Sudah termasuk sisa kemarin, pengeluaran, dan setoran.{laci?.dariSalinan ? ' (data dari perangkat)' : ''} Bila beda dengan uang di laci, selisihnya terlihat saat tutup toko.
		</p>
	{/if}
	{#if error}<p class="text-sm text-danger" role="alert">{error}</p>{/if}
	<Button type="submit" loading={memproses} disabled={!dimuat} class="min-h-14 text-lg">Mulai jualan</Button>
</form>
