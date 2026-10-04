<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import { tanggalWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { HargaBeli, SatuanBeli } from '#lib/master/types.ts';
	import { hargaAwal, hargaOutlet, periksaBarangMasuk, type BarisMasuk } from '#lib/stok/masuk.ts';
	import type { KirimBarangMasuk } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let {
		outlet,
		satuan,
		hargaBeli,
		onsimpan
	}: { outlet: Outlet; satuan: SatuanBeli[]; hargaBeli: HargaBeli[]; onsimpan: (p: KirimBarangMasuk) => Promise<void> } = $props();

	const hariIni = tanggalWib(new Date());
	const batasBawah = tanggalWib(new Date(Date.now() - 7 * 86_400_000));
	// id dibuat sekali per formulir: simpan ditekan dua kali tidak menggandakan.
	let id = $state(crypto.randomUUID());
	let tanggal = $state(hariIni);
	let catatan = $state('');
	let baris = $state<BarisMasuk[]>([]);
	let pilihan = $state('');
	let menyimpan = $state(false);
	let pesan = $state('');
	let tercatat = $state('');

	const aktif = $derived(satuan.filter((s) => s.aktif));
	const cek = $derived(periksaBarangMasuk(baris, satuan));
	const nama = (sid: string) => satuan.find((s) => s.id === sid)?.nama ?? '';
	const tetap = (sid: string) => satuan.find((s) => s.id === sid)?.harga_tetap ?? true;
	const kotak =
		'tabular min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-right text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none';

	function tambahBaris() {
		const s = satuan.find((x) => x.id === pilihan);
		if (!s) return;
		baris = [...baris, { satuan_beli_id: s.id, qty: '1', harga: hargaAwal(s, hargaBeli, outlet.id) }];
		pilihan = '';
	}

	async function simpan(e: SubmitEvent) {
		e.preventDefault();
		pesan = '';
		tercatat = '';
		if (baris.length === 0) {
			pesan = 'Tambahkan minimal satu barang.';
			return;
		}
		if (cek.galat.some(Boolean)) {
			pesan = 'Periksa baris yang ditandai merah.';
			return;
		}
		menyimpan = true;
		try {
			await onsimpan({ id, outlet_id: outlet.id, tanggal, ...(catatan.trim() ? { catatan: catatan.trim() } : {}), item: cek.item });
			tercatat = `Tersimpan: Rp${formatAngka(cek.total)} masuk ke ${outlet.nama}.`;
			id = crypto.randomUUID();
			baris = [];
			catatan = '';
			tanggal = hariIni;
		} catch (err) {
			pesan = (err as Error).message;
		} finally {
			menyimpan = false;
		}
	}
</script>

<form class="grid gap-4 rounded-2xl border border-line bg-surface p-4" onsubmit={simpan} novalidate>
	<h2 class="font-display text-xl">Catat barang masuk — {outlet.nama}</h2>
	<div class="grid gap-1.5">
		<label for="tanggal-masuk" class="text-sm font-semibold">Tanggal barang datang</label>
		<input id="tanggal-masuk" type="date" bind:value={tanggal} min={batasBawah} max={hariIni} class="{kotak} w-48 text-left" />
	</div>

	<div class="flex flex-wrap items-end gap-2">
		<div class="grid min-w-0 flex-1 gap-1.5">
			<label for="pilih-barang" class="text-sm font-semibold">Barang</label>
			<select id="pilih-barang" bind:value={pilihan} class="{kotak} text-left">
				<option value="">Pilih barang…</option>
				{#each aktif as s (s.id)}<option value={s.id}>{s.nama}</option>{/each}
			</select>
		</div>
		<Button variant="secondary" onclick={tambahBaris} disabled={!pilihan}>Tambah</Button>
	</div>

	{#if baris.length}
		<ul class="grid gap-2">
			{#each baris as r, i (r.satuan_beli_id + i)}
				<li class="grid gap-2 rounded-xl bg-surface-2 p-3">
					<p class="font-semibold">{nama(r.satuan_beli_id)}</p>
					<div class="flex flex-wrap items-center gap-2">
						<input aria-label="Jumlah {nama(r.satuan_beli_id)}" bind:value={r.qty} inputmode="decimal" class="{kotak} w-24" />
						<span class="text-sm text-muted">×</span>
						<span class="text-sm text-muted">Rp</span>
						<input
							aria-label="Harga per satuan {nama(r.satuan_beli_id)}"
							bind:value={r.harga}
							inputmode="numeric"
							placeholder={tetap(r.satuan_beli_id)
								? ''
								: hargaOutlet(r.satuan_beli_id, hargaBeli, outlet.id) === null
									? 'isi harga'
									: `acuan ${formatAngka(hargaOutlet(r.satuan_beli_id, hargaBeli, outlet.id)!)}`}
							class="{kotak} w-36"
						/>
						<button
							type="button"
							class="ml-auto min-h-12 rounded-xl px-3 text-sm text-danger hover:bg-surface"
							onclick={() => (baris = baris.filter((_, j) => j !== i))}>Hapus</button
						>
					</div>
					{#if cek.galat[i]}<p class="text-sm text-danger" role="alert">{cek.galat[i]}</p>{/if}
				</li>
			{/each}
		</ul>
		<p class="flex items-baseline justify-between text-lg font-bold">
			<span>Total</span><span class="tabular font-display text-2xl text-brand">Rp{formatAngka(cek.total)}</span>
		</p>
	{/if}

	<div class="grid gap-1.5">
		<label for="catatan-masuk" class="text-sm font-semibold">Catatan (opsional)</label>
		<input id="catatan-masuk" bind:value={catatan} maxlength="200" class="{kotak} text-left" placeholder="mis. dari stokis Pak Budi" />
	</div>
	{#if pesan}<p class="text-sm font-semibold text-danger" role="alert">{pesan}</p>{/if}
	{#if tercatat}<p class="text-sm font-semibold text-ok" role="status">{tercatat}</p>{/if}
	<Button type="submit" class="min-h-14 text-lg" loading={menyimpan}>Simpan barang masuk</Button>
</form>
