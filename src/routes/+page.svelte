<script lang="ts">
	import Logo from '#lib/components/brand/Logo.svelte';
	import ThemeToggle from '#lib/components/theme/ThemeToggle.svelte';
	import Button from '#lib/components/ui/Button.svelte';
</script>

<main class="grid min-h-dvh place-items-center gap-6 p-6">
	<Logo size="lg" />
	<h1 class="font-display text-4xl text-brand">Kasir D'Kriuk</h1>
	<div class="flex gap-3"><Button>Utama</Button><Button variant="secondary">Kedua</Button><ThemeToggle /></div>
</main>
