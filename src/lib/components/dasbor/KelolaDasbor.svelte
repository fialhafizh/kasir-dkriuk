<script lang="ts">
	// Kelola daftar dasbor: buat baru / salin, ganti nama, jadikan utama, hapus, kembalikan bawaan.
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { hapusDasbor, jadikanUtama, kembalikanBawaan, simpanDasbor } from '#lib/dasbor/api.ts';
	import type { Dasbor } from '#lib/dasbor/spek.ts';

	let { daftar, dipilih, onubah }: { daftar: Dasbor[]; dipilih: string; onubah: (buka?: string) => Promise<void> } = $props();
	let namaBaru = $state('');
	let salinDari = $state('');
	let ganti = $state<Record<string, string>>({});
	let pesan = $state<{ teks: string; galat: boolean } | null>(null);
	let memproses = $state(false);

	async function jalankan(fn: () => Promise<string | void>, sukses: string) {
		if (memproses) return;
		memproses = true;
		pesan = null;
		try {
			const buka = await fn();
			await onubah(buka || undefined);
			pesan = { teks: sukses, galat: false };
		} catch (e) {
			pesan = { teks: (e as Error).message, galat: true };
		} finally {
			memproses = false;
		}
	}

	function buat(e: SubmitEvent) {
		e.preventDefault();
		const sumber = daftar.find((d) => d.id === salinDari);
		const nama = namaBaru.trim();
		if (!nama) return void (pesan = { teks: 'Isi nama dasbor.', galat: true });
		void jalankan(async () => {
			const id = await simpanDasbor({
				nama,
				saringan: sumber?.saringan ?? { outlet_id: null, periode: 'hari_ini' },
				panel: (sumber?.panel ?? []).map(({ id: _id, ...p }) => p)
			});
			namaBaru = '';
			return id;
		}, 'Dasbor dibuat.');
	}
	const simpanNama = (d: Dasbor) =>
		jalankan(async () => {
			await simpanDasbor({ id: d.id, nama: ganti[d.id] ?? d.nama, saringan: d.saringan, panel: d.panel });
			delete ganti[d.id];
		}, 'Nama disimpan.');
	const kotak = 'min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg';
	const tombol = 'min-h-10 rounded-lg bg-surface-2 px-3 text-sm font-semibold disabled:opacity-60';
</script>

<section class="mt-4 grid gap-4 rounded-2xl border border-line bg-surface p-4">
	<h2 class="font-display text-xl">Kelola dasbor</h2>
	<ul class="grid gap-2">
		{#each daftar as d (d.id)}
			<li class="flex flex-wrap items-center gap-2 rounded-xl border p-2 {d.id === dipilih ? 'border-brand' : 'border-line'}">
				<input aria-label="Nama dasbor" class="{kotak} min-w-0 flex-1" maxlength="40" value={ganti[d.id] ?? d.nama} oninput={(e) => (ganti[d.id] = e.currentTarget.value)} />
				{#if ganti[d.id] !== undefined && ganti[d.id] !== d.nama}
					<button type="button" class={tombol} disabled={memproses} onclick={() => simpanNama(d)}>Simpan nama</button>
				{/if}
				{#if d.utama}
					<span class="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">Utama</span>
				{:else}
					<button type="button" class={tombol} disabled={memproses} onclick={() => jalankan(() => jadikanUtama(d.id), 'Dasbor utama diganti.')}>Jadikan utama</button>
				{/if}
				{#if d.bawaan}
					<Konfirmasi label="Kembalikan bawaan" konfirmasiLabel="Ya, kembalikan" variant="ghost" onkonfirmasi={() => jalankan(() => kembalikanBawaan(), 'Isi Ringkasan dikembalikan.')} />
				{/if}
				{#if daftar.length > 1}
					<Konfirmasi label="Hapus" konfirmasiLabel="Ya, hapus" variant="ghost" onkonfirmasi={() => jalankan(() => hapusDasbor(d.id), 'Dasbor dihapus.')} />
				{/if}
			</li>
		{/each}
	</ul>
	<form class="flex flex-wrap items-end gap-2" onsubmit={buat}>
		<label class="grid gap-1 text-xs font-semibold">Nama dasbor baru<input class={kotak} maxlength="40" bind:value={namaBaru} placeholder="mis. Bulanan" /></label>
		<label class="grid gap-1 text-xs font-semibold">
			Isi awal
			<select class={kotak} bind:value={salinDari}>
				<option value="">Kosong</option>
				{#each daftar as d (d.id)}<option value={d.id}>Salin dari {d.nama}</option>{/each}
			</select>
		</label>
		<button type="submit" class="min-h-11 rounded-xl bg-brand px-4 font-semibold text-on-brand disabled:opacity-60" disabled={memproses}>Buat dasbor</button>
	</form>
	{#if pesan}<p class="text-sm {pesan.galat ? 'text-danger' : 'text-ok'}" role={pesan.galat ? 'alert' : 'status'}>{pesan.teks}</p>{/if}
</section>
