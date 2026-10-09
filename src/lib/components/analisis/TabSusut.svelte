<script lang="ts">
	import { muatSusutTerbuang, type Buang, type Susut } from '#lib/analisis/api.ts';
	import type { Rentang } from '#lib/dasbor/periode.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { outlet, rentang, outlets }: { outlet: string | null; rentang: Rentang; outlets: Outlet[] } = $props();
	let data = $state<{ susut: Susut[]; susutTotal: number; terbuang: Buang[]; terbuangTotal: number } | null>(null);
	let galat = $state('');
	let nomor = 0;

	$effect(() => {
		void outlet;
		void rentang;
		const ini = ++nomor;
		muatSusutTerbuang(outlet, rentang)
			.then((h) => {
				if (ini === nomor) (data = h), (galat = '');
			})
			.catch((e) => {
				if (ini === nomor) (galat = (e as Error).message), (data = null);
			});
	});
	const rp = (n: number | null) => (n === null ? 'modal belum ada' : `${n < 0 ? '−' : ''}Rp${formatAngka(Math.abs(n))}`);
	const angka = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
	const namaOutlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '';
</script>

{#if galat}<p class="text-danger" role="alert">{galat}</p>{/if}
{#if data}
	<div class="grid gap-3 sm:grid-cols-2">
		<div class="rounded-2xl bg-surface-2 p-3">
			<p class="text-xs text-muted">Susut dari opname (perkiraan)</p>
			<p class="tabular font-display text-2xl {data.susutTotal < 0 ? 'text-danger' : ''}">{rp(data.susutTotal)}</p>
			<p class="text-xs text-muted">Minus = barang hilang / kebanyakan dipakai dibanding resep.</p>
		</div>
		<div class="rounded-2xl bg-surface-2 p-3">
			<p class="text-xs text-muted">Nilai terbuang (sisa/rusak)</p>
			<p class="tabular font-display text-2xl">{rp(data.terbuangTotal)}</p>
		</div>
	</div>

	<section class="mt-4 grid gap-4 lg:grid-cols-2">
		<div>
			<h3 class="font-bold">Susut per bahan</h3>
			{#if !data.susut.length}<p class="text-sm text-muted">Belum ada opname disetujui di periode ini.</p>{/if}
			<ul class="mt-1 grid gap-1 text-sm">
				{#each data.susut as s (s.outlet_id + s.bahan_id)}
					<li class="flex justify-between gap-2 border-b border-line py-1">
						<span>{s.nama}{outlet ? '' : ` · ${namaOutlet(s.outlet_id)}`} <span class="text-xs text-muted">({angka(s.jumlah)} {s.satuan})</span></span>
						<span class="tabular font-semibold {(s.nilai ?? 0) < 0 ? 'text-danger' : ''}">{rp(s.nilai)}</span>
					</li>
				{/each}
			</ul>
		</div>
		<div>
			<h3 class="font-bold">Terbuang per alasan & bahan</h3>
			{#if !data.terbuang.length}<p class="text-sm text-muted">Tidak ada catatan sisa/rusak di periode ini.</p>{/if}
			<ul class="mt-1 grid gap-1 text-sm">
				{#each data.terbuang as t, i (i)}
					<li class="flex justify-between gap-2 border-b border-line py-1">
						<span>{t.label_alasan} · {t.nama}{outlet ? '' : ` · ${namaOutlet(t.outlet_id)}`} <span class="text-xs text-muted">({angka(t.jumlah)} {t.satuan})</span></span>
						<span class="tabular font-semibold">{rp(t.nilai)}</span>
					</li>
				{/each}
			</ul>
		</div>
	</section>
{/if}
