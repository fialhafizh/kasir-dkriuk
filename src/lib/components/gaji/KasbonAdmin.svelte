<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { batalPengeluaran } from '#lib/kas/admin.ts';
	import { catatKasbonAdmin, muatKasbon, type Kasbon, type RekapGaji } from '#lib/kas/gaji.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';

	let { outletId, rekap, hariIni, onubah }: { outletId: string; rekap: RekapGaji[]; hariIni: string; onubah: () => void } = $props();

	let daftar = $state<Kasbon[]>([]);
	let karyawanId = $state('');
	let nominal = $state('');
	let sumber = $state<'laci' | 'luar'>('luar');
	// Nilai awal saja; prop tidak berubah selama halaman terbuka.
	let tanggal = $state(untrack(() => hariIni));
	let ket = $state('');
	let pesan = $state('');
	let memproses = $state(false);
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		try {
			daftar = await muatKasbon(outletId, new Date(Date.now() - 62 * 86_400_000).toISOString());
		} catch (e) {
			pesan = (e as Error).message;
		}
	}
	$effect(() => {
		void outletId;
		void muat();
	});

	const nama = (id: string) => rekap.find((r) => r.karyawan_id === id)?.nama ?? '-';

	async function catat(e: SubmitEvent) {
		e.preventDefault();
		pesan = '';
		const n = parseRupiah(nominal);
		if (!karyawanId) return void (pesan = 'Pilih karyawan.');
		if (n === null || n < 1) return void (pesan = 'Isi nominal kasbon.');
		if (memproses) return;
		memproses = true;
		try {
			await catatKasbonAdmin({
				id: crypto.randomUUID(),
				outlet_id: outletId,
				karyawan_id: karyawanId,
				jumlah: n,
				sumber,
				...(ket.trim() ? { keterangan: ket.trim() } : {}),
				...(sumber === 'luar' ? { tanggal } : {})
			});
			nominal = '';
			ket = '';
			await muat();
			onubah();
		} catch (err) {
			pesan = (err as Error).message;
		} finally {
			memproses = false;
		}
	}

	async function batal(k: Kasbon) {
		pesanBaris[k.id] = '';
		try {
			await batalPengeluaran(k.id, alasan[k.id] ?? '');
			await muat();
			onubah();
		} catch (err) {
			pesanBaris[k.id] = (err as Error).message;
		}
	}
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<section aria-label="Kasbon">
	<h2 class="font-display text-2xl">Kasbon</h2>
	<p class="mt-1 text-sm text-muted">Kasbon dari laci juga bisa dicatat kasir di menu Kas. Sisa kasbon dipotong saat gajian.</p>
	<form class="mt-2 grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-3" onsubmit={catat} novalidate>
		<div class="grid gap-1">
			<label for="kb-karyawan" class="text-xs font-semibold text-muted">Karyawan</label>
			<select id="kb-karyawan" bind:value={karyawanId} class={kotak}>
				<option value="">Pilih…</option>
				{#each rekap.filter((r) => r.aktif) as r (r.karyawan_id)}<option value={r.karyawan_id}>{r.nama}</option>{/each}
			</select>
		</div>
		<div class="grid gap-1">
			<label for="kb-nominal" class="text-xs font-semibold text-muted">Nominal</label>
			<input id="kb-nominal" bind:value={nominal} inputmode="numeric" class="tabular text-right {kotak}" />
		</div>
		<div class="grid gap-1">
			<label for="kb-sumber" class="text-xs font-semibold text-muted">Diambil dari</label>
			<select id="kb-sumber" bind:value={sumber} class={kotak}>
				<option value="luar">Owner (laci tidak berubah)</option>
				<option value="laci">Laci outlet (sekarang)</option>
			</select>
		</div>
		{#if sumber === 'luar'}
			<div class="grid gap-1">
				<label for="kb-tgl" class="text-xs font-semibold text-muted">Tanggal</label>
				<input id="kb-tgl" type="date" bind:value={tanggal} max={hariIni} class={kotak} />
			</div>
		{/if}
		<div class="grid gap-1 sm:col-span-2">
			<label for="kb-ket" class="text-xs font-semibold text-muted">Keterangan (opsional)</label>
			<input id="kb-ket" bind:value={ket} maxlength="200" class={kotak} />
		</div>
		{#if pesan}<p class="text-sm text-danger sm:col-span-3" role="alert">{pesan}</p>{/if}
		<div class="sm:col-span-3"><Button type="submit" loading={memproses}>Catat kasbon</Button></div>
	</form>
	{#if daftar.length}
		<ul class="mt-2 grid gap-2">
			{#each daftar as k (k.id)}
				<li class="rounded-2xl border border-line bg-surface p-3 {k.batal_at ? 'opacity-70' : ''}">
					<p class="flex flex-wrap justify-between gap-2">
						<span class="font-semibold">{nama(k.karyawan_id)} · {k.sumber === 'laci' ? 'dari laci' : 'dari owner'}</span>
						<span class="tabular font-bold {k.batal_at ? 'line-through' : ''}">Rp{formatAngka(k.jumlah)}</span>
					</p>
					<p class="text-sm text-muted">{formatWaktuWib(k.waktu)}{k.keterangan ? ` · ${k.keterangan}` : ''}</p>
					{#if k.batal_at}
						<p class="text-sm text-danger">Dibatalkan: {k.batal_alasan}</p>
					{:else}
						<div class="mt-2 flex flex-wrap items-center gap-2">
							<label class="sr-only" for="kb-alasan-{k.id}">Alasan batal</label>
							<input id="kb-alasan-{k.id}" bind:value={alasan[k.id]} maxlength="200" placeholder="Alasan batal" class="min-w-0 flex-1 {kotak}" />
							<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(k)} />
						</div>
					{/if}
					{#if pesanBaris[k.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[k.id]}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
