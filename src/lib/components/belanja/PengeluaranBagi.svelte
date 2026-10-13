<script lang="ts">
	// Pengeluaran lainnya yang dibagi rata ke semua outlet aktif: isi nominal & keterangan sekali.
	import { onMount } from 'svelte';
	import type { BagiRiil } from '#lib/belanja/riil.ts';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { batalPengeluaranBagi, catatPengeluaranBagi } from '#lib/kas/admin.ts';
	import { muatKategori, type Kategori } from '#lib/kas/api.ts';
	import { formatWaktuWib, tanggalWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { outlets, daftar, onubah }: { outlets: Outlet[]; daftar: BagiRiil[]; onubah: () => Promise<void> | void } = $props();

	let kategori = $state<Kategori[]>([]);
	let kategoriId = $state('');
	let fJumlah = $state('');
	let keterangan = $state('');
	let tanggal = $state(tanggalWib(new Date()));
	let pesan = $state('');
	let galat = $state('');
	let menyimpan = $state(false);
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	onMount(() => {
		muatKategori()
			.then((k) => {
				kategori = k.filter((x) => x.aktif && x.kode === null);
				kategoriId ||= (kategori.find((x) => x.nama === 'Lain-lain admin') ?? kategori[0])?.id ?? '';
			})
			.catch((e) => (galat = (e as Error).message));
	});

	const jumlah = $derived(Number(fJumlah.replace(/\D/g, '')) || 0);
	const n = $derived(outlets.length);
	const bagian = $derived(n ? Math.floor(jumlah / n) : 0);
	const hariIni = tanggalWib(new Date());

	async function simpan(e: SubmitEvent) {
		e.preventDefault();
		pesan = '';
		galat = '';
		if (jumlah < n) return void (galat = 'Isi nominal pengeluaran.');
		if (keterangan.trim().length < 3) return void (galat = 'Keterangan wajib diisi (minimal 3 huruf).');
		menyimpan = true;
		try {
			await catatPengeluaranBagi({
				id: crypto.randomUUID(),
				kategori_id: kategoriId,
				jumlah,
				keterangan: keterangan.trim(),
				tanggal: tanggal === hariIni ? undefined : tanggal
			});
			pesan = `Tercatat Rp${formatAngka(jumlah)}, dibagi ke ${n} outlet.`;
			fJumlah = '';
			keterangan = '';
			await onubah();
		} catch (err) {
			galat = (err as Error).message;
		} finally {
			menyimpan = false;
		}
	}
	async function batal(b: BagiRiil) {
		pesanBaris[b.bagi_id] = '';
		try {
			await batalPengeluaranBagi(b.bagi_id, alasan[b.bagi_id] ?? '');
			await onubah();
		} catch (err) {
			pesanBaris[b.bagi_id] = (err as Error).message;
		}
	}
	const rp = (x: number) => `Rp${formatAngka(x)}`;
	const kotak = 'min-h-11 rounded-xl border border-line-strong bg-surface px-3';
</script>

<section class="rounded-2xl border border-line bg-surface p-3" aria-label="Pengeluaran lainnya dibagi rata">
	<h2 class="font-display text-xl">Pengeluaran lainnya (dibagi {n} outlet)</h2>
	<p class="text-sm text-muted">Untuk biaya bersama, mis. iklan, servis alat, atau ongkos kirim. Nominal dibagi rata ke semua outlet dan dicatat sebagai pengeluaran di luar laci.</p>
	<form class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" onsubmit={simpan}>
		<label class="grid gap-1 text-xs font-semibold">
			Nominal (Rp)
			<input class="{kotak} tabular text-right" inputmode="numeric" bind:value={fJumlah} placeholder="0" />
		</label>
		<label class="grid gap-1 text-xs font-semibold lg:col-span-2">
			Keterangan
			<input class={kotak} maxlength="200" bind:value={keterangan} placeholder="mis. iklan Instagram bulan Oktober" />
		</label>
		<label class="grid gap-1 text-xs font-semibold">
			Tanggal
			<input type="date" class={kotak} max={hariIni} bind:value={tanggal} />
		</label>
		<label class="grid gap-1 text-xs font-semibold">
			Kategori
			<select class={kotak} bind:value={kategoriId}>
				{#each kategori as k (k.id)}<option value={k.id}>{k.nama}</option>{/each}
			</select>
		</label>
		<div class="flex flex-wrap items-end gap-2 lg:col-span-3">
			<button type="submit" disabled={menyimpan || !kategoriId} class="min-h-11 rounded-xl bg-brand px-4 font-semibold text-on-brand disabled:opacity-60">
				{menyimpan ? 'Menyimpan…' : 'Catat & bagi'}
			</button>
			{#if jumlah >= n && n}
				<span class="text-sm text-muted">± {rp(bagian)} per outlet ({outlets.map((o) => o.nama).join(', ')})</span>
			{/if}
		</div>
	</form>
	{#if galat}<p class="mt-2 text-sm text-danger" role="alert">{galat}</p>{/if}
	{#if pesan}<p class="mt-2 text-sm" role="status">{pesan}</p>{/if}

	{#if daftar.length}
		<ul class="mt-4 grid gap-2">
			{#each daftar as b (b.bagi_id)}
				<li class="rounded-xl bg-surface-2 p-2 text-sm">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<span class="font-semibold">{b.keterangan ?? '-'} <span class="font-normal text-muted">· {b.kategori} · {formatWaktuWib(b.waktu)}</span></span>
						<span class="tabular font-bold">{rp(b.total)}</span>
					</div>
					<p class="text-muted">{outlets.map((o) => `${o.nama} ${rp(b.per_outlet[o.id] ?? 0)}`).join(' · ')}</p>
					<div class="mt-1 flex flex-wrap items-center gap-2">
						<label class="sr-only" for="alasan-{b.bagi_id}">Alasan pembatalan</label>
						<input id="alasan-{b.bagi_id}" bind:value={alasan[b.bagi_id]} maxlength="200" placeholder="Alasan batal, mis. salah input" class="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3" />
						<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan semua outlet" variant="ghost" onkonfirmasi={() => batal(b)} />
					</div>
					{#if pesanBaris[b.bagi_id]}<p class="mt-1 text-danger" role="alert">{pesanBaris[b.bagi_id]}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
