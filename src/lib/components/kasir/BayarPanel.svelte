<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import { kembalian, METODE, tombolCepat } from '#lib/kasir/bayar.ts';
	import type { Metode } from '#lib/kasir/types.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';

	let {
		total,
		onbayar,
		onbatal
	}: { total: number; onbayar: (metode: Metode, diterima: number | null) => Promise<void>; onbatal: () => void } = $props();

	let metode = $state<Metode>('cash');
	let teks = $state('');
	let error = $state('');
	let memproses = $state(false);

	const diterima = $derived(parseRupiah(teks));
	const kembali = $derived(diterima === null ? null : kembalian(total, diterima));
	const bisaBayar = $derived(metode !== 'cash' || kembali !== null);

	async function bayar() {
		if (!bisaBayar || memproses) return;
		memproses = true;
		error = '';
		try {
			await onbayar(metode, metode === 'cash' ? diterima : null);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			memproses = false;
		}
	}
</script>

<div class="grid gap-4 rounded-2xl border-2 border-brand bg-surface p-4">
	<p class="flex items-baseline justify-between">
		<span class="font-semibold">Total</span><span class="tabular font-display text-3xl text-brand">Rp{formatAngka(total)}</span>
	</p>
	<fieldset class="grid gap-2">
		<legend class="mb-1 text-sm font-semibold">Metode bayar</legend>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
			{#each METODE as m (m.kode)}
				<label
					class="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-sm font-bold has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-on-brand {metode ===
					m.kode
						? ''
						: 'border-line'}"
				>
					<input type="radio" name="metode" value={m.kode} bind:group={metode} class="sr-only" />
					{m.label}
				</label>
			{/each}
		</div>
	</fieldset>
	{#if metode === 'cash'}
		<div class="grid gap-2">
			<label for="uang-diterima" class="text-sm font-semibold">Uang diterima</label>
			<input
				id="uang-diterima"
				bind:value={teks}
				inputmode="numeric"
				autocomplete="off"
				placeholder="0"
				class="tabular min-h-14 rounded-xl border border-line-strong bg-surface px-3 text-right text-2xl text-fg focus:border-brand focus:outline-none"
			/>
			<div class="flex flex-wrap gap-2">
				{#each tombolCepat(total) as n, i (n)}
					<button type="button" class="min-h-12 flex-1 rounded-xl bg-surface-2 px-3 font-semibold" onclick={() => (teks = formatAngka(n))}>
						{i === 0 ? 'Uang pas' : formatAngka(n)}
					</button>
				{/each}
			</div>
			<p class="flex justify-between text-lg" role="status">
				<span>Kembali</span>
				<span class="tabular font-bold {kembali === null ? 'text-danger' : 'text-ok'}">
					{teks.trim() === '' ? '—' : kembali === null ? 'Uang kurang' : `Rp${formatAngka(kembali)}`}
				</span>
			</p>
		</div>
	{/if}
	{#if error}<p class="text-sm font-semibold text-danger" role="alert">{error}</p>{/if}
	<div class="flex gap-2">
		<Button variant="ghost" onclick={onbatal} disabled={memproses}>Kembali</Button>
		<Button class="min-h-14 flex-1 text-lg" disabled={!bisaBayar} loading={memproses} onclick={bayar}>Bayar</Button>
	</div>
</div>
