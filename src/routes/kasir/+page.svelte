<script lang="ts">
	import { auth } from '#lib/auth/session.svelte.ts';
	import BayarPanel from '#lib/components/kasir/BayarPanel.svelte';
	import Keranjang from '#lib/components/kasir/Keranjang.svelte';
	import MenuGrid from '#lib/components/kasir/MenuGrid.svelte';
	import ModalShift from '#lib/components/kasir/ModalShift.svelte';
	import PrinterChip from '#lib/components/kasir/PrinterChip.svelte';
	import Selesai from '#lib/components/kasir/Selesai.svelte';
	import { catatPenjualan, muatMenuOutlet } from '#lib/kasir/api.ts';
	import { dataStrukDari } from '#lib/kasir/cetak.ts';
	import { tambah, tambahNasiBox, totalKeranjang, ubahQty } from '#lib/kasir/keranjang.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import type { DataStruk } from '#lib/kasir/struk.ts';
	import type { BarisKeranjang, MenuJual, Metode } from '#lib/kasir/types.ts';
	import { shiftKedaluwarsa } from '#lib/kasir/waktu.ts';
	import { href } from '#lib/nav.ts';

	let menu = $state<MenuJual[]>([]);
	let keranjang = $state<BarisKeranjang[]>([]);
	let tahap = $state<'pilih' | 'bayar' | 'selesai'>('pilih');
	let struk = $state<DataStruk | null>(null);
	let pesanMenu = $state('');
	// ID transaksi dibuat sekali per keranjang: tekan Bayar dua kali / kirim ulang tidak menggandakan.
	let idTransaksi = $state(crypto.randomUUID());

	$effect(() => {
		const o = pos.outlet;
		if (!o) return;
		pesanMenu = '';
		muatMenuOutlet(o.id)
			.then((m) => (menu = m))
			.catch((e) => (pesanMenu = (e as Error).message));
	});

	const kedaluwarsa = $derived(pos.shift ? shiftKedaluwarsa(pos.shift.dibuka_at, new Date()) : false);
	const nasi = $derived(menu.find((m) => m.kode === 'nasi'));
	const box = $derived(menu.find((m) => m.kode === 'box'));

	async function bayar(metode: Metode, diterima: number | null) {
		const o = pos.outlet!;
		const kirim = $state.snapshot(keranjang);
		const hasil = await catatPenjualan({
			id: idTransaksi,
			outlet_id: o.id,
			metode,
			...(diterima !== null ? { diterima } : {}),
			// waktu tidak dikirim: server memakai jamnya sendiri (jam tablet bisa salah).
			item: kirim.map((b) => ({ menu_id: b.menu_id, qty: b.qty }))
		});
		struk = dataStrukDari({ outlet: o, kasir: auth.profile?.nama_tampilan ?? '', hasil, keranjang: kirim, metode, diterima });
		tahap = 'selesai';
	}

	function baru() {
		keranjang = [];
		struk = null;
		idTransaksi = crypto.randomUUID();
		tahap = 'pilih';
	}
</script>

<svelte:head><title>Jualan · Kasir D'Kriuk</title></svelte:head>

{#if pos.status === 'memuat' && !pos.shift}
	<p class="text-muted" role="status">Memuat…</p>
{:else if pos.status === 'gagal'}
	<p class="text-danger" role="alert">{pos.pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => pos.muatShift()}>Coba lagi</button>
{:else if !pos.shift}
	<ModalShift outlet={pos.outlet!} onbuka={() => pos.muatShift()} />
{:else if kedaluwarsa}
	<div class="mx-auto max-w-md rounded-2xl border-2 border-warn bg-surface p-5" role="alert">
		<p class="font-semibold">Toko kemarin belum ditutup.</p>
		<p class="mt-1 text-sm text-muted">Hitung uang di laci dan tutup toko dulu sebelum jualan hari ini.</p>
		<a href={href('/kasir/tutup')} class="mt-3 inline-flex min-h-12 items-center rounded-xl bg-brand px-4 font-semibold text-on-brand"
			>Tutup toko</a
		>
	</div>
{:else if tahap === 'selesai' && struk}
	<Selesai data={struk} onbaru={baru} />
{:else}
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h1 class="font-display text-2xl">{pos.outlet?.merek} {pos.outlet?.nama}</h1>
		<PrinterChip />
	</div>
	{#if pesanMenu}<p class="mb-3 text-danger" role="alert">{pesanMenu}</p>{/if}
	<div class="grid gap-4 lg:grid-cols-[1fr_22rem]">
		<MenuGrid
			{menu}
			ontambah={(m) => (keranjang = tambah(keranjang, m))}
			onnasibox={() => nasi && box && (keranjang = tambahNasiBox(keranjang, nasi, box))}
		/>
		<aside class="grid content-start gap-3 lg:sticky lg:top-20">
			{#if tahap === 'bayar'}
				<BayarPanel total={totalKeranjang(keranjang)} onbayar={bayar} onbatal={() => (tahap = 'pilih')} />
			{:else}
				<Keranjang isi={keranjang} onubah={(id, q) => (keranjang = ubahQty(keranjang, id, q))} onkosongkan={() => (keranjang = [])} />
				<button
					type="button"
					disabled={keranjang.length === 0}
					onclick={() => (tahap = 'bayar')}
					class="min-h-16 rounded-2xl bg-brand text-xl font-bold text-on-brand disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
				>
					Bayar
				</button>
			{/if}
		</aside>
	</div>
{/if}
