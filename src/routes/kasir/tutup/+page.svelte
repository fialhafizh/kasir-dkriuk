<script lang="ts">
	import RingkasanShift from '#lib/components/kasir/RingkasanShift.svelte';
	import LangkahSisa, { sudahDijawab } from '#lib/components/stok/LangkahSisa.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { galatJaringan } from '#lib/auth/cache-profil.ts';
	import { daftarPenjualanShift, ringkasanShift } from '#lib/kasir/api.ts';
	import { buatKejadianTutup } from '#lib/kasir/offline-kasir.ts';
	import { tambahKejadian } from '#lib/offline/antrean.ts';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { gabungRiwayat, idSatuShift, ringkasanLokal } from '#lib/offline/proyeksi.ts';
	import { bacaSalinan, denganSalinan } from '#lib/offline/salinan.ts';
	import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import type { Ringkasan } from '#lib/kasir/types.ts';
	import { href } from '#lib/nav.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';
	import { saldoLaciPerangkat } from '#lib/kas/laci.ts';
	import { kasAntrean } from '#lib/offline/proyeksi-laci.ts';

	let r = $state<Ringkasan | null>(null);
	let hasil = $state<Ringkasan | null>(null);
	let teks = $state('');
	let catatan = $state('');
	let pesan = $state('');
	// Langkah wajib "sisa tidak terjual" sekali per shift (diingat di tablet ini).
	let sisaSelesai = $state(false);
	let sisaUntuk: string | null = null;
	$effect(() => {
		const id = pos.shift?.id;
		// Hanya dibaca ulang saat shift berganti (muat ulang shift yang sama tidak mengulang pertanyaan).
		if (id && id !== sisaUntuk) {
			sisaUntuk = id;
			void dbKasir.kejadian
				.toArray()
				.then((k) => (sisaSelesai = sudahDijawab(...idSatuShift(k, id))))
				.catch(() => (sisaSelesai = sudahDijawab(id)));
		}
	});

	// Ringkasan = ringkasan server (salinan bila offline) + penjualan yang masih di antrean perangkat.
	$effect(() => {
		const s = pos.shift;
		void sinkron.versi;
		if (!s) return;
		let batal = false;
		const jar = (e: unknown) => galatJaringan(e as { message?: string });
		const coba = async <T,>(kunci: string, ambil: () => Promise<T>): Promise<T | null> => {
			try {
				return (await denganSalinan(dbKasir, kunci, ambil, jar)).nilai;
			} catch {
				// Shift baru dibuka di perangkat ini (belum ada di server) atau belum ada salinan.
				return bacaSalinan<T>(dbKasir, kunci);
			}
		};
		void (async () => {
			const [dasar, server, kejadian, laci] = await Promise.all([
				coba(`ringkasan:${s.id}`, () => ringkasanShift(s.id)),
				coba(`riwayat:${s.id}`, () => daftarPenjualanShift(s.id)),
				dbKasir.kejadian.toArray(),
				saldoLaciPerangkat(s.outlet_id).catch(() => null)
			]);
			if (batal) return;
			const dasarR = ringkasanLokal(dasar, s, gabungRiwayat(server ?? [], kejadian, s.id), server !== null);
			// Uang seharusnya = saldo laci (sudah termasuk sisa sebelumnya, pengeluaran, setoran). Tanpa data laci: rumus lama.
			const antre = kasAntrean(kejadian, s.outlet_id, s.dibuka_at, null);
			r = {
				...dasarR,
				cash_seharusnya: laci?.saldo ?? dasarR.cash_seharusnya,
				pengeluaran_laci: (dasar?.pengeluaran_laci ?? 0) + antre.pengeluaran,
				setoran: (dasar?.setoran ?? 0) + antre.setoran
			};
		})();
		return () => {
			batal = true;
		};
	});

	const uang = $derived(parseRupiah(teks));
	const selisih = $derived(r && uang !== null ? uang - r.cash_seharusnya : null);

	async function tutup() {
		pesan = '';
		if (!pos.shift || uang === null) {
			pesan = 'Isi jumlah uang yang ada di laci, mis. 350.000.';
			return;
		}
		// Tutup toko masuk antrean (bisa tanpa internet); ringkasan resmi dihitung server saat sinkron.
		// Kirim dengan id shift milik perangkat ini (bila ia ikut membuka) supaya hitungan lacinya tercatat atas namanya.
		let shiftKirim = pos.shift.id;
		try {
			const semua = await dbKasir.kejadian.toArray();
			const ids = idSatuShift(semua, pos.shift.id);
			const milik = semua.find((x) => x.jenis === 'buka_shift' && x.shift_id && ids.has(x.shift_id));
			if (milik?.shift_id) shiftKirim = milik.shift_id;
		} catch {
			// pakai id shift yang ada
		}
		const k = buatKejadianTutup(pos.shift.outlet_id, shiftKirim, uang, catatan, new Date());
		try {
			await tambahKejadian(dbKasir, { ...k, user_id: auth.profile?.id ?? null });
		} catch (e) {
			pesan = `Gagal menyimpan di perangkat: ${(e as Error).message}`;
			return;
		}
		hasil = { ...r!, uang_fisik: uang, selisih: uang - r!.cash_seharusnya, ditutup_at: k.waktu };
		void sinkron.jalankan();
		await pos.muatShift();
	}
</script>

<svelte:head><title>Tutup toko · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Tutup toko</h1>

{#if hasil}
	<p class="mt-2 font-semibold text-ok" role="status">
		Toko ditutup. Uang di laci sekarang Rp{formatAngka(hasil.uang_fisik ?? 0)}. Bila menyetor ke owner, catat di menu
		<a class="underline" href={href('/kasir/kas')}>Kas</a>.
	</p>
	<div class="mt-4 max-w-md"><RingkasanShift r={hasil} /></div>
	<a href={href('/kasir')} class="mt-4 inline-flex min-h-12 items-center rounded-xl bg-surface-2 px-4 font-semibold">Ke layar jualan</a>
{:else if pos.status === 'memuat' && !pos.shift}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if pos.status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pos.pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => pos.muatShift()}>Coba lagi</button>
{:else if !pos.shift}
	<p class="mt-2 text-muted">Tidak ada shift terbuka. Toko sudah ditutup.</p>
{:else if !sisaSelesai}
	<div class="mt-4"><LangkahSisa outletId={pos.shift.outlet_id} shiftId={pos.shift.id} onselesai={() => (sisaSelesai = true)} /></div>
{:else if r}
	<div class="mt-4 grid max-w-md gap-4">
		<RingkasanShift {r} />
		<div class="grid gap-1.5">
			<label for="uang-laci" class="text-sm font-semibold">Uang cash yang ada di laci sekarang</label>
			<input
				id="uang-laci"
				bind:value={teks}
				inputmode="numeric"
				autocomplete="off"
				placeholder="0"
				class="tabular min-h-14 rounded-xl border border-line-strong bg-surface px-3 text-right text-2xl text-fg"
			/>
			{#if selisih !== null}
				<p class="text-sm font-semibold {selisih === 0 ? 'text-ok' : 'text-danger'}">
					{selisih === 0 ? 'Pas dengan catatan.' : `${selisih > 0 ? 'Lebih' : 'Kurang'} Rp${formatAngka(Math.abs(selisih))} dari catatan.`}
				</p>
			{/if}
		</div>
		<div class="grid gap-1.5">
			<label for="catatan-tutup" class="text-sm font-semibold">Catatan (opsional)</label>
			<input id="catatan-tutup" bind:value={catatan} maxlength="500" class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg" />
		</div>
		{#if pesan}<p class="text-sm text-danger" role="alert">{pesan}</p>{/if}
		{#if uang === null}
			<p class="text-sm text-muted">Isi jumlah uang di laci dulu untuk menutup toko.</p>
		{:else}
			<Konfirmasi label="Tutup toko" konfirmasiLabel="Ya, tutup toko" variant="primary" onkonfirmasi={tutup} />
		{/if}
	</div>
{:else if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{/if}
