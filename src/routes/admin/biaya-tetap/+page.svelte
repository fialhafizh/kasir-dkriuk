<script lang="ts">
	import { onMount } from 'svelte';
	import { berlakuPada, muatBiayaTetap, simpanBiayaTetap, type BiayaTetap } from '#lib/kas/laporan.ts';
	import { tanggalWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	const hariIni = tanggalWib(new Date());
	let outlets = $state<Outlet[]>([]);
	let daftar = $state<BiayaTetap[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let fOutlet = $state('');
	let fNama = $state('Sewa');
	let fNominal = $state('');
	let fMulai = $state(hariIni);
	let pesanForm = $state('');

	async function muat() {
		try {
			[outlets, daftar] = await Promise.all([muatOutlets(), muatBiayaTetap()]);
			fOutlet ||= outlets[0]?.id ?? '';
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const berlaku = $derived(berlakuPada(daftar, hariIni));
	const namaOutlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '-';

	async function simpan(e: SubmitEvent) {
		e.preventDefault();
		pesanForm = '';
		const n = parseRupiah(fNominal, 2_000_000_000);
		if (n === null) return void (pesanForm = 'Isi nominal per tahun, mis. 30.000.000 (isi 0 bila sewa berhenti).');
		try {
			await simpanBiayaTetap({ outlet_id: fOutlet, nama: fNama, per_tahun: n, mulai: fMulai });
			fNominal = '';
			await muat();
		} catch (err) {
			pesanForm = (err as Error).message;
		}
	}
	async function hapus(b: BiayaTetap) {
		try {
			await simpanBiayaTetap({ id: b.id, aktif: false });
			await muat();
		} catch (err) {
			pesan = (err as Error).message;
		}
	}
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<svelte:head><title>Biaya Tetap · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Biaya tetap</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Sewa per outlet (nominal setahun). Di laba-rugi dibagi rata per hari (setahun ÷ 365). Bila harga sewa berubah, tambahkan baris baru dengan
	tanggal mulai berlakunya; bila sewa berhenti, tambahkan baris nominal 0. Pembayaran sewa yang sebenarnya dicatat di Pengeluaran
	(kategori Sewa) dan tidak dihitung dua kali di laba-rugi.
</p>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	<h2 class="mt-6 font-display text-2xl">Berlaku sekarang</h2>
	{#if berlaku.length === 0}
		<p class="mt-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada biaya tetap.</p>
	{:else}
		<ul class="mt-2 grid gap-2 sm:grid-cols-3">
			{#each berlaku as b (b.id)}
				<li class="rounded-2xl bg-surface-2 p-3">
					<p class="text-sm text-muted">{namaOutlet(b.outlet_id)} · {b.nama}</p>
					<p class="tabular font-bold">Rp{formatAngka(b.per_tahun)}/tahun</p>
					<p class="text-xs text-muted">≈ Rp{formatAngka(Math.round(b.per_tahun / 12))}/bulan · sejak {b.mulai}</p>
				</li>
			{/each}
		</ul>
	{/if}

	<form class="mt-6 grid max-w-2xl gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2" onsubmit={simpan} novalidate>
		<h2 class="font-display text-xl sm:col-span-2">Tambah / ubah nominal</h2>
		<div class="grid gap-1.5">
			<label for="bt-outlet" class="text-sm font-semibold">Outlet</label>
			<select id="bt-outlet" bind:value={fOutlet} class={kotak}>{#each outlets as o (o.id)}<option value={o.id}>{o.nama}</option>{/each}</select>
		</div>
		<div class="grid gap-1.5">
			<label for="bt-nama" class="text-sm font-semibold">Nama</label>
			<input id="bt-nama" bind:value={fNama} maxlength="40" class={kotak} />
		</div>
		<div class="grid gap-1.5">
			<label for="bt-nominal" class="text-sm font-semibold">Nominal per tahun</label>
			<input id="bt-nominal" bind:value={fNominal} inputmode="numeric" class="tabular text-right {kotak}" />
		</div>
		<div class="grid gap-1.5">
			<label for="bt-mulai" class="text-sm font-semibold">Mulai berlaku</label>
			<input id="bt-mulai" type="date" bind:value={fMulai} class={kotak} />
		</div>
		{#if pesanForm}<p class="text-sm text-danger sm:col-span-2" role="alert">{pesanForm}</p>{/if}
		<div class="sm:col-span-2"><button type="submit" class="min-h-12 rounded-xl bg-brand px-4 font-semibold text-on-brand">Simpan</button></div>
	</form>

	<h2 class="mt-6 font-display text-2xl">Riwayat</h2>
	<ul class="mt-2 grid gap-2">
		{#each daftar as b (b.id)}
			<li class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3 {b.aktif ? '' : 'opacity-60'}">
				<span>{namaOutlet(b.outlet_id)} · {b.nama} · Rp{formatAngka(b.per_tahun)}/tahun · mulai {b.mulai}{b.aktif ? '' : ' (dihapus)'}</span>
				{#if b.aktif}<button type="button" class="min-h-12 rounded-xl bg-surface-2 px-3 text-sm" onclick={() => hapus(b)}>Hapus (salah input)</button>{/if}
			</li>
		{/each}
	</ul>
{/if}
