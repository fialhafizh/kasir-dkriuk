<script lang="ts">
	import { onMount } from 'svelte';
	import KelolaDasbor from '#lib/components/dasbor/KelolaDasbor.svelte';
	import KisiDasbor from '#lib/components/dasbor/KisiDasbor.svelte';
	import PenyuntingDasbor from '#lib/components/dasbor/PenyuntingDasbor.svelte';
	import SaringanAtas from '#lib/components/dasbor/SaringanAtas.svelte';
	import { muatDaftarDasbor } from '#lib/dasbor/api.ts';
	import type { Dasbor, SaringanDasbor } from '#lib/dasbor/spek.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import type { Outlet } from '#lib/types/db.ts';

	const KUNCI = 'dasbor:dipilih';
	let daftar = $state<Dasbor[]>([]);
	let outlets = $state<Outlet[]>([]);
	let dipilih = $state('');
	let saringan = $state<SaringanDasbor>({ outlet_id: null, periode: 'hari_ini' });
	let mode = $state<'lihat' | 'sunting' | 'kelola'>('lihat');
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let segar = $state(0);
	let sekarang = $state(new Date());
	let online = $state(true);

	const aktif = $derived(daftar.find((d) => d.id === dipilih));

	function pilih(id: string) {
		dipilih = id;
		const d = daftar.find((x) => x.id === id);
		if (d) saringan = { ...d.saringan };
		try {
			localStorage.setItem(KUNCI, id);
		} catch {
			// penyimpanan peramban tidak tersedia: tidak apa-apa
		}
	}

	async function muat(buka?: string) {
		try {
			[daftar, outlets] = await Promise.all([muatDaftarDasbor(), outlets.length ? Promise.resolve(outlets) : muatOutlets()]);
			let tersimpan: string | null = null;
			try {
				tersimpan = localStorage.getItem(KUNCI);
			} catch {
				// abaikan
			}
			const id = [buka, dipilih, tersimpan, daftar.find((d) => d.utama)?.id, daftar[0]?.id].find((x) => x && daftar.some((d) => d.id === x));
			if (id) pilih(id);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}

	function muatUlang() {
		sekarang = new Date();
		segar++;
	}

	onMount(() => {
		void muat();
		online = navigator.onLine;
		const ubahOnline = () => (online = navigator.onLine);
		const terlihat = () => document.visibilityState === 'visible' && muatUlang();
		const jam = setInterval(() => {
			if (document.visibilityState === 'visible' && mode !== 'sunting') muatUlang();
		}, 60_000);
		addEventListener('online', ubahOnline);
		addEventListener('offline', ubahOnline);
		document.addEventListener('visibilitychange', terlihat);
		return () => {
			clearInterval(jam);
			removeEventListener('online', ubahOnline);
			removeEventListener('offline', ubahOnline);
			document.removeEventListener('visibilitychange', terlihat);
		};
	});

	const jamDiperbarui = $derived(sekarang.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }));
	const tombol = 'min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-60';

	async function selesaiSunting(id?: string) {
		mode = 'lihat';
		await muat(id);
		muatUlang();
	}
</script>

<svelte:head><title>Dasbor · Admin D'Kriuk</title></svelte:head>

{#if status === 'memuat'}
	<p class="text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 {tombol} bg-surface-2" onclick={() => muat()}>Coba lagi</button>
{:else if mode === 'sunting' && aktif}
	<PenyuntingDasbor dasbor={aktif} {saringan} {outlets} onselesai={selesaiSunting} />
{:else}
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex min-w-0 flex-wrap gap-1" role="tablist" aria-label="Pilih dasbor">
			{#each daftar as d (d.id)}
				<button
					type="button"
					role="tab"
					aria-selected={d.id === dipilih}
					class="min-h-11 rounded-xl px-3 text-sm font-semibold aria-selected:bg-brand aria-selected:text-on-brand {d.id === dipilih ? '' : 'bg-surface-2'}"
					onclick={() => pilih(d.id)}>{d.nama}</button
				>
			{/each}
		</div>
		<div class="flex flex-wrap gap-2">
			<button type="button" class="{tombol} bg-surface-2" onclick={() => (mode = mode === 'kelola' ? 'lihat' : 'kelola')} aria-pressed={mode === 'kelola'}>
				Kelola dasbor
			</button>
			<button type="button" class="{tombol} bg-brand text-on-brand" disabled={!aktif || !online} onclick={() => (mode = 'sunting')}>Ubah dasbor</button>
		</div>
	</div>

	{#if mode === 'kelola'}
		<KelolaDasbor {daftar} {dipilih} onubah={muat} />
	{/if}

	<div class="mt-3 flex flex-wrap items-end justify-between gap-2">
		<SaringanAtas bind:saringan {outlets} />
		<div class="flex items-center gap-2 text-xs text-muted">
			{#if !online}<span class="font-semibold text-warn">Offline · menampilkan angka terakhir</span>{/if}
			<span>Diperbarui {jamDiperbarui}</span>
			<button type="button" class="{tombol} bg-surface-2" onclick={muatUlang}>Muat ulang</button>
		</div>
	</div>

	{#if aktif}
		<KisiDasbor panel={aktif.panel} {saringan} {outlets} {sekarang} {segar} />
	{/if}
{/if}
