<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { porsiPerKg, qtyKgDariPorsi } from '#lib/master/porsi.ts';
	import { validasiResep } from '#lib/master/resep.ts';
	import { formatQty, parseQty } from '#lib/master/rupiah.ts';
	import type { Bahan, BarisIsi, Menu } from '#lib/master/types.ts';

	let {
		menu,
		bahan,
		isi,
		onsimpan,
		onbatal
	}: { menu: Menu; bahan: Bahan[]; isi: BarisIsi[]; onsimpan: (isi: BarisIsi[]) => Promise<void>; onbatal: () => void } = $props();

	type Baris = { bahan_id: string; teks: string };
	// Salinan isi saat editor dibuka; editor ditutup-buka ulang untuk memuat isi terbaru.
	const salinIsi = (daftar: BarisIsi[]): Baris[] => daftar.map((i) => ({ bahan_id: i.bahan_id, teks: formatQty(i.qty) }));
	let baris = $state<Baris[]>(untrack(() => salinIsi(isi)));
	let error = $state('');
	let menyimpan = $state(false);

	// Sama dengan aturan database: resep hanya boleh memakai bahan aktif yang dipotong otomatis.
	const pilihan = $derived(bahan.filter((b) => b.aktif && b.mode === 'otomatis'));
	const satuanDari = (id: string) => bahan.find((b) => b.id === id)?.satuan ?? '';
	const beras = $derived(bahan.find((b) => b.kode === 'beras'));

	function tambah() {
		const sisa = pilihan.find((b) => !baris.some((r) => r.bahan_id === b.id));
		if (sisa) baris.push({ bahan_id: sisa.id, teks: '1' });
	}

	async function simpan() {
		const hasil = validasiResep(baris);
		if (!hasil.ok) {
			error = hasil.error;
			return;
		}
		error = '';
		menyimpan = true;
		try {
			await onsimpan(hasil.isi);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			menyimpan = false;
		}
	}
</script>

<div class="mt-3 grid gap-3 rounded-xl bg-surface-2 p-3">
	<p class="text-sm font-semibold">Setiap 1 {menu.nama} terjual memotong:</p>
	{#each baris as r, idx (idx)}
		<div class="flex flex-wrap items-center gap-2">
			<label class="sr-only" for="resep-{menu.id}-bahan-{idx}">Bahan</label>
			<select
				id="resep-{menu.id}-bahan-{idx}"
				bind:value={r.bahan_id}
				class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-fg"
			>
				{#each pilihan as b (b.id)}<option value={b.id}>{b.nama}</option>{/each}
			</select>
			<label class="sr-only" for="resep-{menu.id}-qty-{idx}">Jumlah</label>
			<input
				id="resep-{menu.id}-qty-{idx}"
				bind:value={r.teks}
				inputmode="decimal"
				class="tabular min-h-12 w-24 rounded-xl border border-line-strong bg-surface px-3 text-right text-fg"
			/>
			<span class="w-14 text-sm text-muted">{satuanDari(r.bahan_id)}</span>
			<button
				type="button"
				class="min-h-12 rounded-xl px-3 text-sm text-danger hover:bg-surface"
				onclick={() => baris.splice(idx, 1)}
				aria-label="Hapus baris"
			>
				Hapus
			</button>
		</div>
		{#if beras && r.bahan_id === beras.id && parseQty(r.teks)}
			<p class="-mt-1 text-xs text-muted">= {formatQty(porsiPerKg(parseQty(r.teks) ?? 0))} porsi per kg beras</p>
			<div class="-mt-1 flex flex-wrap gap-2">
				{#each [9, 10, 12, 14] as p (p)}
					<button
						type="button"
						class="min-h-10 rounded-lg border border-line px-3 text-xs hover:bg-surface"
						onclick={() => (r.teks = formatQty(qtyKgDariPorsi(p)))}
					>
						{p} porsi/kg
					</button>
				{/each}
			</div>
		{/if}
	{/each}
	{#if error}<p class="text-sm text-danger" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap gap-2">
		<Button variant="ghost" onclick={tambah}>+ Tambah bahan</Button>
		<span class="flex-1"></span>
		<Button variant="ghost" onclick={onbatal} disabled={menyimpan}>Batal</Button>
		<Button onclick={simpan} loading={menyimpan}>Simpan resep</Button>
	</div>
</div>
