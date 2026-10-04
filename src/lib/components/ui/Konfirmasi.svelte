<script lang="ts">
	// Tombol dua langkah: tekan sekali → muncul tombol konfirmasi (confirm() tidak dipakai).
	import { tick } from 'svelte';
	import Button from './Button.svelte';

	let {
		label,
		konfirmasiLabel,
		onkonfirmasi,
		variant = 'secondary'
	}: { label: string; konfirmasiLabel: string; onkonfirmasi: () => Promise<void> | void; variant?: 'primary' | 'secondary' | 'ghost' } =
		$props();

	let tahap = $state<'awal' | 'yakin' | 'proses'>('awal');
	let wadah = $state<HTMLSpanElement>();

	// Fokus pindah ke tombol yang baru muncul supaya pengguna keyboard/TalkBack tidak kehilangan posisi.
	async function ke(t: 'awal' | 'yakin') {
		tahap = t;
		await tick();
		wadah?.querySelector('button')?.focus();
	}

	async function jalankan() {
		tahap = 'proses';
		try {
			await onkonfirmasi();
		} catch {
			// Pemanggil menampilkan galatnya sendiri; di sini cukup kembali ke keadaan awal.
		} finally {
			await ke('awal');
		}
	}
</script>

<span bind:this={wadah} class="inline-flex flex-wrap items-center gap-2">
	{#if tahap === 'awal'}
		<Button {variant} onclick={() => ke('yakin')}>{label}</Button>
	{:else}
		<Button variant="primary" loading={tahap === 'proses'} onclick={jalankan}>{konfirmasiLabel}</Button>
		<Button variant="ghost" disabled={tahap === 'proses'} onclick={() => ke('awal')}>Batal</Button>
	{/if}
</span>
