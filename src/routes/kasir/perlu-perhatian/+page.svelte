<script lang="ts">
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { cobaLagi } from '#lib/offline/antrean.ts';
	import type { Kejadian } from '#lib/offline/db.ts';
	import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';

	const LABEL: Record<Kejadian['jenis'], string> = {
		buka_shift: 'Buka toko',
		jual: 'Jualan',
		tutup_shift: 'Tutup toko',
		rusak: 'Rusak/sisa'
	};

	let daftar = $state<Kejadian[]>([]);

	async function muat() {
		daftar = await dbKasir.kejadian.where('status').equals('ditolak').sortBy('urut');
	}
	$effect(() => {
		void sinkron.ditolak;
		void muat();
	});

	async function ulang(k: Kejadian) {
		await cobaLagi(dbKasir, k.id);
		await sinkron.jalankan();
		await muat();
	}

	const ringkas = (k: Kejadian) => {
		const d = k.data as { kode_struk?: string; nomor_sementara?: string; total?: number; modal?: number; uang_fisik?: number };
		if (k.jenis === 'jual') return [d.nomor_sementara, d.kode_struk && `kode ${d.kode_struk}`, d.total !== undefined && `Rp${d.total}`].filter(Boolean).join(' · ');
		if (k.jenis === 'buka_shift') return `modal Rp${d.modal ?? 0}`;
		if (k.jenis === 'tutup_shift') return `uang laci Rp${d.uang_fisik ?? 0}`;
		return '';
	};
</script>

<svelte:head><title>Perlu Perhatian · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Perlu perhatian</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Data di bawah ditolak server saat sinkron. Datanya tetap tersimpan di perangkat ini. Perbaiki penyebabnya (mis. tutup toko kemarin
	dulu), lalu tekan Coba lagi. Bila bingung, hubungi admin.
</p>

{#if daftar.length === 0}
	<p class="mt-6 rounded-xl bg-surface-2 p-4 text-sm text-muted">Tidak ada yang perlu diperhatikan.</p>
{:else}
	<ul class="mt-4 grid gap-2">
		{#each daftar as k (k.id)}
			<li class="rounded-2xl border-2 border-danger bg-surface p-3">
				<p class="flex flex-wrap justify-between gap-2">
					<span class="font-semibold">{LABEL[k.jenis]}</span>
					<span class="text-sm text-muted">{formatWaktuWib(k.waktu)}</span>
				</p>
				{#if ringkas(k)}<p class="text-sm text-muted">{ringkas(k)}</p>{/if}
				<p class="mt-1 text-sm font-semibold text-danger">{k.alasan}</p>
				<button type="button" class="mt-2 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ulang(k)}>Coba lagi</button>
			</li>
		{/each}
	</ul>
{/if}
