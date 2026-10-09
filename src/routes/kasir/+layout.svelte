<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { routePath } from '#lib/auth/guard.ts';
	import KasirNav from '#lib/components/kasir/KasirNav.svelte';
	import PilihOutlet from '#lib/components/kasir/PilihOutlet.svelte';
	import AppShell from '#lib/components/layout/AppShell.svelte';
	import { onMount } from 'svelte';
	import PenandaSinkron from '#lib/components/kasir/PenandaSinkron.svelte';
	import { pos } from '#lib/kasir/pos.svelte.ts';
	import { hitungMilikLain } from '#lib/offline/antrean.ts';
	import { bacaPerangkat, simpanKode } from '#lib/offline/perangkat.ts';
	import { dbKasir, sinkron } from '#lib/offline/sinkron.svelte.ts';
	import { supabase } from '#lib/supabase/client.ts';
	import { muatStokKasir } from '#lib/stok/kasir-lokal.ts';
	import { muatKaryawanOutlet, muatKategori } from '#lib/kas/api.ts';
	import { saldoLaciPerangkat } from '#lib/kas/laci.ts';
	import { denganSalinan } from '#lib/offline/salinan.ts';

	let { children } = $props();

	const perangkat = typeof localStorage === 'undefined' ? null : bacaPerangkat(localStorage);
	onMount(() => {
		if (perangkat) sinkron.mulai(perangkat.id);
	});

	// Muat shift setiap kali outlet berganti, saat status online berubah, dan setelah antrean terkirim.
	$effect(() => {
		void auth.offline;
		void sinkron.versi;
		if (pos.outlet) void pos.muatShift();
	});

	// Antrean milik akun lain (mis. kasir berganti akun di perangkat ini) tidak dikirim atas nama akun ini.
	let milikLain = $state(0);
	$effect(() => {
		const id = auth.profile?.id ?? null;
		void sinkron.menunggu;
		void sinkron.ditolak;
		hitungMilikLain(dbKasir, id)
			.then((n) => (milikLain = n))
			.catch(() => {});
	});

	// Setelah sinkron selesai & online: perbarui salinan data stok supaya halaman Stok siap dibuka tanpa internet.
	$effect(() => {
		const o = pos.outlet;
		if (!sinkron.versi || !o || auth.offline) return;
		void muatStokKasir(o.id).catch(() => {});
		// Saldo laci & kategori pengeluaran juga disimpan untuk dipakai tanpa internet.
		void saldoLaciPerangkat(o.id).catch(() => {});
		void denganSalinan(dbKasir, 'kategori', muatKategori, () => false).catch(() => {});
		void denganSalinan(dbKasir, `karyawan:${o.id}`, () => muatKaryawanOutlet(o.id), () => false).catch(() => {});
	});

	// Daftarkan perangkat (saat online) supaya punya kode untuk nomor struk sementara.
	$effect(() => {
		const o = pos.outlet;
		if (!o || auth.offline || !perangkat) return;
		void supabase.rpc('daftar_perangkat', { p_id: perangkat.id, p_outlet: o.id }).then(({ data }) => {
			if (typeof data === 'number') simpanKode(localStorage, data);
		});
	});
</script>

<AppShell title="Kasir">
	{#snippet nav()}<KasirNav aktif={routePath(page.url)} />{/snippet}
	{#if auth.offline}
		<div class="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-4 py-2" role="status">
			<p class="min-w-0 flex-1 text-sm font-semibold text-warn">
				Internet terputus. Jualan tetap jalan; data terkirim otomatis saat internet kembali.
			</p>
			<button type="button" class="min-h-12 rounded-xl bg-surface px-4 text-sm font-semibold" onclick={() => auth.cobaLagi()}
				>Coba sambung lagi</button
			>
		</div>
	{/if}
	{#if milikLain}
		<p class="mb-4 rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold text-warn" role="status">
			Ada {milikLain} data belum terkirim milik akun lain di perangkat ini. Minta akun itu masuk di perangkat ini untuk mengirimnya.
		</p>
	{/if}
	{#if auth.profile?.role === 'admin'}<div class="mb-4"><PilihOutlet /></div>{/if}
	{#if !pos.outlet}
		<p class="text-muted">
			{auth.profile?.role === 'admin' ? 'Pilih outlet untuk mulai.' : 'Akun ini belum terhubung ke outlet. Hubungi admin.'}
		</p>
	{:else}
		<PenandaSinkron />
		{@render children()}
	{/if}
</AppShell>
