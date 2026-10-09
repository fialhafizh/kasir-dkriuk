<script lang="ts">
	// Formulir tambah/ubah panel, berurutan: tampilan → sumber → ukuran → kelompok → saringan → periode; pratinjau langsung.
	import {
		JENIS_GRAFIK,
		JENIS_KHUSUS,
		JENIS_RIWAYAT,
		KATALOG,
		LABEL_JENIS,
		LABEL_KELOMPOK,
		LABEL_RIWAYAT,
		LABEL_SATUAN,
		LABEL_SUMBER,
		SATUAN_WAKTU,
		SUMBER,
		labelUkuran,
		type JenisPanel,
		type SatuanWaktu,
		type Sumber
	} from '#lib/dasbor/katalog.ts';
	import { LABEL_PERIODE, PERIODE } from '#lib/dasbor/periode.ts';
	import { pilihanSaringan, type Pilihan } from '#lib/dasbor/pilihan.ts';
	import { periksaSpek, type Panel, type SaringanDasbor, type Spek } from '#lib/dasbor/spek.ts';
	import { muatDataStok } from '#lib/stok/api.ts';
	import { susunStok } from '#lib/stok/tampil.ts';
	import type { Outlet } from '#lib/types/db.ts';
	import PanelDasbor from './PanelDasbor.svelte';

	let {
		awal,
		saringan,
		outlets,
		onsimpan,
		onbatal
	}: { awal: Panel; saringan: SaringanDasbor; outlets: Outlet[]; onsimpan: (p: Panel) => void; onbatal: () => void } = $props();

	// svelte-ignore state_referenced_locally
	let judul = $state(awal.judul);
	// svelte-ignore state_referenced_locally
	let jenis = $state<JenisPanel>(awal.jenis);
	// svelte-ignore state_referenced_locally
	let spek = $state<Spek>(structuredClone($state.snapshot(awal.spek)) as Spek);
	let pilihanNilai = $state<Record<string, Pilihan[]>>({});
	let barisStok = $state<{ kunci: string; label: string }[]>([]);
	let pesan = $state('');
	const sekarang = new Date();

	const grafik = $derived((JENIS_GRAFIK as readonly string[]).includes(jenis));
	const katalog = $derived(spek.sumber ? KATALOG[spek.sumber] : null);
	const kolomSaring = $derived((katalog?.kelompok ?? []).filter((k) => k !== 'waktu'));
	const galat = $derived(periksaSpek(jenis, spek));
	const draf = $derived<Panel>({ ...awal, judul: judul || 'Panel', jenis, spek: $state.snapshot(spek) as Spek });

	$effect(() => {
		if (jenis === 'siklus_stok' && !barisStok.length)
			void muatDataStok().then((d) => (barisStok = susunStok(d.bahan, d.satuan, d.isi, new Map()).map((b) => ({ kunci: b.kunci, label: b.label }))));
	});
	$effect(() => {
		for (const k of kolomSaring)
			if (spek.sumber && !pilihanNilai[`${spek.sumber}.${k}`]) {
				const kunci = `${spek.sumber}.${k}`;
				void pilihanSaringan(spek.sumber, k).then((p) => (pilihanNilai[kunci] = p));
			}
	});

	function gantiSumber(s: Sumber) {
		spek = { ...spek, sumber: s, ukuran: [KATALOG[s].ukuran[0]], kelompok: [], saringan: {}, urutan: undefined };
	}
	function ubahUkuran(u: string, nyala: boolean) {
		const ada = spek.ukuran ?? [];
		spek.ukuran = nyala ? [...ada.filter((x) => x !== u), u] : ada.filter((x) => x !== u);
	}
	function ubahKelompok(i: number, kolom: string) {
		const kel = [...(spek.kelompok ?? [])];
		if (!kolom) kel.splice(i);
		else kel[i] = { kolom, ...(kolom === 'waktu' ? { satuan: (kel[i]?.satuan ?? 'hari') as SatuanWaktu } : {}) };
		spek.kelompok = kel;
		if (!kel.length && spek.urutan?.oleh === 'kelompok') spek.urutan = undefined;
	}
	function ubahSaring(kolom: string, nilai: string, nyala: boolean) {
		const s = { ...(spek.saringan ?? {}) };
		const ada = s[kolom] ?? [];
		s[kolom] = nyala ? [...ada, nilai] : ada.filter((x) => x !== nilai);
		if (!s[kolom].length) delete s[kolom];
		spek.saringan = s;
	}
	function ubahRiwayat(j: string, nyala: boolean) {
		const ada = spek.jenis ?? [];
		spek.jenis = nyala ? [...ada, j] : ada.filter((x) => x !== j);
	}
	function simpan(e: SubmitEvent) {
		e.preventDefault();
		if (!judul.trim()) return void (pesan = 'Isi judul panel.');
		if (galat) return void (pesan = galat);
		onsimpan({ ...draf, judul: judul.trim() });
	}
	const kotak = 'min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg';
	const pil = 'min-h-10 rounded-lg border px-3 text-sm font-semibold';
</script>

<div class="fixed inset-0 z-20 overflow-y-auto bg-bg/95 p-4 backdrop-blur">
	<form class="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_minmax(0,26rem)]" onsubmit={simpan} novalidate>
		<div class="grid content-start gap-4">
			<h2 class="font-display text-2xl">{awal.id ? 'Ubah panel' : 'Tambah panel'}</h2>
			<label class="grid gap-1 text-sm font-semibold">Judul<input class={kotak} maxlength="60" bind:value={judul} /></label>

			<fieldset class="grid gap-2">
				<legend class="text-sm font-semibold">1. Jenis tampilan</legend>
				<div class="flex flex-wrap gap-2">
					{#each [...JENIS_GRAFIK, ...JENIS_KHUSUS] as j (j)}
						<button type="button" class="{pil} {jenis === j ? 'border-brand bg-brand text-on-brand' : 'border-line'}" aria-pressed={jenis === j} onclick={() => (jenis = j)}>{LABEL_JENIS[j]}</button>
					{/each}
				</div>
			</fieldset>

			{#if grafik}
				<label class="grid gap-1 text-sm font-semibold">
					2. Sumber data
					<select class={kotak} value={spek.sumber ?? ''} onchange={(e) => gantiSumber(e.currentTarget.value as Sumber)}>
						<option value="" disabled>Pilih…</option>
						{#each SUMBER as s (s)}<option value={s}>{LABEL_SUMBER[s]}</option>{/each}
					</select>
				</label>
				{#if katalog}
					<fieldset class="grid gap-1">
						<legend class="text-sm font-semibold">3. Ukuran</legend>
						{#each katalog.ukuran as u (u)}
							<label class="flex min-h-10 items-center gap-2 text-sm">
								<input type="checkbox" class="size-5" checked={spek.ukuran?.includes(u)} onchange={(e) => ubahUkuran(u, e.currentTarget.checked)} />{labelUkuran(u)}
							</label>
						{/each}
					</fieldset>
					{#if jenis !== 'angka'}
						<fieldset class="grid gap-2 sm:grid-cols-2">
							<legend class="text-sm font-semibold">4. Dikelompokkan per</legend>
							{#each [0, 1] as i (i)}
								{#if i === 0 || spek.kelompok?.[0]}
									<div class="flex gap-2">
										<select class="{kotak} flex-1" aria-label="Pengelompokan {i + 1}" value={spek.kelompok?.[i]?.kolom ?? ''} onchange={(e) => ubahKelompok(i, e.currentTarget.value)}>
											<option value="">{i === 0 ? 'Pilih…' : 'Tanpa pengelompokan kedua'}</option>
											{#each katalog.kelompok as k (k)}<option value={k}>{LABEL_KELOMPOK[k]}</option>{/each}
										</select>
										{#if spek.kelompok?.[i]?.kolom === 'waktu'}
											<select class={kotak} aria-label="Satuan waktu" bind:value={spek.kelompok[i].satuan}>
												{#each SATUAN_WAKTU as s (s)}<option value={s}>{LABEL_SATUAN[s]}</option>{/each}
											</select>
										{/if}
									</div>
								{/if}
							{/each}
						</fieldset>
					{/if}
					<details class="rounded-xl border border-line p-3">
						<summary class="cursor-pointer text-sm font-semibold">5. Saringan, urutan & batas (opsional)</summary>
						<div class="mt-2 grid gap-3">
							{#each kolomSaring as k (k)}
								{@const pil2 = pilihanNilai[`${spek.sumber}.${k}`] ?? []}
								<fieldset>
									<legend class="text-xs font-semibold text-muted">{LABEL_KELOMPOK[k]} {spek.saringan?.[k]?.length ? `(${spek.saringan[k].length})` : '(semua)'}</legend>
									<div class="flex max-h-32 flex-wrap gap-x-3 overflow-y-auto">
										{#each pil2 as p (p.nilai)}
											<label class="flex min-h-9 items-center gap-1.5 text-sm">
												<input type="checkbox" checked={spek.saringan?.[k]?.includes(p.nilai)} onchange={(e) => ubahSaring(k, p.nilai, e.currentTarget.checked)} />{p.label}
											</label>
										{/each}
									</div>
								</fieldset>
							{/each}
							<div class="flex flex-wrap gap-2">
								<select class={kotak} aria-label="Urutan" value={spek.urutan ? `${spek.urutan.oleh}.${spek.urutan.arah}` : ''}
									onchange={(e) => {
										const [oleh, arah] = e.currentTarget.value.split('.');
										spek.urutan = oleh ? { oleh: oleh as 'ukuran' | 'kelompok', arah: arah as 'naik' | 'turun' } : undefined;
									}}>
									<option value="">Urutan bawaan</option>
									<option value="ukuran.turun">Terbesar dulu</option>
									<option value="ukuran.naik">Terkecil dulu</option>
									{#if spek.kelompok?.length}<option value="kelompok.naik">Menurut kelompok</option>{/if}
								</select>
								<label class="flex items-center gap-2 text-sm">Tampilkan
									<input type="number" min="1" max="500" class="{kotak} w-24" value={spek.batas ?? ''} placeholder="semua"
										oninput={(e) => (spek.batas = e.currentTarget.value ? Math.trunc(Number(e.currentTarget.value)) : undefined)} /> baris</label>
							</div>
						</div>
					</details>
					{#if jenis === 'angka' || jenis === 'tabel'}
						<label class="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" class="size-5" bind:checked={spek.bandingkan} />Bandingkan dengan periode sebelumnya</label>
					{/if}
				{/if}
			{:else if jenis === 'siklus_stok'}
				<label class="grid gap-1 text-sm font-semibold">
					Bahan
					<select class={kotak} value={spek.kunci ?? ''} onchange={(e) => (spek.kunci = e.currentTarget.value || null)}>
						<option value="">Pilih di panel</option>
						{#each barisStok as b (b.kunci)}<option value={b.kunci}>{b.label}</option>{/each}
					</select>
				</label>
			{:else if jenis === 'riwayat'}
				<fieldset class="flex flex-wrap gap-x-4">
					<legend class="text-sm font-semibold">Jenis kejadian (kosong = semua)</legend>
					{#each JENIS_RIWAYAT as j (j)}
						<label class="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={spek.jenis?.includes(j)} onchange={(e) => ubahRiwayat(j, e.currentTarget.checked)} />{LABEL_RIWAYAT[j]}</label>
					{/each}
				</fieldset>
			{/if}

			<div class="grid gap-2 sm:grid-cols-2">
				<label class="grid gap-1 text-sm font-semibold">
					6. Periode panel
					<select class={kotak} value={spek.periode_kunci ?? ''} onchange={(e) => (spek.periode_kunci = (e.currentTarget.value || null) as Spek['periode_kunci'])}>
						<option value="">Ikut saringan atas</option>
						{#each PERIODE.filter((p) => p !== 'kustom') as p (p)}<option value={p}>Selalu {LABEL_PERIODE[p].toLowerCase()}</option>{/each}
					</select>
				</label>
				<label class="grid gap-1 text-sm font-semibold">
					Outlet panel
					<select class={kotak} value={spek.outlet_kunci ?? ''} onchange={(e) => (spek.outlet_kunci = e.currentTarget.value || null)}>
						<option value="">Ikut saringan atas</option>
						{#each outlets.filter((o) => o.aktif) as o (o.id)}<option value={o.id}>Selalu {o.nama}</option>{/each}
					</select>
				</label>
			</div>

			{#if pesan}<p class="text-sm text-danger" role="alert">{pesan}</p>{/if}
			<div class="flex gap-2">
				<button type="submit" class="min-h-12 rounded-xl bg-brand px-5 font-semibold text-on-brand">Pakai panel ini</button>
				<button type="button" class="min-h-12 rounded-xl bg-surface-2 px-5 font-semibold" onclick={onbatal}>Batal</button>
			</div>
		</div>

		<div class="grid content-start gap-2">
			<p class="text-sm font-semibold">Pratinjau</p>
			{#if galat}
				<p class="rounded-xl bg-surface-2 p-4 text-sm text-muted">{galat}</p>
			{:else}
				<div class="h-80"><PanelDasbor panel={draf} {saringan} {outlets} {sekarang} segar={0} /></div>
			{/if}
		</div>
	</form>
</div>
