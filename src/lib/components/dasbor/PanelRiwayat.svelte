<script lang="ts">
	import { muatRiwayat, type Kejadian } from '#lib/dasbor/api.ts';
	import { LABEL_RIWAYAT } from '#lib/dasbor/katalog.ts';
	import type { Rentang } from '#lib/dasbor/periode.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { outlets, outlet, jenis, rentang, segar }: { outlets: Outlet[]; outlet: string | null; jenis: string[]; rentang: Rentang; segar: number } = $props();
	let daftar = $state<Kejadian[]>([]);
	let habis = $state(false);
	let galat = $state('');
	let memuat = $state(false);
	const BATAS = 50;

	async function muat(lanjut: boolean) {
		if (memuat) return;
		memuat = true;
		try {
			const baru = await muatRiwayat(outlet, rentang, jenis, lanjut ? (daftar.at(-1)?.waktu ?? null) : null, BATAS);
			daftar = lanjut ? [...daftar, ...baru] : baru;
			habis = baru.length < BATAS;
			galat = '';
		} catch (e) {
			galat = (e as Error).message;
		} finally {
			memuat = false;
		}
	}
	$effect(() => {
		void segar;
		void outlet;
		void rentang;
		void muat(false);
	});
	const namaOutlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '';
	const WARNA: Record<string, string> = { batal: 'text-danger', diabaikan: 'text-danger', toko: 'text-brand', setoran: 'text-ok' };
</script>

{#if galat}
	<p class="text-sm text-danger" role="alert">{galat}</p>
{:else}
	<div class="h-full overflow-y-auto">
		{#if !daftar.length}<p class="text-sm text-muted">Belum ada kejadian di periode ini.</p>{/if}
		<ol class="grid gap-1.5">
			{#each daftar as k, i (i)}
				<li class="border-b border-line pb-1.5 text-sm">
					<p class="flex flex-wrap items-baseline gap-x-2">
						<span class="tabular text-xs text-muted">{formatWaktuWib(k.waktu)}</span>
						<span class="text-xs font-bold {WARNA[k.jenis] ?? 'text-muted'}">{LABEL_RIWAYAT[k.jenis as keyof typeof LABEL_RIWAYAT] ?? k.jenis}</span>
						{#if !outlet}<span class="text-xs text-muted">· {namaOutlet(k.outlet_id)}</span>{/if}
					</p>
					<p class="font-semibold">{k.judul}</p>
					{#if k.rincian}<p class="text-xs text-muted">{k.rincian}</p>{/if}
				</li>
			{/each}
		</ol>
		{#if !habis && daftar.length}
			<button type="button" class="mt-2 min-h-10 rounded-lg bg-surface-2 px-3 text-sm font-semibold" disabled={memuat} onclick={() => muat(true)}>Muat lebih</button>
		{/if}
	</div>
{/if}
