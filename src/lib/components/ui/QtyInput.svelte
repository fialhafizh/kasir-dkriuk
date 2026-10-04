<script lang="ts">
	import { untrack } from 'svelte';
	import { formatQty, parseQty } from '#lib/master/rupiah.ts';

	let {
		id,
		label,
		nilai,
		satuan,
		onsimpan,
		desimal = 4,
		disabled = false
	}: {
		id: string;
		label: string;
		nilai: number | null;
		satuan: string;
		onsimpan: (n: number) => Promise<void>;
		desimal?: number;
		disabled?: boolean;
	} = $props();

	const tampil = (n: number | null) => (n == null ? '' : formatQty(n));
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
		const n = parseQty(teks, desimal);
		if (n === null) {
			error = `Isi angka lebih dari 0 dengan koma untuk desimal (maks. ${desimal} angka), mis. 1,3`;
			return;
		}
		error = '';
		teks = formatQty(n);
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
	<div class="flex items-center gap-2">
		<input
			{id}
			bind:value={teks}
			data-desimal={desimal}
			inputmode="decimal"
			autocomplete="off"
			{disabled}
			onblur={selesai}
			onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? `${id}-err` : undefined}
			class="tabular min-h-12 w-24 rounded-xl border border-line-strong bg-surface px-3 text-right text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none disabled:opacity-60"
		/>
		<span class="text-sm text-muted">{satuan}</span>
		{#if status === 'menyimpan'}<span class="text-xs text-muted">menyimpan…</span>{/if}
		{#if status === 'tersimpan'}<span class="text-ok" aria-label="Tersimpan">✓</span>{/if}
	</div>
	{#if error}<p id="{id}-err" class="text-xs text-danger" role="alert">{error}</p>{/if}
</div>
