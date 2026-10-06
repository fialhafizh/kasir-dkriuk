<script lang="ts">
	import { onMount } from 'svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { muatNamaPengguna } from '#lib/admin/perangkat.ts';
	import { batalSetoran, terimaSetoran } from '#lib/kas/admin.ts';
	import { muatSetoran, type Setoran } from '#lib/kas/api.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let nama = $state<Map<string, string>>(new Map());
	let menunggu = $state<Setoran[]>([]);
	let riwayat = $state<Setoran[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let jumlah = $state<Record<string, string>>({});
	let catatan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		try {
			const [os, n, m, r] = await Promise.all([muatOutlets(), muatNamaPengguna(), muatSetoran({ belumDiterima: true, batas: 200 }), muatSetoran({ batas: 50 })]);
			outlets = os;
			nama = n;
			menunggu = m;
			riwayat = r.filter((s) => s.diterima_at || s.batal_at);
			for (const s of m) jumlah[s.id] ??= formatAngka(s.jumlah);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const namaOutlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '-';
	const total = $derived(menunggu.reduce((a, s) => a + s.jumlah, 0));

	async function terima(s: Setoran) {
		pesanBaris[s.id] = '';
		const n = parseRupiah(jumlah[s.id] ?? '');
		if (n === null) {
			pesanBaris[s.id] = 'Isi jumlah uang yang kamu terima.';
			return;
		}
		try {
			await terimaSetoran(s.id, n, (catatan[s.id] ?? '').trim() || null);
			await muat();
		} catch (e) {
			pesanBaris[s.id] = (e as Error).message;
		}
	}

	async function batal(s: Setoran) {
		pesanBaris[s.id] = '';
		try {
			await batalSetoran(s.id, catatan[s.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[s.id] = (e as Error).message;
		}
	}
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<svelte:head><title>Setoran · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Setoran</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Setoran yang dicatat kasir (uang laci sudah berkurang). Tekan Terima setelah uang ada di tanganmu. Bila jumlahnya beda, ketik jumlah
	sebenarnya dan catatannya. Batal hanya untuk setoran yang tidak jadi diserahkan (uang kembali di laci).
</p>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	<h2 class="mt-6 font-display text-2xl">Belum diterima {menunggu.length ? `· Rp${formatAngka(total)}` : ''}</h2>
	{#if menunggu.length === 0}
		<p class="mt-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">Semua setoran sudah diterima.</p>
	{:else}
		<ul class="mt-2 grid gap-2">
			{#each menunggu as s (s.id)}
				<li class="rounded-2xl border-2 border-warn bg-surface p-3">
					<p class="flex flex-wrap justify-between gap-2">
						<span class="font-semibold">{namaOutlet(s.outlet_id)} · Rp{formatAngka(s.jumlah)}</span>
						<span class="text-sm text-muted">{formatWaktuWib(s.waktu)} · {s.dicatat_oleh ? (nama.get(s.dicatat_oleh) ?? '-') : '-'}</span>
					</p>
					{#if s.catatan}<p class="text-sm text-muted">{s.catatan}</p>{/if}
					<div class="mt-2 flex flex-wrap items-end gap-2">
						<div class="grid gap-1">
							<label for="jml-{s.id}" class="text-xs font-semibold text-muted">Jumlah diterima</label>
							<input id="jml-{s.id}" bind:value={jumlah[s.id]} inputmode="numeric" class="tabular w-36 text-right {kotak}" />
						</div>
						<div class="grid min-w-0 flex-1 gap-1">
							<label for="cat-{s.id}" class="text-xs font-semibold text-muted">Catatan / alasan batal</label>
							<input id="cat-{s.id}" bind:value={catatan[s.id]} maxlength="200" class={kotak} />
						</div>
						<button type="button" class="min-h-12 rounded-xl bg-brand px-4 font-semibold text-on-brand" onclick={() => terima(s)}>Terima</button>
						<Konfirmasi label="Batal" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(s)} />
					</div>
					{#if pesanBaris[s.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[s.id]}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<h2 class="mt-8 font-display text-2xl">Riwayat</h2>
	{#if riwayat.length === 0}
		<p class="mt-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada.</p>
	{:else}
		<ul class="mt-2 grid gap-2">
			{#each riwayat as s (s.id)}
				{@const beda = s.diterima_at && s.jumlah_diterima !== s.jumlah}
				<li class="rounded-2xl border border-line bg-surface p-3 {s.batal_at ? 'opacity-70' : ''}">
					<p class="flex flex-wrap justify-between gap-2">
						<span class="font-semibold">{namaOutlet(s.outlet_id)} · Rp{formatAngka(s.jumlah)}</span>
						<span class="text-sm text-muted">{formatWaktuWib(s.waktu)}</span>
					</p>
					{#if s.batal_at}
						<p class="text-sm text-danger">Dibatalkan: {s.batal_alasan}</p>
					{:else}
						<p class="text-sm {beda ? 'font-semibold text-danger' : 'text-ok'}">
							Diterima {formatWaktuWib(s.diterima_at!)}{beda ? ` · Rp${formatAngka(s.jumlah_diterima ?? 0)} (selisih Rp${formatAngka((s.jumlah_diterima ?? 0) - s.jumlah)}): ${s.catatan_terima}` : ''}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/if}
