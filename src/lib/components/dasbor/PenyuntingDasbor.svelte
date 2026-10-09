<script lang="ts">
	// Mode sunting dasbor: nama, saringan bawaan, tambah/ubah/gandakan/hapus panel, susun letak. Tersimpan hanya saat Simpan.
	import { onMount } from 'svelte';
	import { simpanDasbor } from '#lib/dasbor/api.ts';
	import { letakBaru, type Dasbor, type Panel, type SaringanDasbor } from '#lib/dasbor/spek.ts';
	import type { Outlet } from '#lib/types/db.ts';
	import DaftarSuntingHp from './DaftarSuntingHp.svelte';
	import FormPanel from './FormPanel.svelte';
	import KisiSunting from './KisiSunting.svelte';
	import SaringanAtas from './SaringanAtas.svelte';

	type PanelKerja = Panel & { _kunci: string };
	let { dasbor, saringan, outlets, onselesai }: { dasbor: Dasbor; saringan: SaringanDasbor; outlets: Outlet[]; onselesai: (id?: string) => void } =
		$props();

	// svelte-ignore state_referenced_locally
	let nama = $state(dasbor.nama);
	// svelte-ignore state_referenced_locally
	let saringanBawaan = $state<SaringanDasbor>({ ...saringan });
	// svelte-ignore state_referenced_locally
	let panel = $state<PanelKerja[]>(dasbor.panel.map((p) => ({ ...structuredClone($state.snapshot(p)), _kunci: p.id ?? crypto.randomUUID() }) as PanelKerja));
	let form = $state<{ panel: Panel; kunci: string | null } | null>(null);
	let lebar = $state(false);
	let pesan = $state('');
	let menyimpan = $state(false);
	const sekarang = new Date();

	onMount(() => {
		const mq = matchMedia('(min-width: 64rem)');
		const ubah = () => (lebar = mq.matches);
		ubah();
		mq.addEventListener('change', ubah);
		return () => mq.removeEventListener('change', ubah);
	});

	function tambah() {
		form = { panel: { judul: '', jenis: 'batang', spek: {}, ...letakBaru(panel) }, kunci: null };
	}
	function pakai(p: Panel) {
		if (!form) return;
		if (form.kunci) panel = panel.map((x) => (x._kunci === form!.kunci ? { ...x, judul: p.judul, jenis: p.jenis, spek: p.spek } : x));
		else panel = [...panel, { ...p, ...letakBaru(panel, p.jenis === 'angka' || p.jenis === 'uang_laci' ? 3 : 6, p.jenis === 'angka' || p.jenis === 'uang_laci' ? 2 : 4), _kunci: crypto.randomUUID() }];
		form = null;
	}
	function gandakan(p: PanelKerja) {
		const { id: _id, _kunci: _k, ...isi } = $state.snapshot(p) as PanelKerja;
		panel = [...panel, { ...structuredClone(isi), judul: `${p.judul} (salinan)`.slice(0, 60), ...letakBaru(panel, p.w, p.h), _kunci: crypto.randomUUID() }];
	}
	function hapus(p: PanelKerja) {
		panel = panel.filter((x) => x._kunci !== p._kunci);
	}
	function letak(kunci: string, l: { x: number; y: number; w: number; h: number }) {
		const i = panel.findIndex((x) => x._kunci === kunci);
		if (i >= 0) panel[i] = { ...panel[i], ...l };
	}

	async function simpan() {
		if (!nama.trim()) return void (pesan = 'Isi nama dasbor.');
		menyimpan = true;
		pesan = '';
		try {
			const id = await simpanDasbor({
				id: dasbor.id,
				nama: nama.trim(),
				saringan: saringanBawaan,
				panel: panel.map(({ _kunci: _k, ...p }) => $state.snapshot(p) as Panel)
			});
			onselesai(id);
		} catch (e) {
			pesan = (e as Error).message;
		} finally {
			menyimpan = false;
		}
	}
	const tombol = 'min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-60';
	const kecil = 'min-h-8 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-surface-2';
</script>

{#snippet aksi(p: PanelKerja)}
	<button type="button" class={kecil} onclick={() => (form = { panel: $state.snapshot(p) as Panel, kunci: p._kunci })}>Ubah</button>
	<button type="button" class={kecil} onclick={() => gandakan(p)}>Gandakan</button>
	<button type="button" class="{kecil} text-danger" onclick={() => hapus(p)}>Hapus</button>
{/snippet}

<div class="sticky top-0 z-10 -mx-4 flex flex-wrap items-end justify-between gap-2 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur">
	<label class="grid gap-1 text-xs font-semibold">
		Nama dasbor
		<input class="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm" maxlength="40" bind:value={nama} />
	</label>
	<div class="flex flex-wrap gap-2">
		<button type="button" class="{tombol} bg-surface-2" onclick={tambah}>+ Tambah panel</button>
		<button type="button" class="{tombol} bg-brand text-on-brand" disabled={menyimpan} onclick={simpan}>Simpan</button>
		<button type="button" class="{tombol} bg-surface-2" disabled={menyimpan} onclick={() => onselesai()}>Batal</button>
	</div>
	{#if pesan}<p class="w-full text-sm text-danger" role="alert">{pesan}</p>{/if}
</div>

<div class="mt-3">
	<p class="mb-1 text-xs font-semibold text-muted">Saringan bawaan saat dasbor dibuka</p>
	<SaringanAtas bind:saringan={saringanBawaan} {outlets} />
	<p class="mt-2 text-xs text-muted">
		{lebar ? 'Seret panel lewat ⠿ dan tarik sudut kanan bawah untuk mengubah ukuran.' : 'Atur urutan dengan ↑ ↓, lalu lebar & tinggi tiap panel.'}
	</p>
</div>

{#if lebar}
	<KisiSunting {panel} saringan={saringanBawaan} {outlets} {sekarang} onletak={letak} {aksi} />
{:else}
	<DaftarSuntingHp {panel} onubah={(p) => (panel = p)} {aksi} />
{/if}

{#if form}
	<FormPanel awal={form.panel} saringan={saringanBawaan} {outlets} onsimpan={pakai} onbatal={() => (form = null)} />
{/if}
