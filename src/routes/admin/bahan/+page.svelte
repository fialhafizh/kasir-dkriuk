<script lang="ts">
	import { onMount } from 'svelte';
	import QtyInput from '#lib/components/ui/QtyInput.svelte';
	import { muatBahan, muatIsiSatuanBeli, muatSatuanBeli, simpanAktifBahan, simpanAmbang, simpanIsiSatuanBeli } from '#lib/master/api.ts';
	import type { Bahan, IsiSatuanBeli, ModeStok, SatuanBeli } from '#lib/master/types.ts';

	let bahan = $state<Bahan[]>([]);
	let satuan = $state<SatuanBeli[]>([]);
	let isi = $state<IsiSatuanBeli[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');

	const MODE: Record<ModeStok, string> = {
		otomatis: 'Dipotong otomatis saat terjual',
		catat: 'Hanya dicatat saat dibeli',
		analisis: 'Dianalisis (tidak dipotong)'
	};

	async function muat() {
		status = 'memuat';
		try {
			[bahan, satuan, isi] = await Promise.all([muatBahan(), muatSatuanBeli(), muatIsiSatuanBeli()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const namaBahan = (id: string) => bahan.find((b) => b.id === id);
	const isiDari = (s: SatuanBeli) => isi.filter((i) => i.satuan_beli_id === s.id);

	async function ubahIsi(s: SatuanBeli, bahanId: string, qty: number) {
		const baru = isiDari(s).map((i) => ({ bahan_id: i.bahan_id, qty: i.bahan_id === bahanId ? qty : i.qty }));
		await simpanIsiSatuanBeli(s.id, baru);
		isi = isi.map((i) => (i.satuan_beli_id === s.id && i.bahan_id === bahanId ? { ...i, qty } : i));
	}

	async function ubahAmbang(s: SatuanBeli, nilai: number) {
		await simpanAmbang(s.id, nilai);
		satuan = satuan.map((x) => (x.id === s.id ? { ...x, ambang: nilai } : x));
	}

	async function hapusAmbang(s: SatuanBeli) {
		await simpanAmbang(s.id, null);
		satuan = satuan.map((x) => (x.id === s.id ? { ...x, ambang: null } : x));
	}

	async function ubahAktif(b: Bahan) {
		try {
			await simpanAktifBahan(b.id, !b.aktif);
			bahan = bahan.map((x) => (x.id === b.id ? { ...x, aktif: !b.aktif } : x));
		} catch (e) {
			pesan = (e as Error).message;
		}
	}
</script>

<svelte:head><title>Bahan · Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Bahan & Satuan Beli</h1>
<p class="mt-1 max-w-prose text-muted">
	Satuan beli adalah bentuk barang saat datang (pack, karung, kg). Ambang stok menipis dihitung dalam satuan beli, mis. 10 pack.
</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#if pesan}<p class="mt-4 text-danger" role="alert">{pesan}</p>{/if}

	<h2 class="mt-8 font-display text-2xl">Satuan beli</h2>
	<ul class="mt-3 grid gap-3">
		{#each satuan as s (s.id)}
			<li class="rounded-2xl border border-line bg-surface p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="font-semibold">{s.nama}</p>
						<p class="text-xs text-muted">{s.harga_tetap ? 'Harga tetap' : 'Harga berubah-ubah (diisi saat barang masuk)'}</p>
					</div>
					<div class="flex flex-wrap items-end gap-2">
						<QtyInput
							id="ambang-{s.id}"
							label="Ambang stok menipis {s.nama}"
							nilai={s.ambang}
							satuan="satuan beli"
							desimal={2}
							onsimpan={(n) => ubahAmbang(s, n)}
						/>
						{#if s.ambang != null}
							<button type="button" class="min-h-12 rounded-xl px-3 text-sm text-muted hover:bg-surface-2" onclick={() => hapusAmbang(s)}>
								Tidak dipantau
							</button>
						{/if}
					</div>
				</div>
				<p class="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Isi</p>
				<ul class="mt-1 grid gap-2 sm:grid-cols-2">
					{#each isiDari(s) as i (i.bahan_id)}
						{@const b = namaBahan(i.bahan_id)}
						<li class="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-1">
							<span class="text-sm">{b?.nama ?? 'Bahan tidak dikenal'}</span>
							<QtyInput
								id="isi-{s.id}-{i.bahan_id}"
								label="Isi {b?.nama} per {s.nama}"
								nilai={i.qty}
								satuan={b?.satuan ?? ''}
								onsimpan={(n) => ubahIsi(s, i.bahan_id, n)}
							/>
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>

	<h2 class="mt-10 font-display text-2xl">Bahan baku</h2>
	<ul class="mt-3 grid gap-2">
		{#each bahan as b (b.id)}
			<li class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2">
				<div class="min-w-0">
					<p class="font-semibold {b.aktif ? '' : 'text-muted line-through'}">{b.nama}</p>
					<p class="text-xs text-muted">Satuan stok: {b.satuan} · {MODE[b.mode]}</p>
				</div>
				<label class="flex min-h-12 items-center gap-2 text-sm">
					<input type="checkbox" class="size-5 accent-brand" checked={b.aktif} onchange={() => ubahAktif(b)} />
					Aktif
				</label>
			</li>
		{/each}
	</ul>
{/if}
