<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { batalTransfer, kirimTransfer, muatTransfer, ubahTransfer } from '#lib/stok/api-lanjut.ts';
	import { muatDataStok, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import { angkaStok } from '#lib/stok/tampil.ts';
	import type { ItemHitung, Transfer } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let data = $state<DataStok | null>(null);
	let outlets = $state<Outlet[]>([]);
	let keluar = $state<Transfer[]>([]);
	let pesan = $state('');
	let tujuan = $state('');
	let catatan = $state('');
	let diubah = $state<Transfer | null>(null);
	let id = $state(crypto.randomUUID());
	let tercatat = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		const o = pos.outlet!;
		pesan = '';
		try {
			const [d, os, t] = await Promise.all([muatDataStok(), muatOutlets(), muatTransfer(o.id)]);
			data = d;
			outlets = os;
			keluar = t.filter((x) => x.dari_outlet_id === o.id && x.status === 'dikirim');
		} catch (e) {
			pesan = (e as Error).message;
		}
	}
	$effect(() => {
		if (pos.outlet) void muat();
	});

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const lain = $derived(outlets.filter((o) => o.aktif && o.id !== pos.outlet?.id));
	const namaOutlet = (oid: string) => outlets.find((o) => o.id === oid)?.nama ?? '';
	const namaBahan = (bid: string) => data?.bahan.find((b) => b.id === bid)?.nama ?? '';

	async function kirim(item: ItemHitung[]) {
		if (diubah) {
			await ubahTransfer(diubah.id, item, catatan.trim() || null);
			tercatat = `Kiriman ke ${namaOutlet(diubah.ke_outlet_id)} diubah.`;
			diubah = null;
		} else {
			if (!tujuan) throw new Error('Pilih outlet tujuan.');
			await kirimTransfer({ id, dari_outlet_id: pos.outlet!.id, ke_outlet_id: tujuan, ...(catatan.trim() ? { catatan: catatan.trim() } : {}), item });
			tercatat = `Terkirim ke ${namaOutlet(tujuan)}. Menunggu outlet tujuan mengonfirmasi.`;
			id = crypto.randomUUID();
		}
		catatan = '';
		await muat();
	}

	async function batal(t: Transfer) {
		pesanBaris[t.id] = '';
		try {
			await batalTransfer(t.id, alasan[t.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[t.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Kirim ke Outlet Lain · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Kirim ke outlet lain</h1>

{#if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else if !data}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else}
	{#if keluar.length}
		<section class="mt-4 grid gap-2" aria-label="Kiriman menunggu">
			<h2 class="font-display text-xl">Menunggu diterima</h2>
			{#each keluar as t (t.id)}
				<div class="rounded-2xl border border-line bg-surface p-3">
					<p class="font-semibold">Ke {namaOutlet(t.ke_outlet_id)} · {formatWaktuWib(t.dikirim_at)}</p>
					<p class="text-sm text-muted">{t.item.map((i) => `${angkaStok(i.qty)} ${namaBahan(i.bahan_id)}`).join(', ')}</p>
					<div class="mt-2 flex flex-wrap items-center gap-2">
						<button type="button" class="min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => ((diubah = t), (catatan = t.catatan ?? ''))}>Ubah</button>
						<label class="sr-only" for="batal-{t.id}">Alasan batal</label>
						<input id="batal-{t.id}" bind:value={alasan[t.id]} maxlength="200" placeholder="Alasan batal" class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3" />
						<Konfirmasi label="Batalkan" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(t)} />
					</div>
					{#if pesanBaris[t.id]}<p class="mt-1 text-sm text-danger" role="alert">{pesanBaris[t.id]}</p>{/if}
				</div>
			{/each}
		</section>
	{/if}

	<section class="mt-6 grid gap-3" aria-label="Formulir kiriman">
		<h2 class="font-display text-xl">{diubah ? `Ubah kiriman ke ${namaOutlet(diubah.ke_outlet_id)}` : 'Kiriman baru'}</h2>
		{#if !diubah}
			<div class="grid gap-1.5">
				<label for="tujuan" class="text-sm font-semibold">Outlet tujuan</label>
				<select id="tujuan" bind:value={tujuan} class="min-h-12 rounded-xl border border-line-strong bg-surface px-3">
					<option value="">Pilih outlet…</option>
					{#each lain as o (o.id)}<option value={o.id}>{o.nama}</option>{/each}
				</select>
			</div>
		{/if}
		<div class="grid gap-1.5">
			<label for="catatan-kirim" class="text-sm font-semibold">Catatan (opsional)</label>
			<input id="catatan-kirim" bind:value={catatan} maxlength="200" aria-describedby="catatan-kirim-ket" class="min-h-12 rounded-xl border border-line-strong bg-surface px-3" />
			<p id="catatan-kirim-ket" class="text-xs text-muted">Jangan tulis jumlah barang di catatan — penerima harus menghitung sendiri.</p>
		</div>
		{#if tercatat}<p class="rounded-xl bg-surface-2 p-3 font-semibold text-ok" role="status">{tercatat}</p>{/if}
		{#key diubah?.id ?? id}
			<FormStokAwal
				{isian}
				opsional
				awal={new Map((diubah?.item ?? []).map((i) => [i.bahan_id, i.qty]))}
				labelKirim={diubah ? 'Simpan perubahan' : 'Kirim'}
				onkirim={kirim}
			/>
		{/key}
		{#if diubah}<button type="button" class="min-h-12 rounded-xl px-4 text-sm" onclick={() => (diubah = null)}>Batal mengubah</button>{/if}
	</section>
{/if}
