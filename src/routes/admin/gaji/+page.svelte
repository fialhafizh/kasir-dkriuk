<script lang="ts">
	import Petunjuk from '#lib/components/bantuan/Petunjuk.svelte';
	import { onMount } from 'svelte';
	import DaftarKaryawan from '#lib/components/gaji/DaftarKaryawan.svelte';
	import Gajian from '#lib/components/gaji/Gajian.svelte';
	import KasbonAdmin from '#lib/components/gaji/KasbonAdmin.svelte';
	import KehadiranGrid from '#lib/components/gaji/KehadiranGrid.svelte';
	import RingkasanGaji from '#lib/components/gaji/RingkasanGaji.svelte';
	import { hitungGaji, muatKaryawan, muatKehadiran, type Karyawan, type RekapGaji } from '#lib/kas/gaji.ts';
	import { tanggalWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import type { Outlet } from '#lib/types/db.ts';

	const hariIni = tanggalWib(new Date());
	let outlets = $state<Outlet[]>([]);
	let outletId = $state('');
	let bulan = $state(hariIni.slice(0, 7));
	let karyawan = $state<Karyawan[]>([]);
	let rekap = $state<RekapGaji[]>([]);
	let hadir = $state<Set<string>>(new Set());
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let gen = 0;

	async function muat() {
		if (!outletId || !bulan) return;
		const g = ++gen;
		try {
			const [k, r, h] = await Promise.all([muatKaryawan(), hitungGaji(outletId, bulan), muatKehadiran(outletId, bulan)]);
			if (g !== gen) return;
			karyawan = k;
			rekap = r;
			hadir = h;
			status = 'siap';
		} catch (e) {
			if (g !== gen) return;
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}

	onMount(async () => {
		try {
			outlets = await muatOutlets();
			outletId = outlets.find((o) => o.aktif)?.id ?? outlets[0]?.id ?? '';
			if (!outletId) {
				pesan = 'Belum ada outlet.';
				status = 'gagal';
			}
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	});
	$effect(() => {
		void outletId;
		void bulan;
		void muat();
	});
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<svelte:head><title>Gaji · Admin D'Kriuk</title></svelte:head>

<div class="flex items-center gap-2"><h1 class="font-display text-3xl">Gaji</h1><Petunjuk topik="gaji" peran="admin" /></div>
<div class="mt-4 flex flex-wrap items-end gap-3">
	<div class="grid gap-1.5">
		<label for="outlet" class="text-sm font-semibold">Outlet</label>
		<select id="outlet" bind:value={outletId} class={kotak}>{#each outlets as o (o.id)}<option value={o.id}>{o.nama}</option>{/each}</select>
	</div>
	<div class="grid gap-1.5">
		<label for="bulan" class="text-sm font-semibold">Bulan</label>
		<input id="bulan" type="month" bind:value={bulan} max={hariIni.slice(0, 7)} class={kotak} />
	</div>
</div>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	<div class="mt-6 grid gap-8">
		<KehadiranGrid {bulan} {rekap} {hadir} {hariIni} onubah={muat} />
		{#key `${outletId}|${bulan}`}<Gajian {bulan} {rekap} onubah={muat} />{/key}
		{#key outletId}<KasbonAdmin {outletId} {rekap} {hariIni} onubah={muat} />{/key}
		<DaftarKaryawan {outletId} {karyawan} onubah={muat} />
		<RingkasanGaji {outlets} {outletId} {bulan} {rekap} />
	</div>
{/if}
