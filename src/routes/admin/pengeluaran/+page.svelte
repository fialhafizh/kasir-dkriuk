<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { awalHariWib, batalPengeluaran, catatPengeluaranAdmin, muatBelanjaBahan, mundurHari, simpanKategori, type BelanjaBahan } from '#lib/kas/admin.ts';
	import { muatKategori, muatPengeluaran, type Kategori, type Pengeluaran } from '#lib/kas/api.ts';
	import { formatWaktuWib, tanggalWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	interface Baris {
		id: string;
		outlet_id: string;
		waktu: string;
		kategori: string;
		sumber: string;
		jumlah: number;
		keterangan: string | null;
		batal: string | null;
		bisaBatal: boolean;
	}

	const hariIni = tanggalWib(new Date());
	let outlets = $state<Outlet[]>([]);
	let kategori = $state<Kategori[]>([]);
	let filterOutlet = $state('');
	let dari = $state(mundurHari(hariIni, 6));
	let sampai = $state(hariIni);
	let daftar = $state<Baris[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	// Formulir pengeluaran admin.
	let fOutlet = $state('');
	let fSumber = $state<'luar' | 'laci'>('luar');
	let fKategori = $state('');
	let fNominal = $state('');
	let fTanggal = $state(hariIni);
	let fKet = $state('');
	let fId = $state(crypto.randomUUID());
	let pesanForm = $state('');
	let tercatat = $state('');

	let namaBaru = $state('');
	let pesanKategori = $state('');

	async function muat() {
		status = 'memuat';
		try {
			if (!outlets.length) outlets = await muatOutlets();
			fOutlet ||= outlets.find((o) => o.aktif)?.id ?? '';
			kategori = await muatKategori();
			const o = filterOutlet || undefined;
			const [ps, bs] = await Promise.all([
				muatPengeluaran({ outletId: o, dari: awalHariWib(dari), sampai: awalHariWib(mundurHari(sampai, -1)) }),
				muatBelanjaBahan(o, dari, sampai)
			]);
			const nama = (id: string) => kategori.find((k) => k.id === id)?.nama ?? '-';
			daftar = [
				...ps.map((p: Pengeluaran) => ({
					id: p.id,
					outlet_id: p.outlet_id,
					waktu: p.waktu,
					kategori: nama(p.kategori_id),
					sumber: p.sumber === 'laci' ? 'Dari laci' : 'Di luar laci',
					jumlah: p.jumlah,
					keterangan: p.keterangan,
					batal: p.batal_at ? (p.batal_alasan ?? '') : null,
					bisaBatal: !p.batal_at
				})),
				...bs.map((b: BelanjaBahan) => ({
					id: b.id,
					outlet_id: b.outlet_id,
					waktu: `${b.tanggal}T12:00:00+07:00`,
					kategori: 'Belanja bahan (barang masuk)',
					sumber: 'Di luar laci',
					jumlah: b.total,
					keterangan: b.catatan,
					batal: b.batal_at ? 'dibatalkan di Barang masuk' : null,
					bisaBatal: false
				}))
			].sort((a, b) => b.waktu.localeCompare(a.waktu));
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const namaOutlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '-';
	const kat = $derived(kategori.find((k) => k.id === fKategori));
	const total = $derived(daftar.filter((b) => !b.batal).reduce((a, b) => a + b.jumlah, 0));

	async function catat(e: SubmitEvent) {
		e.preventDefault();
		pesanForm = '';
		tercatat = '';
		const n = parseRupiah(fNominal);
		if (!fOutlet || !kat) return void (pesanForm = 'Pilih outlet dan kategori.');
		if (n === null || n < 1) return void (pesanForm = 'Isi nominal, mis. 150.000.');
		try {
			await catatPengeluaranAdmin({
				id: fId,
				outlet_id: fOutlet,
				sumber: fSumber,
				kategori_id: kat.id,
				jumlah: n,
				...(fKet.trim() ? { keterangan: fKet.trim() } : {}),
				...(fSumber === 'luar' ? { tanggal: fTanggal } : {})
			});
			tercatat = `Tercatat: ${kat.nama} Rp${formatAngka(n)} (${namaOutlet(fOutlet)}).`;
			fId = crypto.randomUUID();
			fNominal = '';
			fKet = '';
			await muat();
		} catch (err) {
			pesanForm = (err as Error).message;
		}
	}

	async function batal(b: Baris) {
		pesanBaris[b.id] = '';
		try {
			await batalPengeluaran(b.id, alasan[b.id] ?? '');
			await muat();
		} catch (err) {
			pesanBaris[b.id] = (err as Error).message;
		}
	}

	async function ubahKategori(k: Kategori, ubah: Partial<Kategori>) {
		pesanKategori = '';
		try {
			await simpanKategori({ id: k.id, nama: k.nama, ...ubah });
			kategori = await muatKategori();
		} catch (err) {
			pesanKategori = (err as Error).message;
		}
	}
	async function tambahKategori(e: SubmitEvent) {
		e.preventDefault();
		pesanKategori = '';
		try {
			await simpanKategori({ nama: namaBaru });
			namaBaru = '';
			kategori = await muatKategori();
		} catch (err) {
			pesanKategori = (err as Error).message;
		}
	}
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<svelte:head><title>Pengeluaran · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Pengeluaran</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Semua pengeluaran: dari laci (kasir/admin), di luar laci (dibayar owner), dan belanja bahan dari Barang masuk. Batal pengeluaran = koreksi
	catatan (dianggap tidak pernah ada).
</p>

<form class="mt-4 grid max-w-2xl gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2" onsubmit={catat} novalidate>
	<h2 class="font-display text-xl sm:col-span-2">Catat pengeluaran</h2>
	<div class="grid gap-1.5">
		<label for="f-outlet" class="text-sm font-semibold">Outlet</label>
		<select id="f-outlet" bind:value={fOutlet} class={kotak}>{#each outlets as o (o.id)}<option value={o.id}>{o.nama}</option>{/each}</select>
	</div>
	<div class="grid gap-1.5">
		<label for="f-sumber" class="text-sm font-semibold">Dibayar</label>
		<select id="f-sumber" bind:value={fSumber} class={kotak}>
			<option value="luar">Di luar laci (owner)</option>
			<option value="laci">Dari uang laci (sekarang)</option>
		</select>
	</div>
	<div class="grid gap-1.5">
		<label for="f-kat" class="text-sm font-semibold">Kategori</label>
		<select id="f-kat" bind:value={fKategori} class={kotak}>
			<option value="">Pilih…</option>
			{#each kategori.filter((k) => k.aktif) as k (k.id)}<option value={k.id}>{k.nama}</option>{/each}
		</select>
	</div>
	<div class="grid gap-1.5">
		<label for="f-nominal" class="text-sm font-semibold">Nominal</label>
		<input id="f-nominal" bind:value={fNominal} inputmode="numeric" class="tabular text-right {kotak}" />
	</div>
	{#if fSumber === 'luar'}
		<div class="grid gap-1.5">
			<label for="f-tgl" class="text-sm font-semibold">Tanggal</label>
			<input id="f-tgl" type="date" bind:value={fTanggal} max={hariIni} class={kotak} />
		</div>
	{/if}
	<div class="grid gap-1.5">
		<label for="f-ket" class="text-sm font-semibold">Keterangan {kat?.wajib_keterangan ? '(wajib)' : '(opsional)'}</label>
		<input id="f-ket" bind:value={fKet} maxlength="200" class={kotak} />
	</div>
	{#if pesanForm}<p class="text-sm text-danger sm:col-span-2" role="alert">{pesanForm}</p>{/if}
	{#if tercatat}<p class="text-sm font-semibold text-ok sm:col-span-2" role="status">{tercatat}</p>{/if}
	<div class="sm:col-span-2"><Button type="submit">Catat</Button></div>
</form>

<form class="mt-6 flex flex-wrap items-end gap-3" onsubmit={(e) => (e.preventDefault(), void muat())}>
	<div class="grid gap-1.5">
		<label for="filter-outlet" class="text-sm font-semibold">Outlet</label>
		<select id="filter-outlet" bind:value={filterOutlet} class={kotak}>
			<option value="">Semua outlet</option>
			{#each outlets as o (o.id)}<option value={o.id}>{o.nama}</option>{/each}
		</select>
	</div>
	<div class="grid gap-1.5"><label for="dari" class="text-sm font-semibold">Dari</label><input id="dari" type="date" bind:value={dari} max={sampai} class={kotak} /></div>
	<div class="grid gap-1.5"><label for="sampai" class="text-sm font-semibold">Sampai</label><input id="sampai" type="date" bind:value={sampai} min={dari} max={hariIni} class={kotak} /></div>
	<button type="submit" class="min-h-12 rounded-xl bg-surface-2 px-4 font-semibold">Tampilkan</button>
</form>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	<p class="mt-3 font-semibold">Total (tidak termasuk yang dibatalkan): Rp{formatAngka(total)}</p>
	{#if daftar.length === 0}
		<p class="mt-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada pengeluaran di rentang ini.</p>
	{:else}
		<ul class="mt-2 grid gap-2">
			{#each daftar as b (b.id)}
				<li class="rounded-2xl border border-line bg-surface p-3 {b.batal ? 'opacity-70' : ''}">
					<p class="flex flex-wrap justify-between gap-2">
						<span class="font-semibold">{b.kategori} · {namaOutlet(b.outlet_id)}</span>
						<span class="tabular font-bold {b.batal ? 'line-through' : ''}">Rp{formatAngka(b.jumlah)}</span>
					</p>
					<p class="text-sm text-muted">{formatWaktuWib(b.waktu)} · {b.sumber}{b.keterangan ? ` · ${b.keterangan}` : ''}</p>
					{#if b.batal}<p class="text-sm text-danger">Dibatalkan: {b.batal}</p>{/if}
					{#if b.bisaBatal}
						<div class="mt-2 flex flex-wrap items-center gap-2">
							<label class="sr-only" for="alasan-{b.id}">Alasan batal</label>
							<input id="alasan-{b.id}" bind:value={alasan[b.id]} maxlength="200" placeholder="Alasan batal" class="min-w-0 flex-1 {kotak}" />
							<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(b)} />
						</div>
					{/if}
					{#if pesanBaris[b.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[b.id]}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<section class="mt-8" aria-label="Kategori pengeluaran">
	<h2 class="font-display text-2xl">Kategori</h2>
	<ul class="mt-2 grid gap-2">
		{#each kategori as k (k.id)}
			<li class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3 {k.aktif ? '' : 'opacity-60'}">
				<span class="font-semibold">{k.nama}{k.wajib_keterangan ? ' · keterangan wajib' : ''}</span>
				<span class="flex flex-wrap gap-2">
					<button type="button" class="min-h-12 rounded-xl bg-surface-2 px-3 text-sm" onclick={() => ubahKategori(k, { untuk_kasir: !k.untuk_kasir })}>
						{k.untuk_kasir ? 'Dipakai kasir' : 'Admin saja'}
					</button>
					<button type="button" class="min-h-12 rounded-xl bg-surface-2 px-3 text-sm" onclick={() => ubahKategori(k, { aktif: !k.aktif })}>
						{k.aktif ? 'Nonaktifkan' : 'Aktifkan'}
					</button>
				</span>
			</li>
		{/each}
	</ul>
	<form class="mt-3 flex flex-wrap items-end gap-2" onsubmit={tambahKategori}>
		<div class="grid min-w-0 flex-1 gap-1.5">
			<label for="kat-baru" class="text-sm font-semibold">Kategori baru</label>
			<input id="kat-baru" bind:value={namaBaru} maxlength="40" class={kotak} />
		</div>
		<button type="submit" class="min-h-12 rounded-xl bg-surface-2 px-4 font-semibold">Tambah</button>
	</form>
	{#if pesanKategori}<p class="mt-1 text-sm text-danger" role="alert">{pesanKategori}</p>{/if}
</section>
