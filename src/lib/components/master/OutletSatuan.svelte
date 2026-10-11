<script lang="ts">
	// Pilih outlet yang memakai satu satuan beli. Semua tercentang = dipakai semua outlet (disimpan sebagai daftar kosong).
	import { simpanOutletSatuan } from '#lib/master/api.ts';
	import type { SatuanOutlet } from '#lib/stok/per-outlet.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { satuanId, nama, outlets, pemakai = $bindable() }: { satuanId: string; nama: string; outlets: Outlet[]; pemakai: SatuanOutlet[] } = $props();

	let menyimpan = $state(false);
	let pesan = $state('');
	const milik = $derived(pemakai.filter((x) => x.satuan_beli_id === satuanId).map((x) => x.outlet_id));
	const dipakai = (oid: string) => milik.length === 0 || milik.includes(oid);

	async function ubah(oid: string) {
		const kini = outlets.filter((o) => dipakai(o.id)).map((o) => o.id);
		const baru = kini.includes(oid) ? kini.filter((x) => x !== oid) : [...kini, oid];
		if (baru.length === 0) {
			pesan = 'Minimal satu outlet harus memakai satuan beli ini.';
			return;
		}
		const simpan = baru.length === outlets.length ? [] : baru;
		menyimpan = true;
		pesan = '';
		try {
			await simpanOutletSatuan(satuanId, simpan);
			pemakai = [...pemakai.filter((x) => x.satuan_beli_id !== satuanId), ...simpan.map((outlet_id) => ({ satuan_beli_id: satuanId, outlet_id }))];
		} catch (e) {
			pesan = (e as Error).message;
		} finally {
			menyimpan = false;
		}
	}
</script>

<div class="mt-3">
	<p class="text-xs font-semibold tracking-wide text-muted uppercase">Dipakai di outlet</p>
	<div class="mt-1 flex flex-wrap gap-2">
		{#each outlets as o (o.id)}
			<label class="flex min-h-12 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm">
				<input type="checkbox" class="size-5" checked={dipakai(o.id)} disabled={menyimpan} aria-label="{nama} dipakai di {o.nama}" onchange={() => ubah(o.id)} />
				{o.nama}
			</label>
		{/each}
	</div>
	{#if pesan}<p class="mt-1 text-xs text-danger" role="alert">{pesan}</p>{/if}
</div>
