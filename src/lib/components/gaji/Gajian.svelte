<script lang="ts">
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import { batalGaji, bayarGaji, hitungDibayar, saranPotongan, type RekapGaji } from '#lib/kas/gaji.ts';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';

	let { bulan, rekap, onubah }: { bulan: string; rekap: RekapGaji[]; onubah: () => void } = $props();

	let penyesuaian = $state<Record<string, string>>({});
	let ket = $state<Record<string, string>>({});
	let potongan = $state<Record<string, string>>({});
	let sumber = $state<Record<string, 'laci' | 'luar'>>({});
	let alasan = $state<Record<string, string>>({});
	let pesan = $state<Record<string, string>>({});

	// Penyesuaian bisa minus (potongan): "-10.000".
	const angka = (t: string | undefined) => {
		const s = (t ?? '').trim();
		const neg = s.startsWith('-');
		const n = parseRupiah(neg ? s.slice(1) : s);
		return n === null ? (s === '' || s === '-' ? 0 : null) : neg ? -n : n;
	};
	const kotor = (r: RekapGaji) => r.hari_masuk * r.upah_harian;
	const potonganDari = (r: RekapGaji) => (potongan[r.karyawan_id] === undefined ? saranPotongan(r.sisa_kasbon, kotor(r) + (angka(penyesuaian[r.karyawan_id]) ?? 0)) : angka(potongan[r.karyawan_id]));

	async function bayar(r: RekapGaji) {
		pesan[r.karyawan_id] = '';
		const p = angka(penyesuaian[r.karyawan_id]);
		const pot = potonganDari(r);
		if (p === null || pot === null) {
			pesan[r.karyawan_id] = 'Isi angka yang benar untuk penyesuaian & potongan kasbon.';
			return;
		}
		try {
			await bayarGaji({
				id: crypto.randomUUID(),
				karyawan_id: r.karyawan_id,
				bulan,
				penyesuaian: p,
				...(ket[r.karyawan_id]?.trim() ? { keterangan: ket[r.karyawan_id].trim() } : {}),
				potongan_kasbon: pot,
				sumber: sumber[r.karyawan_id] ?? 'luar'
			});
			onubah();
		} catch (e) {
			pesan[r.karyawan_id] = (e as Error).message;
		}
	}

	async function batal(r: RekapGaji) {
		pesan[r.karyawan_id] = '';
		try {
			await batalGaji(r.gaji!.id, alasan[r.karyawan_id] ?? '');
			onubah();
		} catch (e) {
			pesan[r.karyawan_id] = (e as Error).message;
		}
	}
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
</script>

<section aria-label="Gajian">
	<h2 class="font-display text-2xl">Gajian</h2>
	<p class="mt-1 text-sm text-muted">Hari masuk × upah harian + penyesuaian (bonus/potongan, keterangan wajib) − kasbon yang dipotong = dibayar.</p>
	<ul class="mt-2 grid gap-2">
		{#each rekap as r (r.karyawan_id)}
			<li class="rounded-2xl border border-line bg-surface p-3">
				<p class="flex flex-wrap justify-between gap-2">
					<span class="font-semibold">{r.nama}{r.aktif ? '' : ' (nonaktif)'}</span>
					<span class="tabular text-sm text-muted">{r.hari_masuk} hari × Rp{formatAngka(r.upah_harian)} = Rp{formatAngka(kotor(r))} · sisa kasbon Rp{formatAngka(r.sisa_kasbon)}</span>
				</p>
				{#if r.gaji}
					<p class="mt-1 text-sm text-ok">
						Dibayar Rp{formatAngka(r.gaji.dibayar)} pada {formatWaktuWib(r.gaji.dibayar_at)} ({r.gaji.hari_masuk} hari × Rp{formatAngka(r.gaji.upah_harian)}{r.gaji.penyesuaian ? `, penyesuaian Rp${formatAngka(r.gaji.penyesuaian)} (${r.gaji.keterangan})` : ''}{r.gaji.potongan_kasbon ? `, potong kasbon Rp${formatAngka(r.gaji.potongan_kasbon)}` : ''})
					</p>
					<div class="mt-2 flex flex-wrap items-center gap-2">
						<label class="sr-only" for="alasan-{r.karyawan_id}">Alasan batal</label>
						<input id="alasan-{r.karyawan_id}" bind:value={alasan[r.karyawan_id]} maxlength="200" placeholder="Alasan batal (mis. salah hitung)" class="min-w-0 flex-1 {kotak}" />
						<Konfirmasi label="Batalkan gaji" konfirmasiLabel="Ya, batalkan" variant="ghost" onkonfirmasi={() => batal(r)} />
					</div>
				{:else}
					{@const pot = potonganDari(r)}
					{@const pen = angka(penyesuaian[r.karyawan_id])}
					<div class="mt-2 grid gap-2 sm:grid-cols-2">
						<div class="grid gap-1">
							<label for="pen-{r.karyawan_id}" class="text-xs font-semibold text-muted">Penyesuaian (minus = potongan)</label>
							<input id="pen-{r.karyawan_id}" bind:value={penyesuaian[r.karyawan_id]} inputmode="text" placeholder="0" class="tabular text-right {kotak}" />
						</div>
						<div class="grid gap-1">
							<label for="ket-{r.karyawan_id}" class="text-xs font-semibold text-muted">Keterangan penyesuaian</label>
							<input id="ket-{r.karyawan_id}" bind:value={ket[r.karyawan_id]} maxlength="200" class={kotak} />
						</div>
						<div class="grid gap-1">
							<label for="pot-{r.karyawan_id}" class="text-xs font-semibold text-muted">Potong kasbon</label>
							<input id="pot-{r.karyawan_id}" value={pot === null ? potongan[r.karyawan_id] : formatAngka(pot)} oninput={(e) => (potongan[r.karyawan_id] = e.currentTarget.value)} inputmode="numeric" class="tabular text-right {kotak}" />
						</div>
						<div class="grid gap-1">
							<label for="sumber-{r.karyawan_id}" class="text-xs font-semibold text-muted">Dibayar dari</label>
							<select id="sumber-{r.karyawan_id}" bind:value={sumber[r.karyawan_id]} class={kotak}>
								<option value="luar">Owner (di luar laci)</option>
								<option value="laci">Laci outlet</option>
							</select>
						</div>
					</div>
					<div class="mt-2 flex flex-wrap items-center justify-between gap-2">
						<p class="tabular font-bold">
							Dibayar: {pen === null || pot === null ? '—' : `Rp${formatAngka(hitungDibayar(r.hari_masuk, r.upah_harian, pen, pot))}`}
						</p>
						<Konfirmasi label="Bayar gaji" konfirmasiLabel="Ya, sudah dibayar" variant="primary" onkonfirmasi={() => bayar(r)} />
					</div>
				{/if}
				{#if pesan[r.karyawan_id]}<p class="mt-1 text-sm text-danger" role="alert">{pesan[r.karyawan_id]}</p>{/if}
			</li>
		{/each}
	</ul>
</section>
