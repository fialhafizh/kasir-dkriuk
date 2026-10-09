<script lang="ts">
	import { aturKehadiran, hariDalamBulan, type RekapGaji } from '#lib/kas/gaji.ts';

	let {
		bulan,
		rekap,
		hadir,
		hariIni,
		onubah
	}: { bulan: string; rekap: RekapGaji[]; hadir: Set<string>; hariIni: string; onubah: () => Promise<void> | void } = $props();

	let pesan = $state('');
	let proses = $state<string | null>(null);
	const hari = $derived(hariDalamBulan(bulan));

	// Satu perubahan sekaligus; kotak dikunci sampai data dimuat ulang (ketukan ganda tidak membalik arah).
	async function ubah(r: RekapGaji, tanggal: string, el: HTMLInputElement) {
		const kunci = `${r.karyawan_id}|${tanggal}`;
		if (proses) {
			el.checked = hadir.has(kunci);
			return;
		}
		pesan = '';
		proses = kunci;
		try {
			await aturKehadiran(r.karyawan_id, tanggal, el.checked);
			await onubah();
		} catch (e) {
			pesan = (e as Error).message;
			// Kembalikan ke keadaan yang tersimpan di server.
			el.checked = hadir.has(kunci);
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
						{#each hari as t (t)}<th class="min-w-12 text-center font-normal text-muted">{Number(t.slice(-2))}</th>{/each}
						<th class="px-2 text-right font-semibold">Masuk</th>
					</tr>
				</thead>
				<tbody>
					{#each rekap as r (r.karyawan_id)}
						<tr class="border-t border-line">
							<th class="sticky left-0 bg-bg py-1 pr-3 text-left font-semibold whitespace-nowrap">{r.nama}{r.gaji ? ' 🔒' : ''}</th>
							{#each hari as t (t)}
								{@const kunci = `${r.karyawan_id}|${t}`}
								<td class="p-0 text-center">
									<!-- Seluruh sel bisa diketuk (≥ 48px) supaya mudah di HP. -->
									<label class="flex min-h-12 min-w-12 items-center justify-center">
										<input
											type="checkbox"
											aria-label="{r.nama} masuk tanggal {Number(t.slice(-2))}"
											checked={hadir.has(kunci)}
											disabled={!!r.gaji || t > hariIni || proses !== null}
											onchange={(e) => ubah(r, t, e.currentTarget)}
											class="size-6 accent-brand"
										/>
									</label>
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
