<script lang="ts">
	import { simpanKaryawan, type Karyawan } from '#lib/kas/gaji.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';

	let { outletId, karyawan, onubah }: { outletId: string; karyawan: Karyawan[]; onubah: () => void } = $props();

	let nama = $state('');
	let upah = $state('');
	let pesan = $state('');
	let memproses = $state(false);
	let upahUbah = $state<Record<string, string>>({});
	let pesanBaris = $state<Record<string, string>>({});
	const milik = $derived(karyawan.filter((k) => k.outlet_id === outletId));

	async function tambah(e: SubmitEvent) {
		e.preventDefault();
		pesan = '';
		const u = parseRupiah(upah);
		if (u === null) return void (pesan = 'Isi upah harian, mis. 70.000.');
		if (memproses) return;
		memproses = true;
		try {
			await simpanKaryawan({ outlet_id: outletId, nama, upah_harian: u });
			nama = '';
			upah = '';
			onubah();
		} catch (err) {
			pesan = (err as Error).message;
		} finally {
			memproses = false;
		}
	}

	async function simpan(k: Karyawan, ubah: { upah_harian?: number; aktif?: boolean }) {
		pesanBaris[k.id] = '';
		try {
			await simpanKaryawan({ id: k.id, nama: k.nama, upah_harian: ubah.upah_harian ?? k.upah_harian, ...(ubah.aktif !== undefined ? { aktif: ubah.aktif } : {}) });
			onubah();
		} catch (err) {
			pesanBaris[k.id] = (err as Error).message;
		}
	}
	function simpanUpah(k: Karyawan) {
		const u = parseRupiah(upahUbah[k.id] ?? '');
		if (u === null) return void (pesanBaris[k.id] = 'Upah tidak sah.');
		void simpan(k, { upah_harian: u });
	}
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<section aria-label="Karyawan">
	<h2 class="font-display text-2xl">Karyawan</h2>
	<p class="mt-1 text-sm text-muted">Data karyawan terpisah dari akun aplikasi. Upah baru berlaku untuk gaji yang belum dibayar.</p>
	<ul class="mt-2 grid gap-2">
		{#each milik as k (k.id)}
			<li class="flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface p-3 {k.aktif ? '' : 'opacity-60'}">
				<p class="min-w-32 flex-1 font-semibold">{k.nama}</p>
				<div class="grid gap-1">
					<label for="upah-{k.id}" class="text-xs font-semibold text-muted">Upah harian</label>
					<input id="upah-{k.id}" value={upahUbah[k.id] ?? formatAngka(k.upah_harian)} oninput={(e) => (upahUbah[k.id] = e.currentTarget.value)} inputmode="numeric" class="tabular w-32 text-right {kotak}" />
				</div>
				<button type="button" class="min-h-12 rounded-xl bg-surface-2 px-3 text-sm font-semibold" onclick={() => simpanUpah(k)}>Simpan upah</button>
				<button type="button" class="min-h-12 rounded-xl bg-surface-2 px-3 text-sm" onclick={() => simpan(k, { aktif: !k.aktif })}>{k.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
				{#if pesanBaris[k.id]}<p class="w-full text-sm text-danger" role="alert">{pesanBaris[k.id]}</p>{/if}
			</li>
		{/each}
	</ul>
	<form class="mt-3 flex flex-wrap items-end gap-2" onsubmit={tambah} novalidate>
		<div class="grid min-w-0 flex-1 gap-1">
			<label for="kar-nama" class="text-xs font-semibold text-muted">Nama karyawan baru</label>
			<input id="kar-nama" bind:value={nama} maxlength="60" class={kotak} />
		</div>
		<div class="grid gap-1">
			<label for="kar-upah" class="text-xs font-semibold text-muted">Upah harian</label>
			<input id="kar-upah" bind:value={upah} inputmode="numeric" class="tabular w-32 text-right {kotak}" />
		</div>
		<button type="submit" disabled={memproses} class="min-h-12 rounded-xl bg-brand px-4 font-semibold text-on-brand disabled:opacity-60">Tambah</button>
	</form>
	{#if pesan}<p class="mt-1 text-sm text-danger" role="alert">{pesan}</p>{/if}
</section>
