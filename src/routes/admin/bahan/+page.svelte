<script lang="ts">
	import { onMount } from 'svelte';
	import QtyInput from '#lib/components/ui/QtyInput.svelte';
	import { rantai } from '#lib/master/antrian.ts';
	import {
		muatBahan,
		muatIsiSatuanBeli,
		muatMenu,
		muatResep,
		muatSatuanBeli,
		simpanAktifBahan,
		simpanAmbang,
		simpanIsiSatuanBeli
	} from '#lib/master/api.ts';
	import { menuPemakai } from '#lib/master/susun.ts';
	import type { Bahan, IsiSatuanBeli, Menu, ModeStok, Resep, SatuanBeli } from '#lib/master/types.ts';

	let bahan = $state<Bahan[]>([]);
	let satuan = $state<SatuanBeli[]>([]);
	let isi = $state<IsiSatuanBeli[]>([]);
	let menu = $state<Menu[]>([]);
	let resep = $state<Resep[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesanMuat = $state('');
	// Pesan ditampilkan di dekat baris yang bermasalah, bukan di atas halaman.
	let pesanSatuan = $state<Record<string, string>>({});
	let pesanBahan = $state<Record<string, string>>({});
	let menyimpanAktif = $state<Record<string, boolean>>({});

	const MODE: Record<ModeStok, string> = {
		otomatis: 'Dipotong otomatis saat terjual',
		catat: 'Hanya dicatat saat dibeli',
		analisis: 'Dianalisis (tidak dipotong)'
	};

	async function muat() {
		status = 'memuat';
		try {
			[bahan, satuan, isi, menu, resep] = await Promise.all([muatBahan(), muatSatuanBeli(), muatIsiSatuanBeli(), muatMenu(), muatResep()]);
			status = 'siap';
		} catch (e) {
			pesanMuat = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const cariBahan = (id: string) => bahan.find((b) => b.id === id);
	const isiDari = (s: SatuanBeli) => isi.filter((i) => i.satuan_beli_id === s.id);

	// Semua perubahan satu satuan beli (isi & ambang) dijalankan berurutan supaya tidak saling menimpa.
	const antrian = new Map<string, ReturnType<typeof rantai>>();
	const jalankan = <R,>(s: SatuanBeli, tugas: () => Promise<R>) => {
		if (!antrian.has(s.id)) antrian.set(s.id, rantai());
		return antrian.get(s.id)!(tugas);
	};

	function ubahIsi(s: SatuanBeli, bahanId: string, qty: number) {
		return jalankan(s, async () => {
			const sebelum = isiDari(s).find((i) => i.bahan_id === bahanId)?.qty;
			isi = isi.map((i) => (i.satuan_beli_id === s.id && i.bahan_id === bahanId ? { ...i, qty } : i));
			try {
				await simpanIsiSatuanBeli(s.id, isiDari(s).map((i) => ({ bahan_id: i.bahan_id, qty: i.qty })));
			} catch (e) {
				if (sebelum !== undefined) {
					isi = isi.map((i) => (i.satuan_beli_id === s.id && i.bahan_id === bahanId ? { ...i, qty: sebelum } : i));
				}
				throw e;
			}
		});
	}

	function aturAmbang(s: SatuanBeli, nilai: number | null) {
		return jalankan(s, async () => {
			await simpanAmbang(s.id, nilai);
			satuan = satuan.map((x) => (x.id === s.id ? { ...x, ambang: nilai } : x));
			pesanSatuan[s.id] = '';
		});
	}

	async function berhentiPantau(s: SatuanBeli) {
		try {
			await aturAmbang(s, null);
		} catch (e) {
			pesanSatuan[s.id] = (e as Error).message;
		}
	}

	async function ubahAktif(e: Event & { currentTarget: HTMLInputElement }, b: Bahan) {
		const kotak = e.currentTarget;
		const target = kotak.checked;
		menyimpanAktif[b.id] = true;
		try {
			await simpanAktifBahan(b.id, target);
			bahan = bahan.map((x) => (x.id === b.id ? { ...x, aktif: target } : x));
			pesanBahan[b.id] = '';
		} catch (err) {
			kotak.checked = b.aktif;
			pesanBahan[b.id] = (err as Error).message;
		} finally {
			menyimpanAktif[b.id] = false;
		}
	}
</script>

<svelte:head><title>Bahan · Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Bahan & Satuan Beli</h1>
<p class="mt-1 max-w-prose text-muted">
	Satuan beli adalah bentuk barang saat datang (pack, karung, kg). Peringatan stok menipis dihitung dalam satuan beli, mis. kurang dari 10 pack.
</p>

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesanMuat}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	<h2 class="mt-8 font-display text-2xl">Satuan beli</h2>
	<ul class="mt-3 grid gap-3">
		{#each satuan as s (s.id)}
			<li class="rounded-2xl border border-line bg-surface p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="font-semibold">
							{s.nama}
							{#if !s.aktif}<span class="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Nonaktif</span>{/if}
						</p>
						<p class="text-xs text-muted">{s.harga_tetap ? 'Harga tetap' : 'Harga berubah-ubah (diisi saat barang masuk)'}</p>
					</div>
					<div class="grid gap-1">
						<p class="text-xs font-semibold text-muted">Stok menipis bila kurang dari</p>
						<div class="flex flex-wrap items-center gap-2">
							<QtyInput
								id="ambang-{s.id}"
								label="Stok {s.nama} menipis bila kurang dari"
								nilai={s.ambang}
								satuan="satuan beli"
								desimal={2}
								onsimpan={(n) => aturAmbang(s, n)}
							/>
							{#if s.ambang == null}
								<span class="text-xs text-muted">Tidak dipantau</span>
							{:else}
								<button
									type="button"
									class="min-h-12 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus"
									onclick={() => berhentiPantau(s)}
								>
									Berhenti pantau
								</button>
							{/if}
						</div>
						{#if pesanSatuan[s.id]}<p class="text-xs text-danger" role="alert">{pesanSatuan[s.id]}</p>{/if}
					</div>
				</div>
				<p class="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Isi per {s.nama.toLowerCase()}</p>
				<ul class="mt-1 grid gap-2 sm:grid-cols-2">
					{#each isiDari(s) as i (i.bahan_id)}
						{@const b = cariBahan(i.bahan_id)}
						<li class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-1">
							<span class="min-w-0 text-sm">
								{b?.nama ?? 'Bahan tidak dikenal'}{#if b && !b.aktif}<span class="text-muted"> (nonaktif)</span>{/if}
							</span>
							<QtyInput
								id="isi-{s.id}-{i.bahan_id}"
								label="Isi {b?.nama ?? 'bahan'} per {s.nama}"
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
			{@const pemakai = menuPemakai(b.id, resep, menu)}
			<li class="rounded-2xl border border-line bg-surface px-4 py-2">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="min-w-0">
						<p class="font-semibold {b.aktif ? '' : 'text-muted line-through'}">{b.nama}</p>
						<p class="text-xs text-muted">Satuan stok: {b.satuan} · {MODE[b.mode]}</p>
					</div>
					<label class="flex min-h-12 items-center gap-2 text-sm">
						<input
							type="checkbox"
							class="size-5 accent-brand"
							checked={b.aktif}
							disabled={menyimpanAktif[b.id]}
							onchange={(e) => ubahAktif(e, b)}
						/>
						Aktif
					</label>
				</div>
				{#if b.aktif && pemakai.length > 0}
					<p class="mt-1 text-xs text-muted">
						Dipakai di resep: {pemakai.join(', ')}. Bila dinonaktifkan, resep itu harus diganti bahannya sebelum bisa disimpan ulang.
					</p>
				{/if}
				{#if pesanBahan[b.id]}<p class="mt-1 text-xs text-danger" role="alert">{pesanBahan[b.id]}</p>{/if}
			</li>
		{/each}
	</ul>
{/if}
