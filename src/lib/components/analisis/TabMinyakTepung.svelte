<script lang="ts">
	import { muatMinyakTepung, type MinyakTepung } from '#lib/analisis/api.ts';
	import type { Rentang } from '#lib/dasbor/periode.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { outlet, rentang }: { outlet: string | null; rentang: Rentang } = $props();
	let data = $state<MinyakTepung[]>([]);
	let galat = $state('');
	let nomor = 0;

	$effect(() => {
		void outlet;
		void rentang;
		const ini = ++nomor;
		muatMinyakTepung(outlet, rentang)
			.then((h) => {
				if (ini === nomor) (data = h), (galat = '');
			})
			.catch((e) => {
				if (ini === nomor) galat = (e as Error).message;
			});
	});
	const rp = (n: number | null) => (n === null ? '-' : `Rp${formatAngka(n)}`);
	const angka = (n: number | null) => (n === null ? '-' : n.toLocaleString('id-ID', { maximumFractionDigits: 2 }));
</script>

{#if galat}<p class="text-danger" role="alert">{galat}</p>{/if}
<p class="text-xs text-muted">
	Di antara dua pembelian, dihitung potong ayam + porsi kulit yang terjual (yang digoreng). Rata-rata hanya dari pembelian yang sudah disusul pembelian
	berikutnya; pembelian terakhir masih berjalan.
</p>
{#each data as o (o.outlet_id)}
	<section class="mt-4 rounded-2xl border border-line bg-surface p-3">
		<h3 class="font-display text-xl">{o.nama}</h3>
		<div class="mt-2 grid gap-3 lg:grid-cols-3">
			{#each o.bahan as b (b.kode)}
				<div>
					<p class="font-bold">{b.nama}</p>
					<p class="text-sm">
						<span class="tabular font-semibold">{angka(b.potong_per_satuan)}</span> potong/{b.satuan} ·
						<span class="tabular font-semibold">{rp(b.biaya_per_potong)}</span>/potong
					</p>
					<ul class="mt-1 grid gap-0.5 text-xs text-muted">
						{#each b.pembelian as p (p.waktu)}
							<li>
								{formatWaktuWib(p.waktu)} · {angka(p.jumlah)} {b.satuan} · {rp(p.rupiah)} → {p.potong} potong ({angka(p.potong_per_satuan)}/{b.satuan},
								{rp(p.biaya_per_potong)}/potong){p.berjalan ? ' · masih berjalan' : ''}
							</li>
						{:else}
							<li>Tidak ada pembelian di periode ini.</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
		<div class="mt-3 rounded-xl p-2 text-sm {o.tepung.menyimpang ? 'border-2 border-warn' : 'bg-surface-2'}">
			<p>
				Tepung dibeli: D'Kriuk <b class="tabular">{angka(o.tepung.kg_dkriuk)} kg</b> · Tepung A <b class="tabular">{angka(o.tepung.kg_a)} kg</b>
				{#if o.tepung.persen_dkriuk !== null}(D'Kriuk {angka(o.tepung.persen_dkriuk)}%){/if}
			</p>
			{#if o.tepung.menyimpang}<p class="font-semibold text-warn">Rasio jauh dari 50:50 — periksa takaran campuran.</p>{/if}
			<p>Modal tepung per potong: <b class="tabular">{rp(o.tepung.modal_per_potong)}</b> ({o.tepung.potong} potong di periode ini)</p>
		</div>
	</section>
{/each}
