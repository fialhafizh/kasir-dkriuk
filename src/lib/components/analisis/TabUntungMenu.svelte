<script lang="ts">
	import { muatUntungMenu, simpanBatasUntung, tandaUntung, type UntungMenu } from '#lib/analisis/api.ts';
	import type { Rentang } from '#lib/dasbor/periode.ts';
	import { formatAngka } from '#lib/master/rupiah.ts';
	import type { Outlet } from '#lib/types/db.ts';

	let { outlet, rentang, outlets }: { outlet: string | null; rentang: Rentang; outlets: Outlet[] } = $props();
	let menu = $state<UntungMenu[]>([]);
	let batas = $state(30);
	let fBatas = $state('30');
	let fBatasDiubah = false;
	let galat = $state('');
	let pesan = $state('');
	let nomor = 0;

	async function muat() {
		const ini = ++nomor;
		try {
			const h = await muatUntungMenu(outlet, rentang);
			if (ini !== nomor) return;
			menu = h.menu;
			// isian batas hanya diisi ulang saat pertama dimuat (tidak menimpa ketikan saat periode diganti)
			if (batas !== h.batas || !fBatasDiubah) fBatas = String(h.batas).replace('.', ',');
			batas = h.batas;
			galat = '';
		} catch (e) {
			if (ini === nomor) (galat = (e as Error).message), (menu = []);
		}
	}
	$effect(() => {
		void outlet;
		void rentang;
		void muat();
	});

	async function simpan(e: SubmitEvent) {
		e.preventDefault();
		const n = Number(fBatas.replace(',', '.'));
		if (!Number.isFinite(n)) return void (pesan = 'Isi angka persen, mis. 30.');
		try {
			await simpanBatasUntung(n);
			pesan = 'Batas disimpan.';
			fBatasDiubah = false;
			await muat();
		} catch (err) {
			pesan = (err as Error).message;
		}
	}
	const rp = (n: number | null) => (n === null ? '-' : `${n < 0 ? '−' : ''}Rp${formatAngka(Math.abs(n))}`);
	const namaOutlet = (id: string) => outlets.find((o) => o.id === id)?.nama ?? '';
	const LABEL = { belum: 'Modal belum lengkap', rugi: 'Rugi', tipis: 'Untung tipis', sehat: '' } as const;
	const WARNA = { belum: 'bg-surface-2 text-muted', rugi: 'border-2 border-danger text-danger', tipis: 'bg-accent text-on-accent', sehat: '' } as const;
	const totalUntung = $derived(menu.reduce((t, m) => t + (m.untung_periode ?? 0), 0));
	const terlaris = $derived([...menu].filter((m) => (m.untung_periode ?? 0) > 0).sort((a, b) => (b.untung_periode ?? 0) - (a.untung_periode ?? 0)).slice(0, 3));
</script>

{#if galat}<p class="text-danger" role="alert">{galat}</p>{/if}
<div class="grid gap-3 sm:grid-cols-2">
	<div class="rounded-2xl bg-surface-2 p-3">
		<p class="text-xs text-muted">Untung kotor menu terjual di periode ini (perkiraan)</p>
		<p class="tabular font-display text-2xl">{rp(totalUntung)}</p>
		{#if terlaris.length}<p class="text-xs text-muted">Penyumbang terbesar: {terlaris.map((m) => m.nama).join(', ')}</p>{/if}
	</div>
	<form class="flex flex-wrap items-end gap-2 rounded-2xl bg-surface-2 p-3" onsubmit={simpan}>
		<label class="grid gap-1 text-xs font-semibold">
			Tandai "untung tipis" bila di bawah (%)
			<input class="tabular min-h-11 w-24 rounded-xl border border-line-strong bg-surface px-3 text-right" inputmode="decimal" bind:value={fBatas} oninput={() => (fBatasDiubah = true)} />
		</label>
		<button type="submit" class="min-h-11 rounded-xl bg-surface px-4 text-sm font-semibold">Simpan</button>
		{#if pesan}<p class="w-full text-xs" role="status">{pesan}</p>{/if}
	</form>
</div>

<div class="mt-3 overflow-x-auto">
	<table class="w-full min-w-[40rem] text-sm">
		<thead class="text-left text-xs text-muted">
			<tr>
				<th class="py-1 pr-2">Menu</th>
				{#if !outlet}<th class="py-1 pr-2">Outlet</th>{/if}
				<th class="py-1 pr-2 text-right">Harga</th>
				<th class="py-1 pr-2 text-right">Modal</th>
				<th class="py-1 pr-2 text-right">Untung/porsi</th>
				<th class="py-1 pr-2 text-right">%</th>
				<th class="py-1 pr-2 text-right">Terjual</th>
				<th class="py-1 text-right">Untung periode</th>
			</tr>
		</thead>
		<tbody>
			{#each menu as m (m.outlet_id + m.menu_id)}
				{@const t = tandaUntung(m)}
				<tr class="border-t border-line">
					<td class="py-1.5 pr-2">
						{m.nama}
						{#if LABEL[t]}<span class="ml-1 rounded-full px-2 py-0.5 text-xs font-bold {WARNA[t]}">{LABEL[t]}</span>{/if}
					</td>
					{#if !outlet}<td class="py-1.5 pr-2 text-muted">{namaOutlet(m.outlet_id)}</td>{/if}
					<td class="tabular py-1.5 pr-2 text-right">{rp(m.harga)}</td>
					<td class="tabular py-1.5 pr-2 text-right">{rp(m.modal)}</td>
					<td class="tabular py-1.5 pr-2 text-right {t === 'rugi' ? 'text-danger' : ''}">{rp(m.untung)}</td>
					<td class="tabular py-1.5 pr-2 text-right">{m.persen === null ? '-' : `${m.persen.toLocaleString('id-ID')}%`}</td>
					<td class="tabular py-1.5 pr-2 text-right">{m.terjual.toLocaleString('id-ID')}</td>
					<td class="tabular py-1.5 text-right">{rp(m.untung_periode)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="mt-2 text-xs text-muted">
	Modal = takaran resep × harga rata-rata barang masuk di periode ini (bila tidak ada pembelian: harga acuan di Harga Beli). Pack ayam dibagi ke tiap
	potongan sebanding harga jualnya. Batas sekarang {batas.toLocaleString('id-ID')}%.
</p>
