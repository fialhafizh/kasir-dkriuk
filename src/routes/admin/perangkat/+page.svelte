<script lang="ts">
	import { muatDiabaikan, muatNamaPengguna, muatPerangkat, ringkasData, statusSinkron, type Diabaikan, type Perangkat } from '#lib/admin/perangkat.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { labelKejadian } from '#lib/offline/label.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let perangkat = $state<Perangkat[]>([]);
	let diabaikan = $state<Diabaikan[]>([]);
	let outlets = $state<Outlet[]>([]);
	let nama = $state<Map<string, string>>(new Map());
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');

	async function muat() {
		status = 'memuat';
		try {
			[perangkat, diabaikan, outlets, nama] = await Promise.all([muatPerangkat(), muatDiabaikan(), muatOutlets(), muatNamaPengguna()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	$effect(() => {
		void muat();
	});

	const sekarang = new Date();
	const namaOutlet = (id: string | null) => outlets.find((o) => o.id === id)?.nama ?? '-';
	const namaOrang = (id: string | null) => (id ? (nama.get(id) ?? '-') : '-');
	const kodePerangkat = (id: string | null) => {
		const p = perangkat.find((x) => x.id === id);
		return p ? `#${p.kode}` : '-';
	};
	const LABEL_STATUS = { baru: 'Baru sinkron', lama: 'Lama tidak sinkron', belum: 'Belum pernah sinkron' } as const;
</script>

<svelte:head><title>Perangkat · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Perangkat kasir</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	HP/tablet yang pernah dipakai jualan. Kode perangkat muncul di nomor struk sementara (mis. S3-012 = perangkat #3). Perangkat yang lebih
	dari 24 jam tidak sinkron mungkin masih menyimpan data yang belum terkirim.
</p>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#if perangkat.length === 0}
		<p class="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada perangkat terdaftar.</p>
	{:else}
		<ul class="mt-4 grid gap-2">
			{#each perangkat as p (p.id)}
				{@const s = statusSinkron(p.terakhir_sinkron, sekarang)}
				<li class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-surface p-3 {s === 'baru' ? 'border-line' : 'border-warn'}">
					<div class="min-w-0">
						<p class="font-semibold">Perangkat #{p.kode} · {namaOutlet(p.outlet_id)}</p>
						<p class="text-sm text-muted">Terakhir dipakai {namaOrang(p.terakhir_oleh)}</p>
					</div>
					<div class="text-right text-sm">
						<p class="font-semibold {s === 'baru' ? 'text-ok' : 'text-warn'}">{LABEL_STATUS[s]}</p>
						{#if p.terakhir_sinkron}<p class="text-muted">{formatWaktuWib(p.terakhir_sinkron)} WIB</p>{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<h2 class="mt-8 font-display text-2xl">Kejadian diabaikan kasir</h2>
	<p class="mt-1 max-w-prose text-sm text-muted">
		Data yang ditolak server lalu diabaikan kasir dengan alasan. Data ini tidak tercatat di penjualan/stok; periksa bila perlu dicatat ulang.
	</p>
	{#if diabaikan.length === 0}
		<p class="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada.</p>
	{:else}
		<ul class="mt-4 grid gap-2">
			{#each diabaikan as d (d.id)}
				<li class="rounded-2xl border border-line bg-surface p-3">
					<p class="flex flex-wrap justify-between gap-2">
						<span class="font-semibold">{labelKejadian(d.jenis)} · {namaOutlet(d.outlet_id)}</span>
						<span class="text-sm text-muted">{formatWaktuWib(d.dibuat_at)} WIB</span>
					</p>
					{#if ringkasData(d.jenis, d.data)}<p class="text-sm text-muted">{ringkasData(d.jenis, d.data)}</p>{/if}
					{#if d.alasan_tolak}<p class="mt-1 text-sm text-danger">Ditolak server: {d.alasan_tolak}</p>{/if}
					<p class="mt-1 text-sm">Diabaikan oleh {namaOrang(d.oleh)} (perangkat {kodePerangkat(d.perangkat_id)}): {d.alasan}</p>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
