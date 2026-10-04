<script lang="ts">
	import { tick, untrack } from 'svelte';
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
		onbatal,
		onkotor,
		onsibuk
	}: {
		menu: Menu;
		bahan: Bahan[];
		isi: BarisIsi[];
		onsimpan: (isi: BarisIsi[]) => Promise<void>;
		onbatal: () => void;
		/** Dipanggil saat ada/tidak ada perubahan yang belum disimpan. */
		onkotor?: (kotor: boolean) => void;
		/** Dipanggil saat mulai/selesai menyimpan. */
		onsibuk?: (sibuk: boolean) => void;
	} = $props();

	type Baris = { id: string; bahan_id: string; teks: string };
	const baru = (bahan_id: string, teks: string): Baris => ({ id: crypto.randomUUID(), bahan_id, teks });
	// Salinan isi saat editor dibuka; editor ditutup-buka ulang untuk memuat isi terbaru.
	const salinIsi = (daftar: BarisIsi[]): Baris[] => daftar.map((i) => baru(i.bahan_id, formatQty(i.qty)));
	let baris = $state<Baris[]>(untrack(() => salinIsi(isi)));
	const awal = untrack(() => JSON.stringify(isi.map((i) => [i.bahan_id, formatQty(i.qty)])));
	let error = $state('');
	let menyimpan = $state(false);
	let wadahTambah = $state<HTMLDivElement>();

	// Sama dengan aturan database: resep hanya boleh memakai bahan aktif yang dipotong otomatis.
	const pilihan = $derived(bahan.filter((b) => b.aktif && b.mode === 'otomatis'));
	const idSah = $derived(new Set(pilihan.map((b) => b.id)));
	const cari = (id: string) => bahan.find((b) => b.id === id);
	const beras = $derived(bahan.find((b) => b.kode === 'beras'));
	const sisa = $derived(pilihan.filter((b) => !baris.some((r) => r.bahan_id === b.id)));

	$effect(() => {
		onkotor?.(JSON.stringify(baris.map((r) => [r.bahan_id, r.teks.trim()])) !== awal);
	});

	function tambah() {
		if (sisa[0]) baris.push(baru(sisa[0].id, '1'));
	}

	async function hapus(idx: number) {
		baris.splice(idx, 1);
		await tick();
		wadahTambah?.querySelector('button')?.focus();
	}

	async function simpan() {
		const hasil = validasiResep(baris, idSah);
		if (!hasil.ok) {
			error = hasil.error;
			return;
		}
		error = '';
		menyimpan = true;
		onsibuk?.(true);
		try {
			await onsimpan(hasil.isi);
		} catch (e) {
			error = (e as Error).message;
		} finally {
			menyimpan = false;
			onsibuk?.(false);
		}
	}
</script>

<div id="resep-editor-{menu.id}" class="mt-3 grid gap-3 rounded-xl bg-surface-2 p-3">
	<p class="text-sm font-semibold">Setiap 1 {menu.nama} terjual memotong:</p>
	{#each baris as r, idx (r.id)}
		{@const b = cari(r.bahan_id)}
		<div class="flex flex-wrap items-center gap-2">
			<label class="sr-only" for="resep-{menu.id}-bahan-{r.id}">Bahan baris {idx + 1}</label>
			<select
				id="resep-{menu.id}-bahan-{r.id}"
				bind:value={r.bahan_id}
				aria-invalid={idSah.has(r.bahan_id) ? undefined : 'true'}
				class="min-h-12 min-w-0 flex-1 rounded-xl border bg-surface px-3 text-fg {idSah.has(r.bahan_id) ? 'border-line-strong' : 'border-danger'}"
			>
				{#if !idSah.has(r.bahan_id)}
					<option value={r.bahan_id} disabled>{b?.nama ?? 'Bahan tidak dikenal'} (nonaktif/tidak otomatis — ganti)</option>
				{/if}
				{#each pilihan as p (p.id)}<option value={p.id}>{p.nama}</option>{/each}
			</select>
			<label class="sr-only" for="resep-{menu.id}-qty-{r.id}">Jumlah baris {idx + 1}</label>
			<input
				id="resep-{menu.id}-qty-{r.id}"
				bind:value={r.teks}
				inputmode="decimal"
				class="tabular min-h-12 w-24 rounded-xl border border-line-strong bg-surface px-3 text-right text-fg"
			/>
			<span class="w-14 text-sm text-muted">{b?.satuan ?? ''}</span>
			<button
				type="button"
				class="min-h-12 rounded-xl px-3 text-sm text-danger hover:bg-surface focus-visible:outline-3 focus-visible:outline-focus"
				onclick={() => hapus(idx)}
				aria-label="Hapus {b?.nama ?? 'baris'} dari resep"
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
						class="min-h-12 rounded-lg border border-line px-3 text-xs hover:bg-surface focus-visible:outline-3 focus-visible:outline-focus"
						onclick={() => (r.teks = formatQty(qtyKgDariPorsi(p)))}
					>
						{p} porsi/kg
					</button>
				{/each}
			</div>
		{/if}
	{/each}
	{#if error}<p class="text-sm text-danger" role="alert">{error}</p>{/if}
	<div class="flex flex-wrap items-center gap-2">
		<div bind:this={wadahTambah}>
			<Button variant="ghost" onclick={tambah} disabled={sisa.length === 0}>+ Tambah bahan</Button>
		</div>
		{#if sisa.length === 0}<span class="text-xs text-muted">Semua bahan sudah dipakai</span>{/if}
		<span class="flex-1"></span>
		<Button variant="ghost" onclick={onbatal} disabled={menyimpan}>Batal</Button>
		<Button onclick={simpan} loading={menyimpan}>Simpan resep</Button>
	</div>
</div>
