<script lang="ts">
	import { onMount } from 'svelte';
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { muatOutlets } from '#lib/master/api.ts';
	import { href } from '#lib/nav.ts';
	import { muatOpname, pratinjauOpname, putuskanOpname } from '#lib/stok/api-lanjut.ts';
	import { muatDataStok, type DataStok } from '#lib/stok/api.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import { isiPerBahan, selisihBesar } from '#lib/stok/opname.ts';
	import { angkaStok } from '#lib/stok/tampil.ts';
	import type { BarisPratinjau, ItemHitung, Opname } from '#lib/stok/types.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let outlets = $state<Outlet[]>([]);
	let data = $state<DataStok | null>(null);
	let ajuan = $state<Opname[]>([]);
	let pratinjau = $state<Record<string, BarisPratinjau[]>>({});
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	async function muat() {
		status = 'memuat';
		try {
			[outlets, data, ajuan] = await Promise.all([muatOutlets(), muatDataStok(), muatOpname()]);
			const menunggu = ajuan.filter((a) => a.status === 'diajukan');
			const p = await Promise.all(menunggu.map((a) => pratinjauOpname(a.id)));
			pratinjau = Object.fromEntries(menunggu.map((a, i) => [a.id, p[i]]));
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const isiPack = $derived(data ? isiPerBahan(data.satuan, data.isi) : new Map<string, number>());
	const nama = (id: string) => data?.bahan.find((b) => b.id === id)?.nama ?? '';
	const satuanBahan = (id: string) => data?.bahan.find((b) => b.id === id)?.satuan ?? '';
	const outlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '';
	const menunggu = $derived(ajuan.filter((a) => a.status === 'diajukan'));
	const selesai = $derived(ajuan.filter((a) => a.status !== 'diajukan'));

	async function setujui(a: Opname, item: ItemHitung[]) {
		await putuskanOpname(a.id, true, item, null);
		await muat();
	}
	async function tolak(a: Opname) {
		pesanBaris[a.id] = '';
		try {
			await putuskanOpname(a.id, false, null, alasan[a.id] ?? '');
			await muat();
		} catch (e) {
			pesanBaris[a.id] = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Opname · Admin · Kasir D'Kriuk</title></svelte:head>

<a href={href('/admin/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-3xl">Opname</h1>
<p class="mt-1 max-w-prose text-muted">Hitungan kasir dibandingkan angka sistem pada jam dihitung. Selisih besar ditandai. Betulkan bila perlu, lalu setujui.</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#if menunggu.length === 0}<p class="mt-6 rounded-xl bg-surface-2 p-4 text-sm text-muted">Tidak ada opname yang menunggu.</p>{/if}
	{#each menunggu as a (a.id)}
		<section class="mt-6 grid gap-3 rounded-2xl border-2 border-brand p-4" aria-label="Opname {outlet(a.outlet_id)}">
			<h2 class="font-display text-xl">{outlet(a.outlet_id)} — dihitung {formatWaktuWib(a.dihitung_at)}</h2>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead><tr class="text-left text-muted"><th class="py-1">Bahan</th><th class="text-right">Hitungan</th><th class="text-right">Sistem</th><th class="text-right">Selisih</th></tr></thead>
					<tbody>
						{#each pratinjau[a.id] ?? [] as p (p.bahan_id)}
							{@const besar = selisihBesar(p.qty_hitung, p.qty_sistem, isiPack.get(p.bahan_id))}
							<tr class="border-t border-line {besar ? 'font-semibold text-danger' : ''}">
								<td class="py-1">{nama(p.bahan_id)}</td>
								<td class="tabular text-right">{angkaStok(p.qty_hitung)} {satuanBahan(p.bahan_id)}</td>
								<td class="tabular text-right">{angkaStok(p.qty_sistem)}</td>
								<td class="tabular text-right">{p.qty_hitung - p.qty_sistem > 0 ? '+' : ''}{angkaStok(p.qty_hitung - p.qty_sistem)}{besar ? ' ⚠' : ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<details>
				<summary class="min-h-12 cursor-pointer py-3 font-semibold">Betulkan angka lalu setujui</summary>
				{#key a.id}
					<FormStokAwal {isian} awal={new Map((pratinjau[a.id] ?? []).map((p) => [p.bahan_id, p.qty_hitung]))} labelKirim="Setujui opname" onkirim={(item) => setujui(a, item)} />
				{/key}
			</details>
			<div class="flex flex-wrap items-center gap-2 border-t border-line pt-3">
				<label class="sr-only" for="tolak-{a.id}">Alasan penolakan</label>
				<input id="tolak-{a.id}" bind:value={alasan[a.id]} maxlength="200" placeholder="Alasan tolak, mis. hitung ulang ayam" class="min-h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3" />
				<Konfirmasi label="Tolak" konfirmasiLabel="Ya, tolak" variant="ghost" onkonfirmasi={() => tolak(a)} />
			</div>
			{#if pesanBaris[a.id]}<p class="text-sm text-danger" role="alert">{pesanBaris[a.id]}</p>{/if}
		</section>
	{/each}
	{#if selesai.length}
		<h2 class="mt-8 font-display text-xl">Riwayat</h2>
		<ul class="mt-2 grid gap-2">
			{#each selesai as a (a.id)}
				<li class="rounded-xl bg-surface-2 px-3 py-2 text-sm">
					<span class="font-semibold">{outlet(a.outlet_id)}</span> — {a.status === 'disetujui' ? 'Disetujui' : 'Ditolak'}, dihitung {formatWaktuWib(a.dihitung_at)}{a.catatan ? ` — ${a.catatan}` : ''}
				</li>
			{/each}
		</ul>
	{/if}
{/if}
