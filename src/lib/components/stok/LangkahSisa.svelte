<script module lang="ts">
	export const kunciSisa = (shiftId: string) => `dk-sisa-${shiftId}`;
	export function sudahDijawab(shiftId: string): boolean {
		try {
			return sessionStorage.getItem(kunciSisa(shiftId)) === '1';
		} catch {
			return false;
		}
	}
</script>

<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import { muatBahan, muatMenu, muatResep } from '#lib/master/api.ts';
	import { buatKejadianRusak } from '#lib/kasir/offline-kasir.ts';
	import { galatJaringan } from '#lib/auth/cache-profil.ts';
	import { tambahKejadian } from '#lib/offline/antrean.ts';
	import { denganSalinan } from '#lib/offline/salinan.ts';
	import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';
	import { bentukSisa, kumpulkanSisa, type BarisSisa } from '#lib/stok/sisa.ts';
	import { ALASAN_RUSAK, LABEL_ALASAN } from '#lib/stok/tampil.ts';
	import type { AlasanRusak } from '#lib/stok/types.ts';

	let { outletId, shiftId, onselesai }: { outletId: string; shiftId: string; onselesai: () => void } = $props();

	let tahap = $state<'tanya' | 'isi'>('tanya');
	let baris = $state<BarisSisa[]>([]);
	let teks = $state<Record<string, string>>({});
	let galat = $state<Record<string, string>>({});
	let alasan = $state<AlasanRusak>('sisa_tidak_laku');
	let pesan = $state('');
	let tercatat = $state('');
	let menyimpan = $state(false);
	let id = $state(crypto.randomUUID());
	const kotak =
		'tabular min-h-12 w-20 rounded-xl border border-line-strong bg-surface px-3 text-right text-fg focus:border-brand focus:ring-3 focus:ring-brand/25 focus:outline-none';

	function selesai() {
		try {
			sessionStorage.setItem(kunciSisa(shiftId), '1');
		} catch {
			// abaikan: pertanyaan akan muncul lagi bila halaman dibuka ulang
		}
		onselesai();
	}

	async function ada() {
		tahap = 'isi';
		pesan = '';
		try {
			const jar = (e: unknown) => galatJaringan(e as { message?: string });
			const [bahan, menu, resep] = await Promise.all([
				denganSalinan(dbKasir, 'master:bahan', muatBahan, jar).then((r) => r.nilai),
				denganSalinan(dbKasir, 'master:menu', muatMenu, jar).then((r) => r.nilai),
				denganSalinan(dbKasir, 'master:resep', muatResep, jar).then((r) => r.nilai)
			]);
			baris = bentukSisa(bahan, menu, resep);
		} catch (e) {
			pesan = (e as Error).message;
		}
	}

	async function simpan(e: SubmitEvent) {
		e.preventDefault();
		pesan = '';
		const h = kumpulkanSisa(baris, teks);
		galat = h.galat;
		if (Object.keys(h.galat).length) return;
		if (h.item.length === 0) {
			pesan = 'Isi jumlah sisa, atau kembali dan pilih "Tidak ada sisa".';
			return;
		}
		menyimpan = true;
		try {
			// Lewat antrean: tetap tercatat walau tutup toko tanpa internet.
			await tambahKejadian(dbKasir, { ...buatKejadianRusak(outletId, alasan, h.item, new Date()), id });
			void sinkron.jalankan();
			tercatat = `Tercatat sebagai "${LABEL_ALASAN[alasan]}". Ada sisa dengan alasan lain? Isi lagi, atau lanjut.`;
			id = crypto.randomUUID();
			teks = {};
		} catch (err) {
			pesan = (err as Error).message;
		} finally {
			menyimpan = false;
		}
	}
</script>

<section class="grid max-w-md gap-3 rounded-2xl border-2 border-brand bg-surface p-4" aria-label="Sisa tidak terjual">
	<h2 class="font-display text-xl">Ada sisa yang tidak terjual?</h2>
	{#if tahap === 'tanya'}
		<p class="text-sm text-muted">Ayam/kulit/nasi yang dibuang atau dibawa karyawan. Yang disimpan untuk dijual besok tidak perlu dicatat.</p>
		<div class="flex flex-wrap gap-2">
			<Button onclick={selesai}>Tidak ada sisa</Button>
			<Button variant="secondary" onclick={ada}>Ada sisa</Button>
		</div>
	{:else}
		<form class="grid gap-3" onsubmit={simpan} novalidate>
			<div class="grid gap-1.5">
				<label for="alasan-sisa" class="text-sm font-semibold">Alasan</label>
				<select id="alasan-sisa" bind:value={alasan} class="min-h-12 rounded-xl border border-line-strong bg-surface px-3">
					{#each ALASAN_RUSAK.filter((a) => a !== 'lainnya') as a (a)}<option value={a}>{LABEL_ALASAN[a]}</option>{/each}
				</select>
			</div>
			<ul class="grid gap-2">
				{#each baris as r (r.kunci)}
					<li class="flex flex-wrap items-center gap-2">
						<label for="sisa-{r.kunci}" class="min-w-0 flex-1 font-semibold">{r.label}</label>
						<input id="sisa-{r.kunci}" bind:value={teks[r.kunci]} inputmode="numeric" placeholder="0" class={kotak} />
						<span class="w-14 text-sm text-muted">{r.satuan}</span>
						{#if galat[r.kunci]}<p class="w-full text-sm text-danger" role="alert">{galat[r.kunci]}</p>{/if}
					</li>
				{/each}
			</ul>
			{#if tercatat}<p class="text-sm font-semibold text-ok" role="status">{tercatat}</p>{/if}
			{#if pesan}<p class="text-sm font-semibold text-danger" role="alert">{pesan}</p>{/if}
			<Button type="submit" loading={menyimpan}>Catat sisa</Button>
			<Button variant="secondary" onclick={selesai} disabled={!tercatat}>Lanjut tutup toko</Button>
			{#if !tercatat}<button type="button" class="min-h-12 text-sm text-muted underline" onclick={() => (tahap = 'tanya')}>Kembali</button>{/if}
		</form>
	{/if}
</section>
