<script lang="ts">
	import { muatDataStok, muatStok, muatStokAwal, petaStok, type DataStok } from '#lib/stok/api.ts';
	import { susunStok } from '#lib/stok/tampil.ts';

	let { outletId, segar = 0 }: { outletId: string; segar?: number } = $props();

	let minus = $state<string[]>([]);
	// Data master & status stok awal jarang berubah: dimuat sekali per halaman.
	let data: DataStok | null = null;
	let sah = false;

	$effect(() => {
		const id = outletId;
		void segar;
		let batal = false;
		(async () => {
			try {
				data ??= await muatDataStok();
				if (!sah) sah = (await muatStokAwal(id)).some((a) => a.status === 'disetujui');
				if (!sah) {
					if (!batal) minus = [];
					return;
				}
				const s = await muatStok(id);
				if (batal) return;
				minus = susunStok(data.bahan, data.satuan, data.isi, petaStok(s, id))
					.filter((b) => b.status === 'minus')
					.map((b) => b.label);
			} catch {
				// Hanya peringatan: galat jaringan tidak boleh mengganggu jualan.
			}
		})();
		return () => {
			batal = true;
		};
	});
</script>

{#if minus.length}
	<p class="mb-3 rounded-xl border-2 border-danger bg-surface px-4 py-2 text-sm font-semibold text-danger" role="status">
		Stok minus: {minus.join(', ')} — lapor admin.
	</p>
{/if}
