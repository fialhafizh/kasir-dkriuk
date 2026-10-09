<script lang="ts">
	import Petunjuk from '#lib/components/bantuan/Petunjuk.svelte';
	import { onMount } from 'svelte';
	import TombolBagikan from '#lib/components/ekspor/TombolBagikan.svelte';
	import TombolEkspor from '#lib/components/ekspor/TombolEkspor.svelte';
	import { kunciSel, lembarBelanja, muatRencana, ringkas, teksBelanja, type Isian, type Rencana } from '#lib/belanja/belanja.ts';
	import { tanggalWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	const KUNCI = 'belanja:isian';
	let hari = $state(7);
	let rencana = $state<Rencana | null>(null);
	let isian = $state<Isian>({});
	let galat = $state('');
	let memuat = $state(false);

	// Isian berlaku hari ini saja (belanja minggu depan mulai dari saran baru).
	const hariIni = tanggalWib(new Date());
	function bacaIsian() {
		try {
			const t = JSON.parse(localStorage.getItem(KUNCI) ?? '{}') as { tanggal?: string; isian?: Isian };
			isian = t.tanggal === hariIni ? (t.isian ?? {}) : {};
		} catch {
			isian = {};
		}
	}
	function simpanIsian() {
		try {
			localStorage.setItem(KUNCI, JSON.stringify({ tanggal: hariIni, isian }));
		} catch {
			// penyimpanan peramban tidak tersedia: isian hanya hilang saat halaman ditutup
		}
	}
	let nomor = 0;
	async function muat() {
		hari = Math.min(60, Math.max(1, Math.round(Number(hari) || 7)));
		const ini = ++nomor;
		memuat = true;
		try {
			const r = await muatRencana(hari);
			if (ini === nomor) (rencana = r), (galat = '');
		} catch (e) {
			if (ini === nomor) galat = (e as Error).message;
		} finally {
			if (ini === nomor) memuat = false;
		}
	}
	onMount(() => {
		bacaIsian();
		void muat();
	});

	/** Kosong = kembali ke saran; selain bilangan bulat ≥ 0 ditolak (mis. "1,5" bukan 15). */
	function ubah(satuan: string, outlet: string, el: HTMLInputElement) {
		const teks = el.value.trim();
		const k = kunciSel(satuan, outlet);
		const salin = { ...isian };
		if (teks === '') delete salin[k];
		else if (/^\d{1,6}$/.test(teks)) salin[k] = Number(teks);
		isian = salin;
		simpanIsian();
		el.value = String(isian[k] ?? rencana?.barang.find((b) => b.satuan_beli_id === satuan)?.per_outlet[outlet]?.saran ?? 0);
	}
	function aturUlang() {
		isian = {};
		simpanIsian();
	}
	const s = $derived(rencana ? ringkas(rencana, isian) : null);
	const angka = (n: number | null) => (n === null ? '-' : n.toLocaleString('id-ID', { maximumFractionDigits: 1 }));
	const kotak = 'min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm';
</script>

<svelte:head><title>Belanja · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Rencana belanja <Petunjuk topik="belanja" peran="admin" /></h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Saran beli tiap outlet = pemakaian rata-rata 7 hari terakhir × jumlah hari − stok sekarang, dibulatkan ke atas per pack/karung. Tepung, minyak & plastik
	merah dihitung dari rata-rata pembelian 4 minggu (stoknya tidak tercatat otomatis). Ubah angka bila hitungan kasir berbeda; isian tersimpan di perangkat
	ini sampai hari berganti.
</p>

<div class="tanpa-cetak mt-3 flex flex-wrap items-end gap-2">
	<label class="grid gap-1 text-xs font-semibold">
		Untuk berapa hari
		<input type="number" min="1" max="60" class="{kotak} w-24" bind:value={hari} onchange={muat} />
	</label>
	<button type="button" class="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold" disabled={memuat} onclick={muat}>Hitung ulang</button>
	<button type="button" class="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold" onclick={aturUlang}>Kembalikan ke saran</button>
</div>

{#if galat}<p class="mt-3 text-danger" role="alert">{galat}</p>{/if}

{#if rencana && s}
	<div class="mt-4 overflow-x-auto">
		<table class="w-full min-w-[42rem] text-sm">
			<thead class="text-left text-xs text-muted">
				<tr>
					<th class="py-1 pr-2">Barang</th>
					<th class="py-1 pr-2 text-right">Total pesanan</th>
					{#each rencana.outlet as o (o.id)}<th class="py-1 pr-2 text-right">{o.nama}</th>{/each}
					<th class="py-1 pr-2 text-right">Harga satuan</th>
					<th class="py-1 text-right">Harga total</th>
				</tr>
			</thead>
			<tbody>
				{#each s.barang as x (x.b.satuan_beli_id)}
					<tr class="border-t border-line align-top">
						<td class="py-1.5 pr-2 font-semibold">{x.nama}</td>
						<td class="tabular py-1.5 pr-2 text-right font-bold">{x.total}</td>
						{#each rencana.outlet as o (o.id)}
							{@const p = x.b.per_outlet[o.id]}
							<td class="py-1 pr-2 text-right">
								<input
									aria-label="{x.nama} {o.nama}"
									inputmode="numeric"
									class="tabular min-h-10 w-16 rounded-lg border px-2 text-right {isian[kunciSel(x.b.satuan_beli_id, o.id)] !== undefined ? 'border-brand' : 'border-line-strong'} bg-surface"
									value={isian[kunciSel(x.b.satuan_beli_id, o.id)] ?? p?.saran ?? 0}
									onchange={(e) => ubah(x.b.satuan_beli_id, o.id, e.currentTarget)}
								/>
								{#if p}
									<span class="block text-[11px] text-muted">
										{p.dari_beli ? `beli ±${angka(p.pakai_hari * 7)}/mgg` : `stok ${angka(p.stok)} · ${angka(p.pakai_hari)}/hr`}
									</span>
								{/if}
							</td>
						{/each}
						<td class="tabular py-1.5 pr-2 text-right">{x.harga === null ? '-' : `Rp${formatAngka(x.harga)}`}</td>
						<td class="tabular py-1.5 text-right">{x.nilai === null ? '-' : `Rp${formatAngka(x.nilai)}`}</td>
					</tr>
				{/each}
				<tr class="border-t-2 border-line-strong font-bold">
					<td class="py-2" colspan={rencana.outlet.length + 3}>Jumlah</td>
					<td class="tabular py-2 text-right">Rp{formatAngka(s.totalNilai)}</td>
				</tr>
			</tbody>
		</table>
	</div>
	{#if s.adaTanpaHarga}<p class="mt-1 text-xs text-warn">Sebagian barang belum punya harga — isi di Admin → Harga Beli.</p>{/if}

	<div class="mt-4 flex flex-wrap items-center gap-2">
		<TombolBagikan jenis="belanja" teks={() => teksBelanja(s, new Date())} />
		<TombolEkspor judul="Belanja stokis" lembar={() => [lembarBelanja(rencana!, s)]} cetak />
	</div>
	<details class="tanpa-cetak mt-3">
		<summary class="cursor-pointer text-sm font-semibold text-muted">Lihat teks yang akan dibagikan</summary>
		<pre class="mt-2 rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-wrap">{teksBelanja(s, new Date())}</pre>
	</details>
{:else if memuat}
	<p class="mt-4 text-muted" role="status">Menghitung…</p>
{/if}
