<script lang="ts">
	// Tombol dua langkah: tekan sekali → muncul tombol konfirmasi (confirm() tidak dipakai).
	import Button from './Button.svelte';

	let {
		label,
		konfirmasiLabel,
		onkonfirmasi,
		variant = 'secondary'
	}: { label: string; konfirmasiLabel: string; onkonfirmasi: () => Promise<void> | void; variant?: 'primary' | 'secondary' | 'ghost' } =
		$props();

	let tahap = $state<'awal' | 'yakin' | 'proses'>('awal');

	async function jalankan() {
		tahap = 'proses';
		try {
			await onkonfirmasi();
		} finally {
			tahap = 'awal';
		}
	}
</script>

{#if tahap === 'awal'}
	<Button {variant} onclick={() => (tahap = 'yakin')}>{label}</Button>
{:else}
	<span class="inline-flex flex-wrap items-center gap-2">
		<Button variant="primary" loading={tahap === 'proses'} onclick={jalankan}>{konfirmasiLabel}</Button>
		<Button variant="ghost" disabled={tahap === 'proses'} onclick={() => (tahap = 'awal')}>Batal</Button>
	</span>
{/if}
