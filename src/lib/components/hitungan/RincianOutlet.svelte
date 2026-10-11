<script lang="ts">
	// Rincian hitungan modal satu outlet: harga per satuan, pelengkap, tepung campuran, minyak, modal per potong & per pack.
	import type { AturanModal, HasilOutlet } from '#lib/analisis/hitungan-modal.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { judul, h, aturan }: { judul: string; h: HasilOutlet; aturan: AturanModal } = $props();

	const rp = (n: number | null) => (n === null ? '-' : `${n < 0 ? '−' : ''}Rp${formatAngka(Math.abs(n))}`);
	// Rupiah dengan satu desimal untuk harga per satuan kecil (mis. Rp207,5).
	const rp1 = (n: number | null) => (n === null ? '-' : `Rp${(Math.round(n * 10) / 10).toLocaleString('id-ID')}`);
	const kg = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 3 });
	const th = 'py-1 pr-2 text-right';
	const td = 'tabular py-1.5 pr-2 text-right';
</script>

<section class="grid gap-4" aria-label="Hitungan modal {judul}">
	{#if h.kurang.length}
		<p class="rounded-xl border-2 border-warn p-2 text-sm" role="status">
			Harga belum diisi di Harga Beli: <b>{h.kurang.join(', ')}</b>. Hitungan yang memakainya belum lengkap.
		</p>
	{/if}

	{#each h.pack as p (p.nama)}
		<div class="rounded-2xl border border-line bg-surface p-3">
			<h3 class="font-display text-xl">{p.nama} — {judul}</h3>
			<p class="text-sm text-muted">Harga pack {rp(p.hargaPack)} · {p.jumlahPotong} potong</p>
			<div class="mt-2 overflow-x-auto">
				<table class="w-full min-w-[44rem] text-sm">
					<thead class="text-left text-xs text-muted">
						<tr>
							<th class="py-1 pr-2">Potongan</th><th class={th}>Isi</th><th class={th}>Ayam</th><th class={th}>Pelengkap</th>
							<th class={th}>Tepung</th><th class={th}>Minyak</th><th class={th}>Modal</th><th class={th}>Harga jual</th>
							<th class={th}>Untung</th><th class="py-1 text-right">%</th>
						</tr>
					</thead>
					<tbody>
						{#each p.potong as x (x.nama)}
							<tr class="border-t border-line">
								<td class="py-1.5 pr-2">{x.nama}</td>
								<td class={td}>{x.jumlah}</td>
								<td class={td}>{rp(x.ayam)}</td>
								<td class={td}>{rp(x.pelengkap)}</td>
								<td class={td}>{rp(x.tepung)}</td>
								<td class={td}>{rp(x.minyak)}</td>
								<td class="{td} font-bold">{rp(x.modal)}</td>
								<td class={td}>{rp(x.jual)}</td>
								<td class="{td} font-bold {x.untung < 0 ? 'text-danger' : ''}">{rp(x.untung)}</td>
								<td class="tabular py-1.5 text-right">{x.persen.toLocaleString('id-ID')}%</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="mt-3 grid gap-2 sm:grid-cols-4">
				<div class="rounded-xl bg-surface-2 p-2"><p class="text-xs text-muted">Modal 1 pack</p><p class="tabular font-display text-lg">{rp(p.modalPack)}</p></div>
				<div class="rounded-xl bg-surface-2 p-2"><p class="text-xs text-muted">Hasil jual 1 pack</p><p class="tabular font-display text-lg">{rp(p.jualPack)}</p></div>
				<div class="rounded-xl bg-surface-2 p-2"><p class="text-xs text-muted">Untung 1 pack</p><p class="tabular font-display text-lg {p.untungPack < 0 ? 'text-danger' : ''}">{rp(p.untungPack)} ({p.persenPack.toLocaleString('id-ID')}%)</p></div>
				<div class="rounded-xl bg-surface-2 p-2"><p class="text-xs text-muted">Rata-rata untung per potong</p><p class="tabular font-display text-lg">{rp(p.untungPack / p.jumlahPotong)}</p></div>
			</div>
		</div>
	{/each}

	<div class="grid gap-3 lg:grid-cols-3">
		<div class="rounded-2xl border border-line bg-surface p-3 text-sm">
			<h3 class="font-semibold">Pelengkap per potong</h3>
			<ul class="mt-1 grid gap-0.5">
				{#each h.pelengkap.daftar as x (x.kode)}
					<li class="flex justify-between gap-2"><span>{x.nama} <span class="text-xs text-muted">({rp(x.hargaPack)} ÷ {kg(x.isiPack)})</span></span><span class="tabular">{rp1(x.perSatuan)}</span></li>
				{/each}
				<li class="flex justify-between gap-2 border-t border-line pt-1 font-bold"><span>Jumlah</span><span class="tabular">{rp1(h.pelengkap.perPotong)}</span></li>
			</ul>
		</div>
		<div class="rounded-2xl border border-line bg-surface p-3 text-sm">
			<h3 class="font-semibold">Tepung campuran</h3>
			<ul class="mt-1 grid gap-0.5">
				<li class="flex justify-between gap-2"><span>Tepung D'Kriuk per kg</span><span class="tabular">{rp(h.tepung.dkriukKg)}</span></li>
				<li class="flex justify-between gap-2"><span>Tepung A per kg</span><span class="tabular">{rp(h.tepung.aKg)}</span></li>
				<li class="flex justify-between gap-2"><span>Campuran {kg(aturan.persenDkriuk)} : {kg(100 - aturan.persenDkriuk)} per kg</span><span class="tabular">{rp(h.tepung.campuranKg)}</span></li>
				<li class="flex justify-between gap-2"><span>× {kg(aturan.tepungKgPerPack)} kg per pack ayam</span><span class="tabular font-bold">{rp(h.tepung.perPack)}</span></li>
				{#if h.tepung.dkriukKg !== null && h.tepung.perPack !== null}
					<li class="text-xs text-muted">Bila tepung D'Kriuk murni: {rp(h.tepung.dkriukKg * aturan.tepungKgPerPack)} per pack (selisih {rp(h.tepung.dkriukKg * aturan.tepungKgPerPack - h.tepung.perPack)}).</li>
				{/if}
			</ul>
		</div>
		<div class="rounded-2xl border border-line bg-surface p-3 text-sm">
			<h3 class="font-semibold">Minyak</h3>
			<ul class="mt-1 grid gap-0.5">
				<li class="flex justify-between gap-2"><span>Per liter</span><span class="tabular">{rp(h.minyak.perLiter)}</span></li>
				<li class="flex justify-between gap-2"><span>× {kg(aturan.minyakLiterPerPack)} liter per pack ayam</span><span class="tabular font-bold">{rp(h.minyak.perPack)}</span></li>
			</ul>
		</div>
	</div>

	<details class="rounded-2xl border border-line bg-surface p-3 text-sm">
		<summary class="cursor-pointer font-semibold">Semua harga per satuan di {judul}</summary>
		<div class="mt-2 overflow-x-auto">
			<table class="w-full min-w-[32rem]">
				<thead class="text-left text-xs text-muted"><tr><th class="py-1 pr-2">Bahan</th><th class="py-1 pr-2">Dari</th><th class={th}>Harga</th><th class={th}>Isi</th><th class="py-1 text-right">Per satuan</th></tr></thead>
				<tbody>
					{#each h.harga as x (x.kode)}
						<tr class="border-t border-line">
							<td class="py-1 pr-2">{x.nama}</td><td class="py-1 pr-2 text-muted">{x.dari}</td>
							<td class="tabular py-1 pr-2 text-right">{rp(x.hargaPack)}</td><td class="tabular py-1 pr-2 text-right">{kg(x.isiPack)} {x.satuan}</td>
							<td class="tabular py-1 text-right">{rp1(x.perSatuan)}/{x.satuan}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
</section>
