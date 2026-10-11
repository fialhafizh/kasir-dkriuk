<script lang="ts">
	// Pengaturan hitungan modal; hanya untuk tampilan di perangkat ini (tidak mengubah data).
	import { ATURAN_AWAL, PILIHAN_PELENGKAP, type AturanModal } from '#lib/analisis/hitungan-modal.ts';
	import type { Bahan } from '#lib/master/types.ts';

	let { aturan = $bindable(), bahan }: { aturan: AturanModal; bahan: Bahan[] } = $props();

	const nama = (kode: string) => bahan.find((b) => b.kode === kode)?.nama ?? kode;
	const koma = (n: number, d = 3) => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');
	const angka = (t: string) => Number(t.replace(',', '.'));

	function ubahAngka(kunci: 'tepungKgPerPack' | 'persenDkriuk' | 'minyakLiterPerPack', t: string, maks = Infinity) {
		const n = angka(t);
		if (Number.isFinite(n) && n >= 0 && n <= maks) aturan = { ...aturan, [kunci]: n };
	}
	function alih(kode: string) {
		const ada = aturan.pelengkap.includes(kode);
		aturan = { ...aturan, pelengkap: ada ? aturan.pelengkap.filter((k) => k !== kode) : [...aturan.pelengkap, kode] };
	}
	const kotak = 'tabular min-h-10 w-24 rounded-lg border border-line-strong bg-surface px-2 text-right';
</script>

<details class="rounded-2xl bg-surface-2 p-3">
	<summary class="cursor-pointer font-semibold">Pengaturan hitungan</summary>
	<div class="mt-3 grid gap-4 text-sm lg:grid-cols-2">
		<fieldset class="grid gap-1">
			<legend class="font-semibold">Modal pack ayam dibagi ke potongan</legend>
			<label class="flex min-h-10 items-center gap-2"><input type="radio" class="size-5" checked={aturan.bagiAyam === 'harga'} onchange={() => (aturan = { ...aturan, bagiAyam: 'harga' })} /> Sebanding harga jual (dada menanggung lebih besar)</label>
			<label class="flex min-h-10 items-center gap-2"><input type="radio" class="size-5" checked={aturan.bagiAyam === 'rata'} onchange={() => (aturan = { ...aturan, bagiAyam: 'rata' })} /> Sama rata tiap potong</label>
		</fieldset>
		<fieldset class="grid gap-1">
			<legend class="font-semibold">Pelengkap tiap potong (masing-masing 1)</legend>
			<div class="flex flex-wrap gap-2">
				{#each PILIHAN_PELENGKAP as k (k)}
					<label class="flex min-h-10 items-center gap-2 rounded-xl bg-surface px-3"><input type="checkbox" class="size-5" checked={aturan.pelengkap.includes(k)} onchange={() => alih(k)} /> {nama(k)}</label>
				{/each}
			</div>
		</fieldset>
		<div class="grid gap-2">
			<label class="flex flex-wrap items-center gap-2">
				<input class={kotak} inputmode="decimal" value={koma(aturan.tepungKgPerPack)} onchange={(e) => ubahAngka('tepungKgPerPack', e.currentTarget.value)} />
				kg tepung campuran per pack ayam
			</label>
			<label class="flex flex-wrap items-center gap-2">
				<input class={kotak} inputmode="decimal" value={koma(aturan.persenDkriuk, 1)} onchange={(e) => ubahAngka('persenDkriuk', e.currentTarget.value, 100)} />
				% Tepung D'Kriuk dalam campuran (sisanya Tepung A)
			</label>
			<label class="flex flex-wrap items-center gap-2">
				<input class={kotak} inputmode="decimal" value={koma(aturan.minyakLiterPerPack)} onchange={(e) => ubahAngka('minyakLiterPerPack', e.currentTarget.value)} />
				liter minyak per pack ayam
			</label>
		</div>
		<div class="flex items-end">
			<button type="button" class="min-h-10 rounded-xl bg-surface px-4 font-semibold" onclick={() => (aturan = { ...ATURAN_AWAL, pelengkap: [...ATURAN_AWAL.pelengkap] })}>Kembalikan awal</button>
		</div>
	</div>
	<p class="mt-2 text-xs text-muted">Awal: 1,3 kg tepung untuk 3 pack ayam, campuran 50:50 menurut berat, 2 liter minyak untuk 10 pack ayam. Pengaturan ini hanya tersimpan di perangkat ini.</p>
</details>
