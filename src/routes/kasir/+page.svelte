<script lang="ts">
	import { pos } from '#lib/kasir/pos.svelte.ts';
</script>

<svelte:head><title>Kasir · Kasir D'Kriuk</title></svelte:head>
<h1 class="font-display text-3xl">{pos.outlet?.merek} {pos.outlet?.nama}</h1>
