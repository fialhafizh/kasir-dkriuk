<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { galatJaringan } from '#lib/auth/cache-profil.ts';
	import { muatKategori, muatPengeluaran, muatSetoran, type Kategori, type Pengeluaran, type Setoran } from '#lib/kas/api.ts';
	import { saldoLaciPerangkat, type SaldoLaci } from '#lib/kas/laci.ts';
	import { antrekan } from '#lib/kasir/antre.ts';
	import { buatKejadianPengeluaran, buatKejadianSetoran } from '#lib/kasir/offline-kasir.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';
	import type { Kejadian } from '#lib/offline/db.ts';
	import { denganSalinan } from '#lib/offline/salinan.ts';
	import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';

	interface Baris {
		id: string;
		jenis: 'pengeluaran' | 'setoran';
		waktu: string;
		jumlah: number;
		teks: string;
		status: string;
	}

	let laci = $state<SaldoLaci | null>(null);
	let kategori = $state<Kategori[]>([]);
	let daftar = $state<Baris[]>([]);
	let pesanMuat = $state('');

	let kategoriId = $state('');
	let nominal = $state('');
	let keterangan = $state('');
	let pesanKeluar = $state('');
	let memprosesKeluar = $state(false);
	let tercatatKeluar = $state('');

	let setor = $state('');
	let catatanSetor = $state('');
	let pesanSetor = $state('');
	let tercatatSetor = $state('');

	const jaringan = (e: unknown) => galatJaringan(e as { message?: string });
	// Daftar 3 hari terakhir (setoran biasanya tiap 3 hari).
	const sejak = () => new Date(Date.now() - 3 * 86_400_000).toISOString();

	async function muat() {
		const o = pos.outlet;
		if (!o) return;
		pesanMuat = '';
		laci = await saldoLaciPerangkat(o.id).catch(() => null);
		try {
			kategori = (await denganSalinan(dbKasir, 'kategori', muatKategori, jaringan)).nilai.filter((k) => k.untuk_kasir && k.aktif);
		} catch (e) {
			pesanMuat = (e as Error).message;
		}
		let keluar: Pengeluaran[] = [];
		let masuk: Setoran[] = [];
		try {
			[keluar, masuk] = await Promise.all([
				denganSalinan(dbKasir, `pengeluaran:${o.id}`, () => muatPengeluaran({ outletId: o.id, dari: sejak(), sampai: new Date(Date.now() + 3_600_000).toISOString() }), jaringan).then((r) => r.nilai),
				denganSalinan(dbKasir, `setoran:${o.id}`, () => muatSetoran({ outletId: o.id, batas: 10 }), jaringan).then((r) => r.nilai)
			]);
		} catch {
			// Belum pernah tersimpan & offline: tampilkan antrean saja.
		}
		const antre: Kejadian[] = (await dbKasir.kejadian.toArray().catch(() => [])).filter(
			(k) => k.outlet_id === o.id && (k.jenis === 'pengeluaran' || k.jenis === 'setoran') && k.status !== 'terkirim' && k.status !== 'diabaikan'
		);
		const nama = (id: string) => kategori.find((k) => k.id === id)?.nama ?? 'Pengeluaran';
		daftar = [
			...antre.map((k) => ({
				id: k.id,
				jenis: k.jenis as Baris['jenis'],
				waktu: k.waktu,
				jumlah: Number(k.data.jumlah ?? 0),
				teks: k.jenis === 'pengeluaran' ? nama(String(k.data.kategori_id)) : 'Setoran ke owner',
				status: k.status === 'ditolak' ? `Ditolak: ${k.alasan}` : 'Belum terkirim'
			})),
			...keluar
				.filter((p) => p.sumber === 'laci' && !antre.some((k) => k.id === p.id))
				.map((p) => ({
					id: p.id,
					jenis: 'pengeluaran' as const,
					waktu: p.waktu,
					jumlah: p.jumlah,
					teks: `${nama(p.kategori_id)}${p.keterangan ? ` · ${p.keterangan}` : ''}`,
					status: p.batal_at ? `Dibatalkan admin: ${p.batal_alasan}` : ''
				})),
			...masuk
				.filter((s) => !antre.some((k) => k.id === s.id))
				.map((s) => ({
					id: s.id,
					jenis: 'setoran' as const,
					waktu: s.waktu,
					jumlah: s.jumlah,
					teks: `Setoran ke owner${s.catatan ? ` · ${s.catatan}` : ''}`,
					status: s.batal_at
						? `Dibatalkan admin: ${s.batal_alasan}`
						: s.diterima_at
							? s.jumlah_diterima === s.jumlah
								? 'Diterima owner'
								: `Diterima owner Rp${formatAngka(s.jumlah_diterima ?? 0)} (${s.catatan_terima ?? ''})`
							: 'Belum diterima owner'
				}))
		].sort((a, b) => b.waktu.localeCompare(a.waktu));
	}

	$effect(() => {
		void sinkron.versi;
		void sinkron.menunggu;
		if (pos.outlet) void muat();
	});

	const kat = $derived(kategori.find((k) => k.id === kategoriId));

	async function catatPengeluaran(e: SubmitEvent) {
		e.preventDefault();
		pesanKeluar = '';
		tercatatKeluar = '';
		const n = parseRupiah(nominal);
		if (!kat) return void (pesanKeluar = 'Pilih jenis pengeluaran.');
		if (n === null || n < 1) return void (pesanKeluar = 'Isi nominal, mis. 25.000.');
		if (kat.wajib_keterangan && keterangan.trim().length < 3) return void (pesanKeluar = 'Keterangan wajib diisi untuk jenis ini.');
		// Ketukan ganda tidak boleh mencatat dua kali.
		if (memprosesKeluar) return;
		memprosesKeluar = true;
		try {
			await antrekan(buatKejadianPengeluaran(pos.outlet!.id, { kategoriId: kat.id, jumlah: n, keterangan }, new Date()));
			tercatatKeluar = `Tercatat: ${kat.nama} Rp${formatAngka(n)}. Uang laci berkurang.`;
			nominal = '';
			keterangan = '';
			await muat();
		} catch (err) {
			pesanKeluar = `Gagal menyimpan di perangkat: ${(err as Error).message}`;
		} finally {
			memprosesKeluar = false;
		}
	}

	async function catatSetoran() {
		pesanSetor = '';
		tercatatSetor = '';
		const n = parseRupiah(setor);
		if (n === null || n < 1) {
			pesanSetor = 'Isi jumlah yang diserahkan ke owner, mis. 2.500.000.';
			return;
		}
		try {
			await antrekan(buatKejadianSetoran(pos.outlet!.id, n, catatanSetor, new Date()));
		} catch (err) {
			pesanSetor = `Gagal menyimpan di perangkat: ${(err as Error).message}`;
			return;
		}
		tercatatSetor = `Setoran Rp${formatAngka(n)} tercatat. Menunggu owner mengonfirmasi.`;
		setor = '';
		catatanSetor = '';
		await muat();
	}

	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<svelte:head><title>Kas · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Kas {pos.outlet?.nama}</h1>
<p class="mt-1 text-sm text-muted">Pengeluaran kecil dari laci dan setoran ke owner. Bisa dicatat kapan saja, juga tanpa internet.</p>
{#if pesanMuat}<p class="mt-2 text-sm text-danger" role="alert">{pesanMuat}</p>{/if}

<div class="mt-4 grid gap-6 md:grid-cols-2">
	<form class="grid content-start gap-3 rounded-2xl border border-line bg-surface p-4" onsubmit={catatPengeluaran} novalidate>
		<h2 class="font-display text-xl">Pengeluaran dari laci</h2>
		<div class="grid gap-1.5">
			<label for="kategori" class="text-sm font-semibold">Jenis</label>
			<select id="kategori" bind:value={kategoriId} class={kotak}>
				<option value="">Pilih…</option>
				{#each kategori as k (k.id)}<option value={k.id}>{k.nama}</option>{/each}
			</select>
		</div>
		<div class="grid gap-1.5">
			<label for="nominal" class="text-sm font-semibold">Nominal</label>
			<input id="nominal" bind:value={nominal} inputmode="numeric" autocomplete="off" placeholder="mis. 25.000" class="tabular text-right {kotak}" />
		</div>
		<div class="grid gap-1.5">
			<label for="ket" class="text-sm font-semibold">Keterangan {kat?.wajib_keterangan ? '(wajib)' : '(opsional)'}</label>
			<input id="ket" bind:value={keterangan} maxlength="200" class={kotak} />
		</div>
		{#if pesanKeluar}<p class="text-sm text-danger" role="alert">{pesanKeluar}</p>{/if}
		{#if tercatatKeluar}<p class="text-sm font-semibold text-ok" role="status">{tercatatKeluar}</p>{/if}
		<Button type="submit" loading={memprosesKeluar}>Catat pengeluaran</Button>
	</form>

	<section class="grid content-start gap-3 rounded-2xl border border-line bg-surface p-4" aria-label="Setoran">
		<h2 class="font-display text-xl">Setoran ke owner</h2>
		{#if laci}
			<p class="text-sm text-muted">Uang di laci sekarang</p>
			<p class="tabular font-display text-3xl text-brand">Rp{formatAngka(laci.saldo)}</p>
		{:else}
			<p class="text-sm text-muted">Uang di laci belum diketahui di perangkat ini (buka sekali saat online).</p>
		{/if}
		<div class="grid gap-1.5">
			<label for="setor" class="text-sm font-semibold">Jumlah yang diserahkan</label>
			<input id="setor" bind:value={setor} inputmode="numeric" autocomplete="off" placeholder="mis. 2.500.000" class="tabular text-right {kotak}" />
			{#if laci && parseRupiah(setor) !== null}
				{@const sisa = laci.saldo - (parseRupiah(setor) ?? 0)}
				<p class="text-sm {sisa < 0 ? 'font-semibold text-danger' : 'text-muted'}">
					{sisa < 0 ? 'Lebih besar dari uang di laci menurut catatan.' : `Sisa di laci setelah setor: Rp${formatAngka(sisa)}`}
				</p>
			{/if}
		</div>
		<div class="grid gap-1.5">
			<label for="catatan-setor" class="text-sm font-semibold">Catatan (opsional)</label>
			<input id="catatan-setor" bind:value={catatanSetor} maxlength="200" class={kotak} />
		</div>
		{#if pesanSetor}<p class="text-sm text-danger" role="alert">{pesanSetor}</p>{/if}
		{#if tercatatSetor}<p class="text-sm font-semibold text-ok" role="status">{tercatatSetor}</p>{/if}
		<Konfirmasi label="Catat setoran" konfirmasiLabel="Ya, uang sudah diserahkan" variant="primary" onkonfirmasi={catatSetoran} />
	</section>
</div>

<section class="mt-6" aria-label="Catatan kas terakhir">
	<h2 class="font-display text-xl">3 hari terakhir</h2>
	{#if daftar.length === 0}
		<p class="mt-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada pengeluaran atau setoran.</p>
	{:else}
		<ul class="mt-2 grid gap-2">
			{#each daftar as b (b.id)}
				<li class="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border border-line bg-surface p-3">
					<div class="min-w-0">
						<p class="font-semibold">{b.teks}</p>
						<p class="text-xs text-muted">{formatWaktuWib(b.waktu)}{b.status ? ` · ${b.status}` : ''}</p>
					</div>
					<p class="tabular font-bold">−Rp{formatAngka(b.jumlah)}</p>
				</li>
			{/each}
		</ul>
	{/if}
</section>
