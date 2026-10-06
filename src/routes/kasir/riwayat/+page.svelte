<script lang="ts">
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { galatJaringan } from '#lib/auth/cache-profil.ts';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { daftarPenjualanShift } from '#lib/kasir/api.ts';
	import { labelMetode } from '#lib/kasir/bayar.ts';
	import { dataStrukRiwayat } from '#lib/kasir/cetak.ts';
	import { encodeStruk, urlRawBT } from '#lib/kasir/escpos.ts';
	import { antrekan } from '#lib/kasir/antre.ts';
	import { buatKejadianBatal } from '#lib/kasir/offline-kasir.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { printer } from '#lib/kasir/printer.svelte.ts';
	import { barisStruk } from '#lib/kasir/struk.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import { bacaPerangkat } from '#lib/offline/perangkat.ts';
	import { cocokCari, gabungRiwayat, type PenjualanLokal } from '#lib/offline/proyeksi.ts';
	import { bacaSalinan, denganSalinan } from '#lib/offline/salinan.ts';
	import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';

	let daftar = $state<PenjualanLokal[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let cari = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});
	const perangkatIni = typeof localStorage === 'undefined' ? null : bacaPerangkat(localStorage).id;

	// Jawaban muat yang lebih lama tidak boleh menimpa yang lebih baru.
	let gen = 0;
	async function muat() {
		const s = pos.shift;
		if (!s) return;
		const g = ++gen;
		try {
			let server = null;
			try {
				server = (await denganSalinan(dbKasir, `riwayat:${s.id}`, () => daftarPenjualanShift(s.id), (e) => galatJaringan(e as { message?: string }))).nilai;
			} catch {
				server = await bacaSalinan<typeof daftar>(dbKasir, `riwayat:${s.id}`);
			}
			const d = gabungRiwayat(server ?? [], await dbKasir.kejadian.toArray(), s.id);
			if (g !== gen) return;
			daftar = d;
			status = 'siap';
		} catch (e) {
			if (g !== gen) return;
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	$effect(() => {
		void sinkron.versi;
		void sinkron.menunggu;
		if (pos.shift) void muat();
	});

	const tampil = $derived(daftar.filter((p) => cocokCari(p, cari)));

	// Batal masuk antrean (bisa tanpa internet); server memeriksa ulang saat sinkron.
	async function batal(p: PenjualanLokal) {
		pesanBaris[p.id] = '';
		const a = (alasan[p.id] ?? '').trim();
		if (a.length < 3) {
			pesanBaris[p.id] = 'Alasan pembatalan wajib diisi (3–200 karakter).';
			return;
		}
		try {
			// Daftar dimuat ulang otomatis saat jumlah antrean berubah.
			await antrekan(buatKejadianBatal(pos.outlet!.id, pos.shift?.id ?? null, p.id, a, new Date()));
		} catch (e) {
			pesanBaris[p.id] = (e as Error).message;
		}
	}

	const strukDari = (p: PenjualanLokal) => ({
		...dataStrukRiwayat(pos.outlet!, auth.profile?.nama_tampilan ?? '', p, true),
		kodeStruk: p.kode_struk,
		nomorSementara: p.status_kirim === 'server' || p.status_kirim === 'terkirim' ? null : p.nomor_sementara
	});

	async function cetakUlang(p: PenjualanLokal) {
		try {
			await printer.cetak(encodeStruk(barisStruk(strukDari(p))));
		} catch (e) {
			pesanBaris[p.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Riwayat · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Riwayat shift ini</h1>
{#if pos.status === 'memuat' && !pos.shift}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if pos.status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pos.pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => pos.muatShift()}>Coba lagi</button>
{:else if !pos.shift}
	<p class="mt-2 text-muted">Belum ada shift terbuka.</p>
{:else if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else if daftar.length === 0}
	<p class="mt-4 text-muted">Belum ada transaksi.</p>
{:else}
	<div class="mt-4 grid gap-1.5">
		<label for="cari-struk" class="text-sm font-semibold">Cari nomor / nomor sementara / kode struk</label>
		<input id="cari-struk" bind:value={cari} autocomplete="off" placeholder="mis. K7Q2MX atau S1-012" class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg" />
	</div>
	{#if tampil.length === 0}<p class="mt-3 text-sm text-muted">Tidak ada yang cocok.</p>{/if}
	<ul class="mt-4 grid gap-3">
		{#each tampil as p (p.id)}
			<li class="rounded-2xl border border-line bg-surface p-4 {p.void_at ? 'opacity-70' : ''}">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<p class="font-semibold">{p.nomor} <span class="text-sm font-normal text-muted">{formatWaktuWib(p.waktu)}</span></p>
					<p class="tabular font-bold {p.void_at ? 'line-through' : ''}">Rp{formatAngka(p.total)} · {labelMetode(p.metode)}</p>
				</div>
				<p class="mt-1 text-sm text-muted">{p.item.map((i) => `${i.qty}× ${i.nama}`).join(', ')}</p>
				<p class="mt-1 text-xs text-muted">
					{#if p.kode_struk}Kode struk {p.kode_struk}{/if}
					{#if p.nomor_sementara} · No. sementara {p.nomor_sementara}{/if}
					{#if p.dicatat_at} · sampai server {formatWaktuWib(p.dicatat_at)}{/if}
					{#if p.perangkat_id && p.perangkat_id === perangkatIni} · perangkat ini{/if}
				</p>
				{#if p.status_kirim === 'menunggu'}<p class="mt-1 text-sm font-semibold text-warn">Belum terkirim</p>{/if}
				{#if p.status_kirim === 'ditolak'}<p class="mt-1 text-sm font-semibold text-danger">Ditolak server: {p.alasan}</p>{/if}
				{#if p.batal_kirim === 'ditolak'}<p class="mt-1 text-sm font-semibold text-danger">Batal ditolak server: {p.alasan_batal_ditolak} Cek menu Perlu perhatian.</p>{/if}
				{#if p.void_at}
					<p class="mt-1 text-sm font-semibold text-danger">Dibatalkan: {p.void_alasan}{p.batal_kirim === 'menunggu' ? ' (belum terkirim)' : ''}</p>
				{:else if p.status_kirim === 'ditolak' || p.batal_kirim === 'ditolak'}
					<!-- Transaksi ditolak diselesaikan di Perlu perhatian; batal yang ditolak juga. -->
				{:else}
					<div class="mt-2 flex flex-wrap items-end gap-2">
						<div class="grid min-w-0 flex-1 gap-1">
							<label for="alasan-{p.id}" class="text-xs font-semibold text-muted">Alasan batal</label>
							<input
								id="alasan-{p.id}"
								bind:value={alasan[p.id]}
								maxlength="200"
								placeholder="mis. salah input"
								class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg"
							/>
						</div>
						<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" onkonfirmasi={() => batal(p)} />
					</div>
				{/if}
				<div class="mt-2 flex flex-wrap gap-2">
					{#if printer.status === 'siap'}
						<button type="button" class="min-h-12 rounded-xl px-3 text-sm hover:bg-surface-2" onclick={() => cetakUlang(p)}>Cetak ulang</button>
					{:else}
						<a href={urlRawBT(encodeStruk(barisStruk(strukDari(p))))} class="inline-flex min-h-12 items-center rounded-xl px-3 text-sm hover:bg-surface-2"
							>Cetak ulang (RawBT)</a
						>
					{/if}
				</div>
				{#if pesanBaris[p.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[p.id]}</p>{/if}
			</li>
		{/each}
	</ul>
{/if}
