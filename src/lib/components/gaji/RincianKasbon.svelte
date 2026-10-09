<script lang="ts">
	// Rincian kasbon satu karyawan (dari kasir & admin) beserta status pemotongan gaji.
	import { muatRincianKasbon, type KasbonRinci } from '#lib/kas/gaji.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';

	let { karyawanId, segar = 0 }: { karyawanId: string; segar?: number } = $props();
	let daftar = $state<KasbonRinci[] | null>(null);
	let galat = $state('');
	let terbuka = $state(false);

	let nomor = 0;
	$effect(() => {
		void segar;
		if (!terbuka) return;
		const ini = ++nomor;
		muatRincianKasbon(karyawanId)
			.then((d) => {
				if (ini === nomor) (daftar = d), (galat = '');
			})
			.catch((e) => {
				if (ini === nomor) (galat = (e as Error).message), (daftar = null);
			});
	});
	const LABEL = { lunas: 'Sudah dipotong', sebagian: 'Sebagian dipotong', belum: 'Belum dipotong' } as const;
	const WARNA = { lunas: 'text-ok', sebagian: 'text-warn', belum: 'text-muted' } as const;
	const sisa = $derived((daftar ?? []).reduce((t, k) => t + k.jumlah - k.dipotong, 0));
</script>

<details class="mt-1 text-sm" bind:open={terbuka}>
	<summary class="cursor-pointer text-xs font-semibold text-muted">Rincian kasbon</summary>
	{#if galat}
		<p class="text-danger" role="alert">{galat}</p>
	{:else if daftar === null}
		<p class="text-muted" role="status">Memuat…</p>
	{:else if !daftar.length}
		<p class="text-muted">Belum pernah kasbon.</p>
	{:else}
		<ul class="mt-1 grid gap-1">
			{#each [...daftar].reverse() as k (k.id)}
				<li class="flex flex-wrap justify-between gap-x-3 border-b border-line py-1">
					<span>
						{formatWaktuWib(k.waktu).slice(0, 8)} · <b class="tabular">Rp{formatAngka(k.jumlah)}</b> · {k.sumber === 'laci' ? 'dari laci' : 'dari owner'}
						<span class="text-xs text-muted">· dicatat {k.pencatat}{k.keterangan ? ` · ${k.keterangan}` : ''}</span>
					</span>
					<span class="text-xs font-semibold {WARNA[k.status]}">
						{LABEL[k.status]}{k.status === 'sebagian' ? ` (Rp${formatAngka(k.dipotong)})` : ''}
					</span>
				</li>
			{/each}
		</ul>
		<p class="mt-1 text-xs">Sisa yang akan dipotong di gajian berikutnya: <b class="tabular">Rp{formatAngka(sisa)}</b></p>
	{/if}
</details>
