<script lang="ts">
	import { untrack } from 'svelte';
	import { auth } from '#lib/auth/session.svelte.ts';
	import BayarPanel from '#lib/components/kasir/BayarPanel.svelte';
	import Keranjang from '#lib/components/kasir/Keranjang.svelte';
	import MenuGrid from '#lib/components/kasir/MenuGrid.svelte';
	import ModalShift from '#lib/components/kasir/ModalShift.svelte';
	import PrinterChip from '#lib/components/kasir/PrinterChip.svelte';
	import Selesai from '#lib/components/kasir/Selesai.svelte';
	import { catatPenjualan, muatMenuOutlet, muatPenjualan } from '#lib/kasir/api.ts';
	import { dataStrukDari, dataStrukRiwayat } from '#lib/kasir/cetak.ts';
	import { tambah, tambahNasiBox, totalKeranjang, ubahQty } from '#lib/kasir/keranjang.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import type { DataStruk } from '#lib/kasir/struk.ts';
	import type { BarisKeranjang, MenuJual, Metode } from '#lib/kasir/types.ts';
	import { Transaksi } from '#lib/kasir/transaksi.ts';
	import { shiftKedaluwarsa } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import { href } from '#lib/nav.ts';

	let menu = $state<MenuJual[]>([]);
	let keranjang = $state<BarisKeranjang[]>([]);
	let tahap = $state<'pilih' | 'bayar' | 'selesai'>('pilih');
	let struk = $state<DataStruk | null>(null);
	let peringatan = $state('');
	let pesanMenu = $state('');
	let muatUlang = $state(0);
	// Satu id per keranjang: tekan Bayar dua kali / kirim ulang tidak menggandakan (lihat transaksi.ts).
	const transaksi = new Transaksi();
	const api = { catat: catatPenjualan, muat: muatPenjualan };
	// Pesan server yang berarti shift di perangkat ini sudah tidak berlaku (ditutup di tablet lain).
	const SHIFT_BERUBAH = /Shift belum dibuka|Shift sudah ditutup/;
	let outletTerakhir: string | undefined;

	// Ganti outlet → keranjang dikosongkan (harga & menu berbeda per outlet).
	$effect(() => {
		const id = pos.outlet?.id;
		untrack(() => {
			if (id !== outletTerakhir) {
				outletTerakhir = id;
				keranjang = [];
				menu = [];
				tahap = 'pilih';
				transaksi.reset();
			}
		});
	});

	// Muat menu outlet; hasil untuk outlet lama yang telat datang diabaikan. Muat lagi saat internet kembali.
	$effect(() => {
		const o = pos.outlet;
		void muatUlang;
		if (!o || auth.offline) return;
		let batal = false;
		pesanMenu = '';
		muatMenuOutlet(o.id)
			.then((m) => {
				if (!batal) menu = m;
			})
			.catch((e) => {
				if (!batal) pesanMenu = (e as Error).message;
			});
		return () => {
			batal = true;
		};
	});

	const kedaluwarsa = $derived(pos.shift ? shiftKedaluwarsa(pos.shift.dibuka_at, new Date()) : false);
	const nasi = $derived(menu.find((m) => m.kode === 'nasi'));
	const box = $derived(menu.find((m) => m.kode === 'box'));
	const total = $derived(totalKeranjang(keranjang));

	async function bayar(metode: Metode, diterima: number | null) {
		const o = pos.outlet!;
		const kasir = auth.profile?.nama_tampilan ?? '';
		const kirim = $state.snapshot(keranjang);
		peringatan = '';
		try {
			const r = await transaksi.bayar({ outletId: o.id, kirim, metode, diterima }, api);
			// Struk harus sama persis dengan yang tersimpan di server.
			struk = r.tersimpan
				? dataStrukRiwayat(o, kasir, r.tersimpan)
				: dataStrukDari({ outlet: o, kasir, hasil: r.hasil, keranjang: kirim, metode, diterima });
			peringatan = r.peringatan.join(' ');
			if (r.hargaBerubah) muatUlang++;
			tahap = 'selesai';
		} catch (e) {
			if (SHIFT_BERUBAH.test((e as Error).message)) void pos.muatShift();
			throw e;
		}
	}

	function kosongkan() {
		keranjang = [];
		transaksi.reset();
	}

	function baru() {
		keranjang = [];
		struk = null;
		peringatan = '';
		transaksi.reset();
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
	<Selesai data={struk} {peringatan} onbaru={baru} />
{:else}
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h1 class="font-display text-2xl">{pos.outlet?.merek} {pos.outlet?.nama}</h1>
		<PrinterChip />
	</div>
	{#if pesanMenu}
		<div class="mb-3 flex flex-wrap items-center gap-2" role="alert">
			<p class="text-danger">{pesanMenu}</p>
			<button type="button" class="min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => muatUlang++}>Coba lagi</button>
		</div>
	{/if}
	<div class="grid gap-4 pb-20 md:grid-cols-[1fr_20rem] md:pb-0">
		<!-- Menu tidak bisa disentuh saat membayar supaya total tidak berubah diam-diam. -->
		<div inert={tahap === 'bayar'} class={tahap === 'bayar' ? 'opacity-40' : ''}>
			<MenuGrid
				{menu}
				ontambah={(m) => (keranjang = tambah(keranjang, m))}
				onnasibox={() => nasi && box && (keranjang = tambahNasiBox(keranjang, nasi, box))}
			/>
		</div>
		<aside id="pesanan" class="grid content-start gap-3 md:sticky md:top-20 md:max-h-[calc(100dvh-6rem)] md:overflow-auto">
			{#if tahap === 'bayar'}
				<BayarPanel {total} offline={auth.offline} onbayar={bayar} onbatal={() => (tahap = 'pilih')} />
			{:else}
				<Keranjang isi={keranjang} onubah={(id, q) => (keranjang = ubahQty(keranjang, id, q))} onkosongkan={kosongkan} />
				<button
					type="button"
					disabled={keranjang.length === 0}
					onclick={() => (tahap = 'bayar')}
					class="hidden min-h-16 rounded-2xl bg-brand text-xl font-bold text-on-brand disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus md:block"
				>
					Bayar
				</button>
			{/if}
		</aside>
	</div>
	{#if tahap === 'pilih' && keranjang.length > 0}
		<!-- HP: total & Bayar selalu terlihat di atas navigasi bawah. -->
		<div style="bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px))" class="fixed inset-x-0 z-10 flex items-center gap-3 border-t border-line bg-surface px-4 py-2 md:hidden">
			<!-- Bukan tautan #: hash router akan membacanya sebagai halaman. -->
			<button
				type="button"
				class="min-h-12 min-w-0 flex-1 text-left text-sm text-muted"
				onclick={() => document.getElementById('pesanan')?.scrollIntoView({ behavior: 'smooth' })}>Lihat pesanan</button
			>
			<span class="tabular font-display text-2xl text-brand">Rp{formatAngka(total)}</span>
			<button type="button" onclick={() => (tahap = 'bayar')} class="min-h-12 rounded-xl bg-brand px-6 text-lg font-bold text-on-brand">
				Bayar
			</button>
		</div>
	{/if}
{/if}
