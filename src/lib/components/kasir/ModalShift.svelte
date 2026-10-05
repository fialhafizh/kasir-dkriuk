<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { galatJaringan } from '#lib/auth/cache-profil.ts';
	import { modalTerakhir } from '#lib/kasir/api.ts';
	import { buatKejadianBuka } from '#lib/kasir/offline-kasir.ts';
	import { tambahKejadian } from '#lib/offline/antrean.ts';
	import { denganSalinan } from '#lib/offline/salinan.ts';
	import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { outlet, onbuka }: { outlet: Outlet; onbuka: (shiftId: string) => void } = $props();

	let teks = $state('');
	let error = $state('');
	let memproses = $state(false);
	let input = $state<HTMLInputElement>();

	onMount(async () => {
		let awal = '0';
		try {
			awal = formatAngka((await denganSalinan(dbKasir, `modal:${outlet.id}`, () => modalTerakhir(outlet.id), (e) => galatJaringan(e as { message?: string }))).nilai);
		} catch {
			// biarkan 0
		}
		// Jangan timpa angka yang sudah mulai diketik kasir.
		if (teks.trim() === '') teks = awal;
		input?.focus();
		input?.select();
	});

	async function mulai(e: SubmitEvent) {
		e.preventDefault();
		const modal = parseRupiah(teks);
		if (modal === null) {
			error = 'Isi jumlah uang modal, mis. 200.000 (isi 0 bila tidak ada).';
			return;
		}
		memproses = true;
		error = '';
		try {
			// Buka toko masuk antrean (bisa tanpa internet); server menggabungkan bila perangkat lain sudah membuka.
			const k = buatKejadianBuka(outlet.id, modal, new Date());
			await tambahKejadian(dbKasir, k);
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
	<p class="text-sm text-muted">{outlet.merek} {outlet.nama} · isi uang kembalian yang ada di laci sekarang.</p>
	<div class="grid gap-1.5">
		<label for="modal-shift" class="text-sm font-semibold">Modal kembalian</label>
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
		{#if error}<p class="text-sm text-danger" role="alert">{error}</p>{/if}
	</div>
	<Button type="submit" loading={memproses} class="min-h-14 text-lg">Mulai jualan</Button>
</form>
