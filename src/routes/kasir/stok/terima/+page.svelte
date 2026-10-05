<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatTransfer, terimaTransfer } from '#lib/stok/api-lanjut.ts';
	import { muatDataStok, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import type { ItemHitung, Transfer } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let data = $state<DataStok | null>(null);
	let outlets = $state<Outlet[]>([]);
	let masuk = $state<Transfer[]>([]);
	let dipilih = $state<Transfer | null>(null);
	let pesan = $state('');
	let tercatat = $state('');

	async function muat() {
		const o = pos.outlet!;
		pesan = '';
		try {
			const [d, os, t] = await Promise.all([muatDataStok(), muatOutlets(), muatTransfer(o.id)]);
			data = d;
			outlets = os;
			masuk = t.filter((x) => x.ke_outlet_id === o.id && x.status === 'dikirim');
		} catch (e) {
			pesan = (e as Error).message;
		}
	}
	$effect(() => {
		if (pos.outlet) void muat();
	});

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const namaOutlet = (oid: string) => outlets.find((o) => o.id === oid)?.nama ?? '';

	async function terima(item: ItemHitung[]) {
		const t = dipilih!;
		await terimaTransfer(t.id, item);
		tercatat = `Kiriman dari ${namaOutlet(t.dari_outlet_id)} diterima. Stok sudah bertambah.`;
		dipilih = null;
		await muat();
	}
</script>

<svelte:head><title>Terima Kiriman · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Terima kiriman</h1>

{#if pesan}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else if !data}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else}
	{#if tercatat}<p class="mt-4 rounded-xl bg-surface-2 p-3 font-semibold text-ok" role="status">{tercatat}</p>{/if}
	{#if dipilih}
		<section class="mt-4 grid gap-3" aria-label="Konfirmasi kiriman">
			<h2 class="font-display text-xl">Dari {namaOutlet(dipilih.dari_outlet_id)} · {formatWaktuWib(dipilih.dikirim_at)}</h2>
			<!-- Catatan pengirim tidak ditampilkan sebelum diterima: bisa berisi jumlah (hitung buta). -->
			<p class="text-sm">Hitung barang yang benar-benar datang, lalu isi jumlahnya. Angka harus sama dengan yang dikirim.</p>
			{#key dipilih.id}<FormStokAwal {isian} opsional labelKirim="Konfirmasi terima" onkirim={terima} />{/key}
			<button type="button" class="min-h-12 rounded-xl px-4 text-sm" onclick={() => (dipilih = null)}>Kembali ke daftar</button>
		</section>
	{:else if masuk.length === 0}
		<p class="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-muted">Tidak ada kiriman yang menunggu.</p>
	{:else}
		<ul class="mt-4 grid gap-2">
			{#each masuk as t (t.id)}
				<li>
					<button type="button" class="flex min-h-14 w-full flex-col items-start rounded-2xl border border-line bg-surface px-4 py-2 text-left hover:border-brand" onclick={() => ((dipilih = t), (tercatat = ''))}>
						<span class="font-semibold">Dari {namaOutlet(t.dari_outlet_id)}</span>
						<span class="text-sm text-muted">Dikirim {formatWaktuWib(t.dikirim_at)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
