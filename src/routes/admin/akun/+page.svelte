<script lang="ts">
	import { onMount } from 'svelte';
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
	let pesan = $state('');
	let info = $state<{ username: string; password: string; judul: string } | null>(null);

	let fUsername = $state('');
	let fNama = $state('');
	let fRole = $state<'kasir' | 'admin'>('kasir');
	let fOutlet = $state('BL');
	let fError = $state('');
	let membuat = $state(false);

	async function muat() {
		status = 'memuat';
		try {
			[akun, outlets] = await Promise.all([muatAkun(), muatOutlets()]);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);

	const namaOutlet = (id: string | null) => outlets.find((o) => o.id === id)?.nama ?? '—';

	async function buat(e: SubmitEvent) {
		e.preventDefault();
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
			info = { username: r.username!, password: r.password!, judul: 'Akun dibuat' };
			fUsername = '';
			fNama = '';
			await muat();
		} catch (err) {
			fError = (err as Error).message;
		} finally {
			membuat = false;
		}
	}

	async function aksi(fn: () => Promise<unknown>) {
		pesan = '';
		try {
			await fn();
		} catch (err) {
			pesan = (err as Error).message;
		}
		// Muat ulang juga saat gagal, supaya pilihan outlet/tombol kembali ke keadaan sebenarnya.
		await muat();
	}

	const reset = (a: Profile) =>
		aksi(async () => {
			const r = await kirimPerintahAkun({ aksi: 'reset_password', id: a.id });
			info = { username: a.username, password: r.password!, judul: 'Password direset' };
		});
	const setAktif = (a: Profile, aktif: boolean) => aksi(() => kirimPerintahAkun({ aksi: 'set_aktif', id: a.id, aktif }));
	const pindah = (a: Profile, kode: string) => aksi(() => kirimPerintahAkun({ aksi: 'ubah', id: a.id, outlet_kode: kode }));

	async function salin(teks: string) {
		try {
			await navigator.clipboard.writeText(teks);
		} catch {
			// clipboard ditolak: teks tetap bisa diblok dan disalin manual
		}
	}
</script>

<svelte:head><title>Akun · Admin · Kasir D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Akun</h1>
<p class="mt-1 max-w-prose text-muted">Akun kasir terikat ke outlet. Menonaktifkan akun langsung memblokir login.</p>

{#if info}
	<div class="mt-6 rounded-2xl border-2 border-ok bg-surface p-4" role="status">
		<p class="font-semibold">{info.judul}: {info.username}</p>
		<p class="mt-1 text-sm text-muted">Password ini hanya ditampilkan sekali. Catat dan berikan ke pemilik akun.</p>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<code class="tabular rounded-lg bg-surface-2 px-3 py-2 text-lg select-all">{info.password}</code>
			<Button variant="secondary" onclick={() => salin(info!.password)}>Salin</Button>
			<Button variant="ghost" onclick={() => (info = null)}>Tutup</Button>
		</div>
	</div>
{/if}

{#if status === 'memuat'}
	<p class="mt-6 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal'}
	<p class="mt-6 text-danger" role="alert">{pesan}</p>
	<button type="button" class="mt-3 min-h-12 rounded-xl bg-surface-2 px-4 font-semibold" onclick={muat}>Coba lagi</button>
{:else}
	{#if pesan}<p class="mt-4 text-danger" role="alert">{pesan}</p>{/if}

	<ul class="mt-6 grid gap-3">
		{#each akun as a (a.id)}
			<li class="rounded-2xl border border-line bg-surface p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="min-w-0">
						<p class="font-semibold {a.aktif ? '' : 'text-muted line-through'}">{a.nama_tampilan}</p>
						<p class="text-xs text-muted">
							{a.username} · {a.role === 'admin' ? 'Admin' : `Kasir ${namaOutlet(a.outlet_id)}`}{a.aktif ? '' : ' · Nonaktif'}
						</p>
					</div>
					<div class="flex flex-wrap gap-2">
						{#if a.role === 'kasir'}
							<label class="sr-only" for="pindah-{a.id}">Pindah outlet {a.username}</label>
							<select
								id="pindah-{a.id}"
								class="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg"
								value={outlets.find((o) => o.id === a.outlet_id)?.kode}
								onchange={(e) => pindah(a, e.currentTarget.value)}
							>
								{#each outlets as o (o.id)}<option value={o.kode}>{o.nama}</option>{/each}
							</select>
						{/if}
						<Konfirmasi label="Reset password" konfirmasiLabel="Ya, reset" onkonfirmasi={() => reset(a)} />
						{#if a.id !== auth.profile?.id}
							{#if a.aktif}
								<Konfirmasi label="Nonaktifkan" konfirmasiLabel="Ya, nonaktifkan" onkonfirmasi={() => setAktif(a, false)} />
							{:else}
								<Button variant="secondary" onclick={() => setAktif(a, true)}>Aktifkan</Button>
							{/if}
						{/if}
					</div>
				</div>
			</li>
		{/each}
	</ul>

	<h2 class="mt-10 font-display text-2xl">Tambah akun</h2>
	<form class="mt-3 grid max-w-md gap-4" onsubmit={buat} novalidate>
		<TextField id="akun-username" label="Username" bind:value={fUsername} autocapitalize="none" spellcheck={false} placeholder="mis. kasir.bukitlama2" />
		<TextField id="akun-nama" label="Nama tampilan" bind:value={fNama} placeholder="mis. Kasir Bukit Lama (Sore)" />
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
					{#each outlets as o (o.id)}<option value={o.kode}>{o.merek} {o.nama}</option>{/each}
				</select>
			</div>
		{/if}
		{#if fError}<p class="text-sm font-semibold text-danger" role="alert">{fError}</p>{/if}
		<Button type="submit" loading={membuat}>Buat akun</Button>
	</form>
{/if}
