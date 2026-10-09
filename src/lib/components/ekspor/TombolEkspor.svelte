<script lang="ts">
	// Tombol Excel (dan Cetak bila diminta) untuk data yang sedang tampil.
	import { unduhExcel, type Lembar } from '#lib/ekspor/unduh.ts';

	let {
		judul,
		lembar,
		cetak = false,
		kecil = false
	}: { judul: string; lembar: () => Lembar[]; cetak?: boolean; kecil?: boolean } = $props();
	let galat = $state('');
	let proses = $state(false);

	async function unduh() {
		if (proses) return;
		proses = true;
		galat = '';
		try {
			await unduhExcel(judul, lembar());
		} catch (e) {
			galat = `Gagal membuat Excel: ${(e as Error).message}`;
		} finally {
			proses = false;
		}
	}
	const tombol = $derived(kecil ? 'min-h-8 rounded-lg px-2 text-xs' : 'min-h-11 rounded-xl px-4 text-sm');
</script>

<span class="tanpa-cetak inline-flex flex-wrap items-center gap-1">
	<button type="button" class="{tombol} bg-surface-2 font-semibold text-fg disabled:opacity-60" disabled={proses} onclick={unduh} title="Unduh sebagai Excel">
		Excel
	</button>
	{#if cetak}
		<button type="button" class="{tombol} bg-surface-2 font-semibold text-fg" onclick={() => print()} title="Cetak atau simpan sebagai PDF">Cetak</button>
	{/if}
	{#if galat}<span class="text-xs text-danger" role="alert">{galat}</span>{/if}
</span>
