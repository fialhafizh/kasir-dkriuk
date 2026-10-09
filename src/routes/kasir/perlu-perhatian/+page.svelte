<script lang="ts">
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { abaikan, cobaLagi } from '#lib/offline/antrean.ts';
	import { bacaPerangkat } from '#lib/offline/perangkat.ts';
	import { supabase } from '#lib/supabase/client.ts';
	import type { Kejadian } from '#lib/offline/db.ts';
	import { LABEL_KEJADIAN } from '#lib/offline/label.ts';
	import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';


	let daftar = $state<Kejadian[]>([]);
	let alasan = $state<Record<string, string>>({});
	let pesan = $state<Record<string, string>>({});

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

	// Abaikan hanya saat online: laporan ke server (untuk admin) dulu, baru dihapus dari daftar perangkat.
	async function lewati(k: Kejadian) {
		pesan[k.id] = '';
		const a = (alasan[k.id] ?? '').trim();
		if (a.length < 3) {
			pesan[k.id] = 'Isi alasan (paling sedikit 3 huruf).';
			return;
		}
		const { error } = await supabase.rpc('lapor_kejadian_diabaikan', {
			p: { id: k.id, outlet_id: k.outlet_id, perangkat_id: bacaPerangkat(localStorage).id, jenis: k.jenis, data: k.data, alasan_tolak: k.alasan, alasan: a }
		});
		if (error) {
			pesan[k.id] = 'Gagal melapor ke server. Pastikan online lalu coba lagi.';
			return;
		}
		await abaikan(dbKasir, k.id, a);
		await sinkron.segarkan();
		await muat();
	}

	const ringkas = (k: Kejadian) => {
		const d = k.data as { kode_struk?: string; nomor_sementara?: string; total?: number; modal?: number; uang_fisik?: number; alasan?: string; item?: unknown[]; jumlah?: number };
		if (k.jenis === 'jual') return [d.nomor_sementara, d.kode_struk && `kode ${d.kode_struk}`, d.total !== undefined && `Rp${d.total}`].filter(Boolean).join(' · ');
		if (k.jenis === 'buka_shift') return `modal Rp${d.modal ?? 0}`;
		if (k.jenis === 'tutup_shift') return `uang laci Rp${d.uang_fisik ?? 0}`;
		if (k.jenis === 'batal_jual' || k.jenis === 'batal_transfer') return d.alasan ? `alasan: ${d.alasan}` : '';
		if (k.jenis === 'pengeluaran' || k.jenis === 'setoran') return `Rp${d.jumlah ?? 0}`;
		if (Array.isArray(d.item)) return `${d.item.length} bahan`;
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
					<span class="font-semibold">{LABEL_KEJADIAN[k.jenis]}</span>
					<span class="text-sm text-muted">{formatWaktuWib(k.waktu)}</span>
				</p>
				{#if ringkas(k)}<p class="text-sm text-muted">{ringkas(k)}</p>{/if}
				<p class="mt-1 text-sm font-semibold text-danger">{k.alasan}</p>
				<div class="mt-2 flex flex-wrap items-center gap-2">
					<button type="button" class="min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ulang(k)}>Coba lagi</button>
					<label class="sr-only" for="abaikan-{k.id}">Alasan mengabaikan</label>
					<input id="abaikan-{k.id}" bind:value={alasan[k.id]} maxlength="200" placeholder="Alasan abaikan, mis. transaksi dobel" class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3" />
					<button type="button" class="min-h-12 rounded-xl px-4 font-semibold text-danger disabled:opacity-50" disabled={!sinkron.online} onclick={() => lewati(k)}>Abaikan</button>
				</div>
				{#if !sinkron.online}<p class="mt-1 text-xs text-muted">Abaikan butuh internet (dilaporkan ke admin).</p>{/if}
				{#if pesan[k.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesan[k.id]}</p>{/if}
			</li>
		{/each}
	</ul>
{/if}
