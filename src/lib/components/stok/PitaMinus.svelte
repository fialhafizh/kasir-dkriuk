<script lang="ts">
	import { saringOutlet, susunStokOutlet } from '#lib/stok/per-outlet.ts';
	import { muatDataStok, muatStok, muatStokAwal, petaStok, type DataStok } from '#lib/stok/api.ts';

	let { outletId, segar = 0 }: { outletId: string; segar?: number } = $props();

	let minus = $state<string[]>([]);
	// Data master & status stok awal jarang berubah: dimuat sekali per halaman.
	let data: DataStok | null = null;
	// Status stok awal disimpan per outlet (admin bisa berganti outlet tanpa komponen dibuat ulang).
	let sahUntuk: string | null = null;

	$effect(() => {
		const id = outletId;
		void segar;
		let batal = false;
		if (sahUntuk !== id) minus = [];
		(async () => {
			try {
				data ??= await muatDataStok();
				if (sahUntuk !== id) {
					const sah = (await muatStokAwal(id)).some((a) => a.status === 'disetujui');
					if (batal) return;
					if (!sah) {
						minus = [];
						return;
					}
					sahUntuk = id;
				}
				const s = await muatStok(id);
				if (batal) return;
				minus = susunStokOutlet(saringOutlet(data, id), petaStok(s, id))
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
