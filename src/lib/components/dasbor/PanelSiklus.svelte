<script lang="ts">
	// Siklus stok satu baris stok di satu outlet: lini waktu saldo, berapa lama sekali habis, perkiraan habis.
	import { muatSiklus, type Siklus } from '#lib/dasbor/api.ts';
	import type { Rentang } from '#lib/dasbor/periode.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatDataStok } from '#lib/stok/api.ts';
	import { susunStok } from '#lib/stok/tampil.ts';
	import type { Outlet } from '#lib/types/db.ts';
	import GrafikGaris from './GrafikGaris.svelte';

	let { outlets, outlet, kunci, rentang, segar }: { outlets: Outlet[]; outlet: string | null; kunci: string | null; rentang: Rentang; segar: number } =
		$props();
	let pilihOutlet = $state('');
	let pilihKunci = $state('');
	let pilihan = $state<{ kunci: string; label: string }[]>([]);
	let data = $state<Siklus | null>(null);
	let galat = $state('');

	const o = $derived(outlet ?? (pilihOutlet || outlets.find((x) => x.aktif)?.id || ''));
	const k = $derived(kunci ?? pilihKunci);

	$effect(() => {
		void muatDataStok()
			.then((d) => {
				pilihan = susunStok(d.bahan, d.satuan, d.isi, new Map()).map((b) => ({ kunci: b.kunci, label: b.label }));
				if (!pilihKunci && pilihan.length) pilihKunci = pilihan[0].kunci;
			})
			.catch((e) => (galat = (e as Error).message));
	});
	$effect(() => {
		void segar;
		if (!o || !k) return;
		muatSiklus(o, k, rentang)
			.then((s) => ((data = s), (galat = '')))
			.catch((e) => (galat = (e as Error).message));
	});

	const angka = (n: number | null | undefined) => (n ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
	const hari = (jam: number) => (jam >= 48 ? `${angka(jam / 24)} hari` : `${angka(jam)} jam`);
	const rataBertahan = $derived(data?.bertahan_jam.length ? data.bertahan_jam.reduce((a, b) => a + b, 0) / data.bertahan_jam.length : null);
	const kotak = 'min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-sm';
</script>

<div class="flex h-full flex-col gap-2">
	<div class="flex flex-wrap gap-2">
		{#if !outlet}
			<select aria-label="Outlet" bind:value={pilihOutlet} class={kotak}>
				{#each outlets.filter((x) => x.aktif) as x (x.id)}<option value={x.id}>{x.nama}</option>{/each}
			</select>
		{/if}
		{#if !kunci}
			<select aria-label="Bahan" bind:value={pilihKunci} class={kotak}>
				{#each pilihan as p (p.kunci)}<option value={p.kunci}>{p.label}</option>{/each}
			</select>
		{/if}
	</div>
	{#if galat}
		<p class="text-sm text-danger" role="alert">{galat}</p>
	{:else if data}
		<dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
			<div><dt class="text-xs text-muted">Stok sekarang</dt><dd class="tabular font-semibold">{angka(data.saldo_sekarang)} {data.satuan}</dd></div>
			<div><dt class="text-xs text-muted">Pemakaian/hari (7 hari)</dt><dd class="tabular font-semibold">{angka(data.pakai_per_hari)} {data.satuan}</dd></div>
			<div>
				<dt class="text-xs text-muted">Perkiraan habis</dt>
				<dd class="font-semibold {data.perkiraan_habis_hari !== null && data.perkiraan_habis_hari < 2 ? 'text-danger' : ''}">
					{data.perkiraan_habis_hari === null ? '-' : `± ${angka(data.perkiraan_habis_hari)} hari lagi`}
				</dd>
			</div>
			<div><dt class="text-xs text-muted">Habis di periode ini</dt><dd class="font-semibold">{data.episode_habis.length} kali</dd></div>
			<div><dt class="text-xs text-muted">Rata-rata bertahan</dt><dd class="font-semibold">{rataBertahan === null ? '-' : hari(rataBertahan)}</dd></div>
			<div><dt class="text-xs text-muted">Jarak barang masuk</dt><dd class="font-semibold">{data.jarak_masuk_jam === null ? '-' : hari(data.jarak_masuk_jam)}</dd></div>
		</dl>
		{#if data.titik.length}
			<div class="min-h-32 flex-1">
				<GrafikGaris
					data={{ kategori: data.titik.map((t) => t.t.slice(data!.ember === 'jam' ? 11 : 8, data!.ember === 'jam' ? 16 : 10)), seri: [{ nama: 'Stok', nilai: data.titik.map((t) => t.akhir) }] }}
					format={(n) => `${angka(n)} ${data!.satuan}`}
				/>
			</div>
		{:else}
			<p class="text-sm text-muted">Tidak ada gerakan stok di periode ini.</p>
		{/if}
		{#if data.episode_habis.length}
			<ul class="text-xs text-muted">
				{#each data.episode_habis as e (e.habis)}
					<li>Habis {formatWaktuWib(e.habis)}{e.pulih ? ` · ada lagi ${formatWaktuWib(e.pulih)}` : ' · belum ada lagi'}</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
