<script lang="ts">
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { daftarPenjualanShift, voidPenjualan } from '#lib/kasir/api.ts';
	import { labelMetode } from '#lib/kasir/bayar.ts';
	import { encodeStruk, urlRawBT } from '#lib/kasir/escpos.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { printer } from '#lib/kasir/printer.svelte.ts';
	import { dataStrukRiwayat } from '#lib/kasir/cetak.ts';
	import { barisStruk } from '#lib/kasir/struk.ts';
	import type { PenjualanRiwayat } from '#lib/kasir/types.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let daftar = $state<PenjualanRiwayat[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		if (!pos.shift) return;
		try {
			daftar = await daftarPenjualanShift(pos.shift.id);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	$effect(() => {
		if (pos.shift) void muat();
	});

	async function batal(p: PenjualanRiwayat) {
		pesanBaris[p.id] = '';
		try {
			await voidPenjualan(p.id, alasan[p.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[p.id] = (e as Error).message;
		}
	}

	const strukDari = (p: PenjualanRiwayat) => dataStrukRiwayat(pos.outlet!, auth.profile?.nama_tampilan ?? '', p, true);


	async function cetakUlang(p: PenjualanRiwayat) {
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
	<ul class="mt-4 grid gap-3">
		{#each daftar as p (p.id)}
			<li class="rounded-2xl border border-line bg-surface p-4 {p.void_at ? 'opacity-70' : ''}">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<p class="font-semibold">{p.nomor} <span class="text-sm font-normal text-muted">{formatWaktuWib(p.waktu)}</span></p>
					<p class="tabular font-bold {p.void_at ? 'line-through' : ''}">Rp{formatAngka(p.total)} · {labelMetode(p.metode)}</p>
				</div>
				<p class="mt-1 text-sm text-muted">{p.item.map((i) => `${i.qty}× ${i.nama}`).join(', ')}</p>
				{#if p.void_at}
					<p class="mt-1 text-sm font-semibold text-danger">Dibatalkan: {p.void_alasan}</p>
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
