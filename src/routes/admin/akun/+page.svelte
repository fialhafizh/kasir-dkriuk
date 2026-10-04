<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { kirimPerintahAkun, muatAkun } from '#lib/akun/api.ts';
	import { auth } from '#lib/auth/session.svelte.ts';
	import { validateUsername } from '#lib/auth/username.ts';
	import Button from '#lib/components/ui/Button.svelte';
	import Konfirmasi from '#lib/components/ui/Konfirmasi.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import { muatOutlets } from '#lib/master/api.ts';
	import type { Outlet, Profile } from '#lib/types/db.ts';

	let akun = $state<Profile[]>([]);
	let outlets = $state<Outlet[]>([]);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesanMuat = $state('');
	let pesanBaris = $state<Record<string, string>>({});
	let sibuk = $state<string | null>(null);
	let info = $state<{ username: string; password: string; judul: string } | null>(null);
	let tersalin = $state(false);
	let kotakInfo = $state<HTMLDivElement>();
	// Outlet tujuan yang dipilih per akun; dipindah hanya setelah dikonfirmasi.
	let tujuan = $state<Record<string, string>>({});

	let fUsername = $state('');
	let fNama = $state('');
	let fRole = $state<'kasir' | 'admin'>('kasir');
	let fOutlet = $state('BL');
	let fError = $state('');
	let membuat = $state(false);

	async function muat(diam = false) {
		if (!diam) status = 'memuat';
		try {
			[akun, outlets] = await Promise.all([muatAkun(), muatOutlets()]);
			tujuan = Object.fromEntries(akun.map((a) => [a.id, kodeOutlet(a.outlet_id)]));
			status = 'siap';
		} catch (e) {
			pesanMuat = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(() => muat());

	const outletDari = (id: string | null) => outlets.find((o) => o.id === id);
	const kodeOutlet = (id: string | null) => outletDari(id)?.kode ?? '';
	const labelOutlet = (o: Outlet | undefined) => (o ? `${o.merek} ${o.nama}` : '—');

	// Password hanya ditampilkan sekali: bawa ke layar dan fokuskan supaya tidak terlewat.
	async function tampilkan(username: string, password: string, judul: string) {
		info = { username, password, judul };
		tersalin = false;
		await tick();
		kotakInfo?.scrollIntoView({ block: 'center', behavior: 'smooth' });
		kotakInfo?.focus();
	}

	async function buat(e: SubmitEvent) {
		e.preventDefault();
		info = null;
		fError = validateUsername(fUsername) ?? (fNama.trim() ? '' : 'Nama tampilan wajib diisi.');
		if (fError) return;
		membuat = true;
		try {
			const r = await kirimPerintahAkun({
				aksi: 'buat',
				username: fUsername,
				nama_tampilan: fNama,
				role: fRole,
				outlet_kode: fRole === 'kasir' ? fOutlet : null
			});
			fUsername = '';
			fNama = '';
			await muat(true);
			await tampilkan(r.username!, r.password!, 'Akun dibuat');
		} catch (err) {
			fError = (err as Error).message;
		} finally {
			membuat = false;
		}
	}

	async function aksi(a: Profile, fn: () => Promise<void>) {
		info = null;
		pesanBaris[a.id] = '';
		sibuk = a.id;
		try {
			await fn();
		} catch (err) {
			pesanBaris[a.id] = (err as Error).message;
		} finally {
			sibuk = null;
		}
		// Muat ulang tanpa layar memuat, juga saat gagal, supaya tampilan sama dengan server.
		await muat(true);
	}

	const reset = (a: Profile) =>
		aksi(a, async () => {
			const r = await kirimPerintahAkun({ aksi: 'reset_password', id: a.id });
			await tampilkan(a.username, r.password!, 'Password direset');
		});
	const setAktif = (a: Profile, aktif: boolean) =>
		aksi(a, async () => {
			await kirimPerintahAkun({ aksi: 'set_aktif', id: a.id, aktif });
		});
	const pindah = (a: Profile) =>
		aksi(a, async () => {
			await kirimPerintahAkun({ aksi: 'ubah', id: a.id, outlet_kode: tujuan[a.id] });
		});

	async function salin(teks: string) {
		try {
			await navigator.clipboard.writeText(teks);
			tersalin = true;
		} catch {
			// clipboard ditolak: teks tetap bisa diblok dan disalin manual
		}
	}
</script>

<svelte:head><title>Akun · Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Akun</h1>
<p class="mt-1 max-w-prose text-muted">Akun kasir terikat ke outlet. Menonaktifkan akun langsung memblokir login.</p>

{#if info}
	<div bind:this={kotakInfo} tabindex="-1" class="mt-6 rounded-2xl border-2 border-ok bg-surface p-4 focus:outline-3 focus:outline-focus">
		<p class="font-semibold">{info.judul}: {info.username}</p>
		<p class="mt-1 text-sm text-muted">
			Password ini hanya ditampilkan sekali. Catat dan berikan langsung ke pemilik akun, lalu tutup kotak ini.
		</p>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<code class="tabular rounded-lg bg-surface-2 px-3 py-2 text-lg select-all">{info.password}</code>
			<Button variant="secondary" onclick={() => salin(info!.password)}>{tersalin ? 'Tersalin ✓' : 'Salin'}</Button>
			<Button variant="ghost" onclick={() => (info = null)}>Tutup</Button>
		</div>
	</div>
{/if}

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesanMuat}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={() => muat()}>Coba lagi</button>
{:else}
	<ul class="mt-6 grid gap-3">
		{#each akun as a (a.id)}
			{@const o = outletDari(a.outlet_id)}
			<li class="rounded-2xl border border-line bg-surface p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="font-semibold {a.aktif ? '' : 'text-muted line-through'}">{a.nama_tampilan}</p>
						<p class="text-xs text-muted">
							{a.username} · {a.role === 'admin' ? 'Admin' : `Kasir ${labelOutlet(o)}`}{a.aktif ? '' : ' · Nonaktif'}
						</p>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<Konfirmasi label="Reset password" konfirmasiLabel="Ya, reset" onkonfirmasi={() => reset(a)} />
						{#if a.id !== auth.profile?.id}
							{#if a.aktif}
								<Konfirmasi label="Nonaktifkan" konfirmasiLabel="Ya, nonaktifkan" onkonfirmasi={() => setAktif(a, false)} />
							{:else}
								<Button variant="secondary" disabled={sibuk !== null} onclick={() => setAktif(a, true)}>Aktifkan</Button>
							{/if}
						{/if}
					</div>
				</div>
				{#if a.role === 'kasir'}
					<div class="mt-3 flex flex-wrap items-end gap-2">
						<div class="grid gap-1">
							<label class="text-xs font-semibold text-muted" for="pindah-{a.id}">Pindah ke outlet</label>
							<select
								id="pindah-{a.id}"
								bind:value={tujuan[a.id]}
								disabled={sibuk !== null}
								class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg"
							>
								{#each outlets as x (x.id)}<option value={x.kode}>{labelOutlet(x)}</option>{/each}
							</select>
						</div>
						{#if tujuan[a.id] && tujuan[a.id] !== o?.kode}
							<Konfirmasi
								label="Pindahkan"
								konfirmasiLabel="Ya, pindah ke {tujuan[a.id]}"
								variant="primary"
								onkonfirmasi={() => pindah(a)}
							/>
						{/if}
					</div>
				{/if}
				{#if sibuk === a.id}<p class="mt-2 text-xs text-muted" role="status">Memproses…</p>{/if}
				{#if pesanBaris[a.id]}<p class="mt-2 text-sm text-danger" role="alert">{pesanBaris[a.id]}</p>{/if}
			</li>
		{/each}
	</ul>

	<h2 class="mt-10 font-display text-2xl">Tambah akun</h2>
	<form class="mt-3 grid max-w-md gap-4" onsubmit={buat} novalidate>
		<TextField
			id="akun-username"
			label="Username"
			bind:value={fUsername}
			autocomplete="off"
			autocapitalize="none"
			spellcheck={false}
			placeholder="mis. kasir.bukitlama2"
		/>
		<TextField id="akun-nama" label="Nama tampilan" bind:value={fNama} autocomplete="off" placeholder="mis. Kasir Bukit Lama (Sore)" />
		<div class="grid gap-1.5">
			<label for="akun-role" class="text-sm font-semibold">Peran</label>
			<select id="akun-role" bind:value={fRole} class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg">
				<option value="kasir">Kasir</option>
				<option value="admin">Admin</option>
			</select>
		</div>
		{#if fRole === 'kasir'}
			<div class="grid gap-1.5">
				<label for="akun-outlet" class="text-sm font-semibold">Outlet</label>
				<select id="akun-outlet" bind:value={fOutlet} class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg">
					{#each outlets as x (x.id)}<option value={x.kode}>{labelOutlet(x)}</option>{/each}
				</select>
			</div>
		{/if}
		{#if fError}<p class="text-sm font-semibold text-danger" role="alert">{fError}</p>{/if}
		<Button type="submit" loading={membuat}>Buat akun</Button>
	</form>
{/if}
