<script lang="ts">
	import Petunjuk from '#lib/components/bantuan/Petunjuk.svelte';
	import { untrack } from 'svelte';
	import { galatJaringan } from '#lib/auth/cache-profil.ts';
	import { auth } from '#lib/auth/session.svelte.ts';
	import BayarPanel from '#lib/components/kasir/BayarPanel.svelte';
	import Keranjang from '#lib/components/kasir/Keranjang.svelte';
	import MenuGrid from '#lib/components/kasir/MenuGrid.svelte';
	import ModalShift from '#lib/components/kasir/ModalShift.svelte';
	import PrinterChip from '#lib/components/kasir/PrinterChip.svelte';
	import Selesai from '#lib/components/kasir/Selesai.svelte';
	import PitaMinus from '#lib/components/stok/PitaMinus.svelte';
	import { muatMenuOutlet } from '#lib/kasir/api.ts';
	import { tambah, tambahNasiBox, totalKeranjang, ubahQty } from '#lib/kasir/keranjang.ts';
	import { buatKejadianJual } from '#lib/kasir/offline-kasir.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import type { DataStruk } from '#lib/kasir/struk.ts';
	import type { BarisKeranjang, MenuJual, Metode } from '#lib/kasir/types.ts';
	import { shiftKedaluwarsa, tanggalWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import { href } from '#lib/nav.ts';
	import { tambahKejadian } from '#lib/offline/antrean.ts';
	import { ambilUrutSementara, nomorSementara } from '#lib/offline/nomor.ts';
	import { bacaPerangkat } from '#lib/offline/perangkat.ts';
	import { denganSalinan } from '#lib/offline/salinan.ts';
	import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';

	let menu = $state<MenuJual[]>([]);
	let keranjang = $state<BarisKeranjang[]>([]);
	let tahap = $state<'pilih' | 'bayar' | 'selesai'>('pilih');
	let struk = $state<DataStruk | null>(null);
	let peringatan = $state('');
	let pesanMenu = $state('');
	let muatUlang = $state(0);
	let segarStok = $state(0);
	// Satu id per keranjang: masuk antrean sekali; server idempoten per id.
	let idTransaksi = $state(crypto.randomUUID());
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
				idTransaksi = crypto.randomUUID();
			}
		});
	});

	// Menu dari server bila online (lalu disimpan di perangkat), dari salinan bila offline.
	$effect(() => {
		const o = pos.outlet;
		void muatUlang;
		void auth.offline;
		if (!o) return;
		let batal = false;
		pesanMenu = '';
		denganSalinan(dbKasir, `menu:${o.id}`, () => muatMenuOutlet(o.id), (e) => galatJaringan(e as { message?: string }))
			.then((r) => {
				if (!batal) menu = r.nilai;
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
		const id = idTransaksi;
		peringatan = '';
		const r = buatKejadianJual({ id, outletId: o.id, shiftId: pos.shift!.id, metode, diterima, keranjang: kirim, waktu: new Date() });
		// Nomor sementara ditetapkan SEBELUM masuk antrean supaya pasti ikut tersimpan di server
		// (perangkat yang belum pernah terdaftar online: nomor menyusul, kode struk tetap tercetak).
		const kodePerangkat = bacaPerangkat(localStorage).kode;
		const noSementara = kodePerangkat ? nomorSementara(kodePerangkat, ambilUrutSementara(localStorage, tanggalWib(new Date()))) : null;
		if (noSementara) r.kejadian.data.nomor_sementara = noSementara;
		await tambahKejadian(dbKasir, { ...r.kejadian, user_id: auth.profile?.id ?? null });
		let resmi = null as { nomor: string; total: number; kembalian: number | null } | null;
		try {
			// Online: coba kirim langsung (paling lama 4 detik) supaya struk memakai nomor resmi.
			await Promise.race([sinkron.jalankan(), new Promise((x) => setTimeout(x, 4000))]);
			const k = await dbKasir.kejadian.where('id').equals(id).first();
			if (k?.status === 'terkirim') resmi = k.hasil as { nomor: string; total: number; kembalian: number | null };
			if (k?.status === 'ditolak') peringatan = `Belum tercatat di server: ${k.alasan} Cek menu Perlu perhatian.`;
		} catch {
			// Transaksi sudah aman di antrean; struk tetap ditampilkan.
		}
		const sementara = resmi ? null : noSementara;
		if (resmi && resmi.total !== r.total) peringatan = 'Harga menu baru saja diubah admin; total mengikuti harga terbaru.';
		struk = {
			outlet: { merek: o.merek, nama: o.nama, alamat: o.alamat, telepon: o.telepon },
			nomor: resmi?.nomor ?? sementara ?? 'menyusul',
			nomorSementara: sementara,
			kodeStruk: r.kodeStruk,
			waktu: r.kejadian.waktu,
			kasir,
			item: kirim.map((b) => ({ nama: b.nama, harga: b.harga, qty: b.qty })),
			total: resmi?.total ?? r.total,
			metode,
			diterima: metode === 'cash' ? diterima : null,
			kembalian: metode === 'cash' ? (resmi?.kembalian ?? r.kembalian) : null
		};
		if (resmi && resmi.total !== r.total) muatUlang++;
		tahap = 'selesai';
		segarStok++;
	}

	function kosongkan() {
		keranjang = [];
		idTransaksi = crypto.randomUUID();
	}

	function baru() {
		keranjang = [];
		struk = null;
		peringatan = '';
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
	<Selesai data={struk} {peringatan} onbaru={baru} />
{:else}
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-2"><h1 class="font-display text-2xl">{pos.outlet?.merek} {pos.outlet?.nama}</h1><Petunjuk topik="jualan" peran="kasir" /></div>
		<PrinterChip />
	</div>
	{#if pos.outlet}<PitaMinus outletId={pos.outlet.id} segar={segarStok} />{/if}
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
				<BayarPanel {total} onbayar={bayar} onbatal={() => (tahap = 'pilih')} />
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
