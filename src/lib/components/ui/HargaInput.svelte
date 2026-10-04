<script lang="ts">
	import { untrack } from 'svelte';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';

	let {
		id,
		label,
		nilai,
		onsimpan,
		maks = 100_000_000,
		disabled = false
	}: {
		id: string;
		label: string;
		nilai: number | null;
		onsimpan: (n: number) => Promise<void>;
		maks?: number;
		disabled?: boolean;
	} = $props();

	const tampil = (n: number | null) => (n == null ? '' : formatAngka(n));
	// Nilai awal sengaja diambil sekali; perubahan berikutnya diikuti oleh $effect.pre di bawah.
	let teks = $state(untrack(() => tampil(nilai)));
	let error = $state('');
	let status = $state<'diam' | 'menyimpan' | 'tersimpan'>('diam');

	// Nilai dari induk berubah (mis. dimuat ulang) → tampilkan nilai baru.
	$effect.pre(() => {
		teks = tampil(nilai);
	});

	async function selesai() {
		if (teks.trim() === '' && nilai == null) return;
		const n = parseRupiah(teks, maks);
		if (n === null) {
			error = `Isi angka Rupiah 0–${formatAngka(maks)}, mis. 11.000`;
			return;
		}
		error = '';
		teks = formatAngka(n);
		if (n === nilai) return;
		status = 'menyimpan';
		try {
			await onsimpan(n);
			status = 'tersimpan';
		} catch (e) {
			error = (e as Error).message;
			status = 'diam';
		}
	}
</script>

<div class="grid gap-1">
	<label for={id} class="sr-only">{label}</label>
	<div class="relative">
		<span class="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted" aria-hidden="true">Rp</span>
		<input
			{id}
			bind:value={teks}
			data-maks={maks}
			inputmode="numeric"
			autocomplete="off"
			{disabled}
			onblur={selesai}
			onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${id}-err` : undefined}
			class="tabular min-h-12 w-full min-w-28 rounded-xl border border-line-strong bg-surface pr-8 pl-9 text-right text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none disabled:opacity-60"
		/>
		{#if status === 'menyimpan'}
			<span class="absolute inset-y-0 right-2 grid place-items-center" aria-label="Menyimpan">
				<span class="size-3 animate-spin rounded-full border-2 border-muted border-r-transparent"></span>
			</span>
		{:else if status === 'tersimpan'}
			<span class="absolute inset-y-0 right-2 grid place-items-center text-ok" aria-label="Tersimpan">✓</span>
		{/if}
	</div>
	{#if error}<p id="{id}-err" class="text-xs text-danger" role="alert">{error}</p>{/if}
</div>
