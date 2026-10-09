<script lang="ts">
	// Satu panel dasbor: menentukan rentang & outlet (saringan atas atau yang dikunci panel), memuat data, memilih tampilan.
	import { hitungPanel } from '#lib/dasbor/api.ts';
	import { labelUkuran, ukuranRupiah, type JenisGrafik } from '#lib/dasbor/katalog.ts';
	import { keMatriks, keSeri, type Hasil } from '#lib/dasbor/olah.ts';
	import { LABEL_PERIODE, rentangPembanding, rentangPeriode, type Rentang } from '#lib/dasbor/periode.ts';
	import type { Panel, SaringanDasbor } from '#lib/dasbor/spek.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';
	import { untrack, type Snippet } from 'svelte';
	import TombolEkspor from '#lib/components/ekspor/TombolEkspor.svelte';
	import { LABEL_KELOMPOK } from '#lib/dasbor/katalog.ts';
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

	// Data dimuat ulang hanya bila isi panel, rentang, outlet, atau penanda segar berubah (bukan saat panel digeser/judul diketik).
	const kunciData = $derived(JSON.stringify([panel.jenis, panel.spek, rentang.dari.getTime(), rentang.sampai.getTime(), outlet, pakaiPembanding]));
	$effect(() => {
		void segar;
		if (!grafik) return;
		const [jenis, spek, , , o, banding] = JSON.parse(kunciData) as [Panel['jenis'], Panel['spek'], number, number, string | null, boolean];
		const r = untrack(() => rentang);
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
	/** Data panel sebagai lembar Excel: kolom kelompok + ukuran (+ periode sebelumnya bila dibandingkan). */
	function lembarPanel() {
		const h = hasil!;
		const lalu = new Map((pembanding?.baris ?? []).map((b) => [b.k.join('\u0000'), b.n]));
		return [
			{
				nama: panel.judul,
				kolom: [
					...h.kolom.map((k) => LABEL_KELOMPOK[k.kolom] ?? k.kolom),
					...h.ukuran.map(labelUkuran),
					...(pembanding ? h.ukuran.map((u) => `${labelUkuran(u)} (periode sebelumnya)`) : [])
				],
				baris: h.baris.map((b) => [...b.l, ...b.n, ...(pembanding ? h.ukuran.map((_, i) => lalu.get(b.k.join('\u0000'))?.[i] ?? 0) : [])])
			}
		];
	}
	const format = (u: string, n: number) =>
		ukuranRupiah(sumber, u) ? `${n < 0 ? '−' : ''}Rp${formatAngka(Math.abs(Math.round(n)))}` : n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
	const format0 = (n: number) => format(panel.spek.ukuran?.[0] ?? '', n);
	/** Beberapa ukuran dengan 1 kelompok: tiap seri punya satuannya sendiri (rupiah / jumlah). */
	const banyakUkuran = $derived(!!hasil && hasil.kolom.length < 2 && hasil.ukuran.length > 1);
	const formatSeri = (i: number) => (n: number) => format(hasil?.ukuran[i] ?? '', n);
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
			{#if grafik && hasil?.baris.length}
				<TombolEkspor kecil judul={panel.judul} lembar={lembarPanel} />
			{/if}
			{@render aksi?.()}
		</div>
	</header>
	<div class="min-h-0 flex-1 overflow-auto">
		{#if galat && hasil && grafik}<p class="mb-1 text-xs text-danger" role="alert">Gagal memperbarui: {galat}</p>{/if}
		{#if panel.jenis === 'status_stok'}
			<PanelStatusStok {outlets} {outlet} {segar} />
		{:else if panel.jenis === 'uang_laci'}
			<PanelUangLaci {outlets} {outlet} {segar} />
		{:else if panel.jenis === 'siklus_stok'}
			<PanelSiklus {outlets} {outlet} kunci={panel.spek.kunci ?? null} {rentang} {segar} />
		{:else if panel.jenis === 'riwayat'}
			<PanelRiwayat {outlets} {outlet} jenis={panel.spek.jenis ?? []} {rentang} {segar} />
		{:else if galat && !hasil}
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
			<GrafikGaris data={keSeri(hasil, labelUkuran)} format={format0} formatSeri={banyakUkuran ? formatSeri : undefined} />
		{:else if panel.jenis === 'batang'}
			<GrafikBatang data={keSeri(hasil, labelUkuran)} format={format0} {formatSeri} {banyakUkuran} tegak={hasil.kolom[0]?.kolom === 'waktu'} />
		{:else if panel.jenis === 'lingkaran'}
			<GrafikLingkaran data={keSeri(hasil, labelUkuran)} format={format0} />
		{:else if panel.jenis === 'peta_panas'}
			<PetaPanas data={keMatriks(hasil)} format={format0} />
		{/if}
	</div>
</article>
