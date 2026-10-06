<script lang="ts">
	import FormStokAwal from '#lib/components/stok/FormStokAwal.svelte';
	import PitaSalinan from '#lib/components/stok/PitaSalinan.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { antrekan } from '#lib/kasir/antre.ts';
	import { buatKejadianBatalTransfer, buatKejadianKirim, buatKejadianUbah } from '#lib/kasir/offline-kasir.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { href } from '#lib/nav.ts';
	import { bentukIsian } from '#lib/stok/isian.ts';
	import { stokKasir } from '#lib/stok/stok-kasir.svelte.ts';
	import { angkaStok } from '#lib/stok/tampil.ts';
	import type { ItemHitung, Transfer } from '#lib/stok/types.ts';

	const st = stokKasir();
	let tujuan = $state('');
	let catatan = $state('');
	let diubah = $state<Transfer | null>(null);
	// id kiriman per formulir: kirim dua kali dari formulir yang sama tidak menggandakan.
	let id = $state(crypto.randomUUID());
	let tercatat = $state('');
	let alasan = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});

	const data = $derived(st.nilai?.data ?? null);
	const outlets = $derived(st.nilai?.outlets ?? []);
	const keluar = $derived((st.nilai?.transfer ?? []).filter((x) => x.dari_outlet_id === pos.outlet?.id && x.status === 'dikirim'));
	const isian = $derived(data ? bentukIsian(data.bahan, data.satuan, data.isi) : []);
	const lain = $derived(outlets.filter((o) => o.aktif && o.id !== pos.outlet?.id));
	const namaOutlet = (oid: string) => outlets.find((o) => o.id === oid)?.nama ?? '';
	const namaBahan = (bid: string) => data?.bahan.find((b) => b.id === bid)?.nama ?? '';

	async function kirim(item: ItemHitung[]) {
		const o = pos.outlet!.id;
		if (diubah) {
			await antrekan(buatKejadianUbah(o, diubah.id, item, catatan.trim() || null, new Date()));
			tercatat = `Kiriman ke ${namaOutlet(diubah.ke_outlet_id)} diubah.`;
			diubah = null;
		} else {
			if (!tujuan) throw new Error('Pilih outlet tujuan.');
			await antrekan(buatKejadianKirim(o, { id, keOutletId: tujuan, item, catatan }, new Date()));
			tercatat = `Tercatat kirim ke ${namaOutlet(tujuan)}. Menunggu outlet tujuan mengonfirmasi.`;
			id = crypto.randomUUID();
		}
		catatan = '';
	}

	async function batal(t: Transfer) {
		pesanBaris[t.id] = '';
		const a = (alasan[t.id] ?? '').trim();
		if (a.length < 3) {
			pesanBaris[t.id] = 'Alasan pembatalan wajib diisi (3–200 karakter).';
			return;
		}
		try {
			await antrekan(buatKejadianBatalTransfer(pos.outlet!.id, t.id, a, new Date()));
			if (diubah?.id === t.id) diubah = null;
		} catch (e) {
			pesanBaris[t.id] = (e as Error).message;
		}
	}

	// Kiriman yang sedang diubah sudah diterima/dibatalkan: tutup formulir ubah.
	$effect(() => {
		if (diubah && st.nilai && !keluar.some((t) => t.id === diubah!.id)) diubah = null;
	});
</script>

<svelte:head><title>Kirim ke Outlet Lain · Kasir D'Kriuk</title></svelte:head>

<a href={href('/kasir/stok')} class="text-sm text-brand underline">← Stok</a>
<h1 class="mt-1 font-display text-2xl">Kirim ke outlet lain</h1>

{#if st.status === 'gagal'}
	<p class="mt-4 text-danger" role="alert">{st.pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => st.ulang++}>Coba lagi</button>
{:else if !data}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else}
	<PitaSalinan salinanAt={st.nilai?.salinanAt ?? null} belumTerkirim={0} />
	{#if keluar.length}
		<section class="mt-4 grid gap-2" aria-label="Kiriman menunggu">
			<h2 class="font-display text-xl">Menunggu diterima</h2>
			{#each keluar as t (t.id)}
				<div class="rounded-2xl border border-line bg-surface p-3">
					<p class="font-semibold">Ke {namaOutlet(t.ke_outlet_id)} · {formatWaktuWib(t.dikirim_at)}{t.lokal ? ' · belum terkirim' : ''}</p>
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
