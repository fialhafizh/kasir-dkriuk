<script lang="ts">
	// Satu panel dasbor: menentukan rentang & outlet (saringan atas atau yang dikunci panel), memuat data, memilih tampilan.
	import { hitungPanel } from '#lib/dasbor/api.ts';
	import { labelUkuran, ukuranRupiah, type JenisGrafik } from '#lib/dasbor/katalog.ts';
	import { keMatriks, keSeri, type Hasil } from '#lib/dasbor/olah.ts';
	import { LABEL_PERIODE, rentangPembanding, rentangPeriode, type Rentang } from '#lib/dasbor/periode.ts';
	import type { Panel, SaringanDasbor } from '#lib/dasbor/spek.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';
	import type { Snippet } from 'svelte';
	import AngkaUtama from './AngkaUtama.svelte';
	import GrafikBatang from './GrafikBatang.svelte';
	import GrafikGaris from './GrafikGaris.svelte';
	import GrafikLingkaran from './GrafikLingkaran.svelte';
	import PanelRiwayat from './PanelRiwayat.svelte';
	import PanelSiklus from './PanelSiklus.svelte';
	import PanelStatusStok from './PanelStatusStok.svelte';
	import PanelUangLaci from './PanelUangLaci.svelte';
	import PetaPanas from './PetaPanas.svelte';
	import TabelHasil from './TabelHasil.svelte';

	let {
		panel,
		saringan,
		outlets,
		sekarang,
		segar,
		aksi
	}: { panel: Panel; saringan: SaringanDasbor; outlets: Outlet[]; sekarang: Date; segar: number; aksi?: Snippet } = $props();

	const periode = $derived(panel.spek.periode_kunci ?? saringan.periode);
	const rentang: Rentang = $derived(
		rentangPeriode(periode, sekarang, periode === 'kustom' && saringan.dari && saringan.sampai ? { dari: saringan.dari, sampai: saringan.sampai } : undefined)
	);
	const outlet = $derived(panel.spek.outlet_kunci ?? saringan.outlet_id);
	const grafik = $derived(['angka', 'batang', 'garis', 'lingkaran', 'tabel', 'peta_panas'].includes(panel.jenis));
	const pakaiPembanding = $derived(!!panel.spek.bandingkan && (panel.jenis === 'angka' || panel.jenis === 'tabel'));

	let hasil = $state<Hasil | null>(null);
	let pembanding = $state<Hasil | null>(null);
	let galat = $state('');
	let sebagaiTabel = $state(false);

	$effect(() => {
		void segar;
		if (!grafik) return;
		const r = rentang;
		const jenis = panel.jenis;
		const spek = $state.snapshot(panel.spek);
		const o = outlet;
		const banding = pakaiPembanding;
		let batal = false;
		Promise.all([hitungPanel(jenis, spek, o, r), banding ? hitungPanel(jenis, spek, o, rentangPembanding(periode, r)) : Promise.resolve(null)])
			.then(([h, p]) => {
				if (batal) return;
				hasil = h;
				pembanding = p;
				galat = '';
			})
			.catch((e) => {
				if (!batal) galat = (e as Error).message;
			});
		return () => {
			batal = true;
		};
	});

	const sumber = $derived(panel.spek.sumber ?? '');
	const format = (u: string, n: number) => (ukuranRupiah(sumber, u) ? `Rp${formatAngka(Math.round(n))}` : n.toLocaleString('id-ID', { maximumFractionDigits: 2 }));
	const format0 = (n: number) => format(panel.spek.ukuran?.[0] ?? '', n);
	const keterangan = $derived(
		[panel.spek.periode_kunci ? LABEL_PERIODE[panel.spek.periode_kunci] : '', panel.spek.outlet_kunci ? (outlets.find((x) => x.id === panel.spek.outlet_kunci)?.nama ?? '') : '']
			.filter(Boolean)
			.join(' · ')
	);
</script>

<article class="flex h-full min-h-0 flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
	<header class="flex items-start justify-between gap-2">
		<div class="min-w-0">
			<h2 class="truncate text-sm font-bold">{panel.judul}</h2>
			{#if keterangan}<p class="text-xs text-muted">{keterangan}</p>{/if}
		</div>
		<div class="flex shrink-0 items-center gap-1">
			{#if grafik && panel.jenis !== 'tabel' && panel.jenis !== 'angka'}
				<button type="button" class="min-h-8 rounded-lg px-2 text-xs text-muted hover:bg-surface-2" aria-pressed={sebagaiTabel} onclick={() => (sebagaiTabel = !sebagaiTabel)}>
					{sebagaiTabel ? 'Grafik' : 'Tabel'}
				</button>
			{/if}
			{@render aksi?.()}
		</div>
	</header>
	<div class="min-h-0 flex-1">
		{#if panel.jenis === 'status_stok'}
			<PanelStatusStok {outlets} {outlet} {segar} />
		{:else if panel.jenis === 'uang_laci'}
			<PanelUangLaci {outlets} {outlet} {segar} />
		{:else if panel.jenis === 'siklus_stok'}
			<PanelSiklus {outlets} {outlet} kunci={panel.spek.kunci ?? null} {rentang} {segar} />
		{:else if panel.jenis === 'riwayat'}
			<PanelRiwayat {outlets} {outlet} jenis={panel.spek.jenis ?? []} {rentang} {segar} />
		{:else if galat}
			<p class="text-sm text-danger" role="alert">{galat}</p>
		{:else if !hasil}
			<p class="text-sm text-muted" role="status">Memuat…</p>
		{:else if !hasil.baris.length}
			<p class="text-sm text-muted">Belum ada data di periode ini.</p>
		{:else if panel.jenis === 'angka'}
			<AngkaUtama nilai={hasil.baris[0]?.n[0] ?? 0} sebelum={pembanding ? (pembanding.baris[0]?.n[0] ?? 0) : null} teks={format0(hasil.baris[0]?.n[0] ?? 0)} />
		{:else if panel.jenis === 'tabel' || sebagaiTabel}
			<TabelHasil {hasil} pembanding={panel.jenis === 'tabel' ? pembanding : null} {format} />
		{:else if (panel.jenis as JenisGrafik) === 'garis'}
			<GrafikGaris data={keSeri(hasil, labelUkuran)} format={format0} />
		{:else if panel.jenis === 'batang'}
			<GrafikBatang data={keSeri(hasil, labelUkuran)} format={format0} tegak={hasil.kolom[0]?.kolom === 'waktu'} />
		{:else if panel.jenis === 'lingkaran'}
			<GrafikLingkaran data={keSeri(hasil, labelUkuran)} format={format0} />
		{:else if panel.jenis === 'peta_panas'}
			<PetaPanas data={keMatriks(hasil)} format={format0} />
		{/if}
	</div>
</article>
