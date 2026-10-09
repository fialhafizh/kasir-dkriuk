<script lang="ts">
	import { aturKehadiran, hariDalamBulan, type RekapGaji } from '#lib/kas/gaji.ts';

	let {
		bulan,
		rekap,
		hadir,
		hariIni,
		onubah
	}: { bulan: string; rekap: RekapGaji[]; hadir: Set<string>; hariIni: string; onubah: () => void } = $props();

	let pesan = $state('');
	let proses = $state<string | null>(null);
	const hari = $derived(hariDalamBulan(bulan));

	async function ubah(r: RekapGaji, tanggal: string) {
		const kunci = `${r.karyawan_id}|${tanggal}`;
		pesan = '';
		proses = kunci;
		try {
			await aturKehadiran(r.karyawan_id, tanggal, !hadir.has(kunci));
			onubah();
		} catch (e) {
			pesan = (e as Error).message;
		} finally {
			proses = null;
		}
	}
</script>

<section aria-label="Kehadiran">
	<h2 class="font-display text-2xl">Kehadiran</h2>
	<p class="mt-1 text-sm text-muted">Centang karyawan yang masuk. Bulan yang gajinya sudah dibayar terkunci.</p>
	{#if pesan}<p class="mt-2 text-sm text-danger" role="alert">{pesan}</p>{/if}
	{#if rekap.length === 0}
		<p class="mt-2 rounded-xl bg-surface-2 p-4 text-sm text-muted">Belum ada karyawan di outlet ini.</p>
	{:else}
		<div class="mt-2 overflow-x-auto">
			<table class="text-sm">
				<thead>
					<tr>
						<th class="sticky left-0 bg-bg py-2 pr-3 text-left font-semibold">Karyawan</th>
						{#each hari as t (t)}<th class="w-10 px-1 text-center font-normal text-muted">{Number(t.slice(-2))}</th>{/each}
						<th class="px-2 text-right font-semibold">Masuk</th>
					</tr>
				</thead>
				<tbody>
					{#each rekap as r (r.karyawan_id)}
						<tr class="border-t border-line">
							<th class="sticky left-0 bg-bg py-1 pr-3 text-left font-semibold whitespace-nowrap">{r.nama}{r.gaji ? ' 🔒' : ''}</th>
							{#each hari as t (t)}
								{@const kunci = `${r.karyawan_id}|${t}`}
								<td class="px-1 text-center">
									<input
										type="checkbox"
										aria-label="{r.nama} masuk tanggal {Number(t.slice(-2))}"
										checked={hadir.has(kunci)}
										disabled={!!r.gaji || t > hariIni || proses === kunci}
										onchange={() => ubah(r, t)}
										class="size-6 accent-brand"
									/>
								</td>
							{/each}
							<td class="tabular px-2 text-right font-semibold">{r.hari_masuk}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
