<script lang="ts">
	import { auth } from '#lib/auth/session.svelte.ts';
	import { validateUsername } from '#lib/auth/username.ts';
	import Logo from '#lib/components/brand/Logo.svelte';
	import ThemeToggle from '#lib/components/theme/ThemeToggle.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';

	let username = $state('');
	let password = $state('');
	let lihatPassword = $state(false);
	let errUsername = $state('');
	let errPassword = $state('');
	let errUmum = $state<string | null>(null);
	let memproses = $state(false);

	async function masuk(e: SubmitEvent) {
		e.preventDefault();
		errUsername = validateUsername(username) ?? '';
		errPassword = password.length === 0 ? 'Password wajib diisi.' : '';
		errUmum = null;
		if (errUsername || errPassword) return;
		memproses = true;
		errUmum = await auth.signIn(username, password);
		memproses = false;
	}
</script>

<svelte:head><title>Masuk · Kasir D'Kriuk</title></svelte:head>

<!-- Panel kiri memakai merah logo yang tetap di kedua tema, supaya menyatu dengan gambar wordmark. -->
<div class="grid min-h-dvh bg-[#e42127] lg:grid-cols-2">
	<section class="hidden flex-col justify-between p-10 text-white lg:flex">
		<Logo size="lg" wordmark />
		<p class="font-display text-5xl leading-tight">Ayam kriuk,<br />catatan rapi.</p>
		<p class="text-sm opacity-90">Bukit Lama · Talang Kerangga · Kertapati</p>
	</section>

	<section class="grid place-items-center bg-bg px-4 py-10 lg:rounded-l-[2rem]">
		<div class="w-full max-w-sm">
			<div class="mb-8 flex items-center justify-between">
				<div class="flex items-center gap-3 lg:hidden">
					<Logo size="md" />
					<span class="font-display text-2xl text-brand">Kasir D'Kriuk</span>
				</div>
				<span class="hidden font-display text-2xl text-brand lg:inline">Masuk</span>
				<ThemeToggle />
			</div>

			{#if auth.notice}
				<p class="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">
					{auth.notice}
				</p>
			{/if}

			<form class="grid gap-5" onsubmit={masuk} novalidate>
				<TextField
					id="username"
					label="Username"
					bind:value={username}
					error={errUsername}
					autocomplete="username"
					autocapitalize="none"
					spellcheck={false}
					placeholder="contoh: kasir.bukitlama"
				/>
				<div class="grid gap-2">
					<TextField
						id="password"
						label="Password"
						type={lihatPassword ? 'text' : 'password'}
						bind:value={password}
						error={errPassword}
						autocomplete="current-password"
					/>
					<label class="flex min-h-10 items-center gap-2 text-sm text-muted">
						<input id="lihat-password" type="checkbox" bind:checked={lihatPassword} class="size-4 accent-brand" />
						Tampilkan password
					</label>
				</div>

				{#if errUmum}
					<p class="text-sm font-semibold text-danger" role="alert">{errUmum}</p>
				{/if}

				<Button type="submit" loading={memproses} class="text-lg">Masuk</Button>
			</form>
		</div>
	</section>
</div>
