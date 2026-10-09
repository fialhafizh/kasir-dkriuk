<script lang="ts">
	import TombolEkspor from '#lib/components/ekspor/TombolEkspor.svelte';
	import { lembarKas } from '#lib/ekspor/laporan.ts';
	import { onMount } from 'svelte';
	import { kasHarian, mundurHari, ringkasRentang, type HariKas } from '#lib/kas/admin.ts';
	import { labelMetode, METODE } from '#lib/kasir/bayar.ts';
	import { tanggalWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let pilihan = $state('semua');
	const hariIni = tanggalWib(new Date());
	let dari = $state(mundurHari(hariIni, 6));
	let sampai = $state(hariIni);
	let data = $state<{ outlet: Outlet; hari: HariKas[] }[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');

	async function muat() {
		status = 'memuat';
		pesan = '';
		try {
			if (!outlets.length) outlets = await muatOutlets();
			const dipilih = pilihan === 'semua' ? outlets : outlets.filter((o) => o.id === pilihan);
			data = await Promise.all(dipilih.map(async (o) => ({ outlet: o, hari: await kasHarian(o.id, dari, sampai) })));
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const rp = (n: number) => `Rp${formatAngka(n)}`;
	const tglPendek = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<svelte:head><title>Kas Harian · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Kas harian</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Penjualan per kanal, pengeluaran, setoran, dan uang laci per hari. Uang laci hanya berisi cash; QRIS & ojol tidak masuk laci.
</p>

<form class="mt-4 flex flex-wrap items-end gap-3" onsubmit={(e) => (e.preventDefault(), void muat())}>
	<div class="grid gap-1.5">
		<label for="outlet" class="text-sm font-semibold">Outlet</label>
		<select id="outlet" bind:value={pilihan} class={kotak}>
			<option value="semua">Semua outlet</option>
			{#each outlets as o (o.id)}<option value={o.id}>{o.nama}</option>{/each}
		</select>
	</div>
	<div class="grid gap-1.5">
		<label for="dari" class="text-sm font-semibold">Dari</label>
		<input id="dari" type="date" bind:value={dari} max={sampai} class={kotak} />
	</div>
	<div class="grid gap-1.5">
		<label for="sampai" class="text-sm font-semibold">Sampai</label>
		<input id="sampai" type="date" bind:value={sampai} min={dari} max={hariIni} class={kotak} />
	</div>
	<button type="submit" class="min-h-12 rounded-xl bg-brand px-4 font-semibold text-on-brand">Tampilkan</button>
</form>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	{#if data.length}<div class="mt-4"><TombolEkspor judul="Kas harian" cetak lembar={() => [lembarKas(data)]} /></div>{/if}
	{#each data as d (d.outlet.id)}
		{@const r = ringkasRentang(d.hari)}
		<section class="mt-6" aria-label="Kas {d.outlet.nama}">
			<h2 class="font-display text-2xl">{d.outlet.merek} {d.outlet.nama}</h2>
			<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
				<div class="rounded-2xl bg-surface-2 p-3"><p class="text-xs text-muted">Penjualan</p><p class="tabular font-bold">{rp(r.total)}</p></div>
				<div class="rounded-2xl bg-surface-2 p-3"><p class="text-xs text-muted">Pengeluaran (laci + luar + bahan)</p><p class="tabular font-bold">{rp(r.pengeluaranLaci + r.pengeluaranLuar + r.belanjaBahan)}</p></div>
				<div class="rounded-2xl bg-surface-2 p-3"><p class="text-xs text-muted">Setoran</p><p class="tabular font-bold">{rp(r.setoran)}</p></div>
				<div class="rounded-2xl bg-surface-2 p-3">
					<p class="text-xs text-muted">Uang laci akhir · selisih</p>
					<p class="tabular font-bold">{rp(r.saldoAkhir)} · <span class={r.selisih === 0 ? 'text-ok' : 'text-danger'}>{r.selisih > 0 ? '+' : ''}{formatAngka(r.selisih)}</span></p>
				</div>
			</div>
			<div class="mt-3 overflow-x-auto">
				<table class="tabular w-full min-w-[56rem] text-sm">
					<thead>
						<tr class="border-b border-line text-left text-muted">
							<th class="py-2 pr-2 font-semibold">Tanggal</th>
							{#each METODE as m (m.kode)}<th class="px-2 text-right font-semibold">{labelMetode(m.kode)}</th>{/each}
							<th class="px-2 text-right font-semibold">Total</th>
							<th class="px-2 text-right font-semibold">Pengeluaran laci</th>
							<th class="px-2 text-right font-semibold">Luar & bahan</th>
							<th class="px-2 text-right font-semibold">Setoran</th>
							<th class="px-2 text-right font-semibold">Laci awal → akhir</th>
							<th class="pl-2 text-right font-semibold">Selisih</th>
						</tr>
					</thead>
					<tbody>
						{#each d.hari as h (h.tanggal)}
							{@const laci = h.pengeluaran_laci.reduce((a, x) => a + Number(x.jumlah), 0)}
							{@const luar = h.pengeluaran_luar.reduce((a, x) => a + Number(x.jumlah), 0) + h.belanja_bahan}
							<tr class="border-b border-line align-top">
								<td class="py-2 pr-2 whitespace-nowrap">{tglPendek(h.tanggal)}{h.jumlah_batal ? ` · ${h.jumlah_batal} batal` : ''}</td>
								{#each METODE as m (m.kode)}<td class="px-2 text-right">{formatAngka(Number(h.per_metode[m.kode]?.total ?? 0))}</td>{/each}
								<td class="px-2 text-right font-semibold">{formatAngka(h.total)}</td>
								<td class="px-2 text-right" title={h.pengeluaran_laci.map((x) => `${x.kategori} ${formatAngka(Number(x.jumlah))}`).join(', ')}>
									{formatAngka(laci)}
									{#if h.pengeluaran_laci.length}<span class="block text-xs text-muted">{h.pengeluaran_laci.map((x) => x.kategori).join(', ')}</span>{/if}
								</td>
								<td class="px-2 text-right">{formatAngka(luar)}</td>
								<td class="px-2 text-right">{formatAngka(h.setoran)}</td>
								<td class="px-2 text-right whitespace-nowrap">{formatAngka(h.saldo_awal)} → {formatAngka(h.saldo_akhir)}</td>
								<td class="pl-2 text-right {h.selisih === 0 ? '' : 'font-semibold text-danger'}">{h.selisih > 0 ? '+' : ''}{formatAngka(h.selisih)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/each}
{/if}
