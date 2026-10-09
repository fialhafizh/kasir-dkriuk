<script lang="ts">
	import { muatProyeksi, type Proyeksi } from '#lib/analisis/api.ts';
	import { perubahan } from '#lib/dasbor/periode.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { outlet }: { outlet: string | null } = $props();
	let data = $state<Proyeksi | null>(null);
	let galat = $state('');
	let nomor = 0;

	$effect(() => {
		void outlet;
		const ini = ++nomor;
		muatProyeksi(outlet)
			.then((h) => {
				if (ini === nomor) (data = h), (galat = '');
			})
			.catch((e) => {
				if (ini === nomor) (galat = (e as Error).message), (data = null);
			});
	});
	const rp = (n: number | null) => (n === null ? '-' : `${n < 0 ? '−' : ''}Rp${formatAngka(Math.abs(n))}`);
	const beda = (a: number | null, b: number) => {
		if (a === null) return '';
		const p = perubahan(a, b);
		return p === null ? '' : `${p >= 0 ? '↑' : '↓'} ${Math.abs(p).toLocaleString('id-ID')}% dari bulan lalu`;
	};
</script>

{#if galat}<p class="text-danger" role="alert">{galat}</p>{/if}
{#if data}
	<p class="text-sm text-muted">
		Perkiraan dari laba riil (Laba-rugi) hari-hari yang sudah selesai (tanggal 1 s.d. kemarin, {data.hari_selesai} dari {data.hari_sebulan} hari),
		dirata-rata per hari lalu dikali sebulan. {#if data.hari_selesai === 0}Proyeksi muncul mulai besok.{/if}
	</p>
	<div class="mt-3 grid gap-3 sm:grid-cols-2">
		<div class="rounded-2xl bg-surface-2 p-3">
			<p class="text-xs text-muted">Omzet sejauh ini (termasuk hari ini) → perkiraan akhir bulan</p>
			<p class="tabular text-lg">{rp(data.omzet)} → <b class="font-display text-2xl">{rp(data.proyeksi_omzet)}</b></p>
			<p class="text-xs text-muted">Bulan lalu {rp(data.bulan_lalu_omzet)} {beda(data.proyeksi_omzet, data.bulan_lalu_omzet)}</p>
		</div>
		<div class="rounded-2xl bg-surface-2 p-3">
			<p class="text-xs text-muted">Laba sejauh ini (termasuk hari ini) → perkiraan akhir bulan</p>
			<p class="tabular text-lg">{rp(data.laba)} → <b class="font-display text-2xl {(data.proyeksi_laba ?? 0) < 0 ? 'text-danger' : ''}">{rp(data.proyeksi_laba)}</b></p>
			<p class="text-xs text-muted">Bulan lalu {rp(data.bulan_lalu_laba)} {beda(data.proyeksi_laba, data.bulan_lalu_laba)}</p>
		</div>
	</div>
	<p class="mt-2 text-xs text-muted">Sewa dihitung per hari; gaji menurut kehadiran yang sudah dicatat. Belanja bahan besar di awal bulan membuat perkiraan laba awal bulan terlihat rendah.</p>
{/if}
