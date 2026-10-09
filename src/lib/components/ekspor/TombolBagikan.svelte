<script lang="ts">
	// Salin teks untuk WA & kirim lewat bot Telegram (agar bisa disalin dari HP).
	import { kirimTeks } from '#lib/telegram/api.ts';

	let { teks, jenis }: { teks: () => string; jenis: 'belanja' | 'gaji' | 'ojol' } = $props();
	let pesan = $state<{ isi: string; galat: boolean } | null>(null);
	let proses = $state(false);

	async function salin() {
		try {
			await navigator.clipboard.writeText(teks());
			pesan = { isi: 'Teks tersalin. Tempel di grup WA.', galat: false };
		} catch {
			pesan = { isi: 'Peramban tidak mengizinkan menyalin otomatis; pakai Kirim ke Telegram.', galat: true };
		}
	}
	async function kirim() {
		if (proses) return;
		proses = true;
		try {
			await kirimTeks(jenis, teks());
			pesan = { isi: 'Dikirim ke Telegram (topik 💰 Kas), masuk ±1 menit.', galat: false };
		} catch (e) {
			pesan = { isi: (e as Error).message, galat: true };
		} finally {
			proses = false;
		}
	}
	const tombol = 'min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-60';
</script>

<span class="tanpa-cetak inline-flex flex-wrap items-center gap-1">
	<button type="button" class="{tombol} bg-brand text-on-brand" onclick={salin}>Salin untuk WA</button>
	<button type="button" class="{tombol} bg-surface-2" disabled={proses} onclick={kirim}>Kirim ke Telegram</button>
	{#if pesan}<span class="text-xs {pesan.galat ? 'text-danger' : 'text-ok'}" role={pesan.galat ? 'alert' : 'status'}>{pesan.isi}</span>{/if}
</span>
