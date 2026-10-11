<script lang="ts">
	// Tombol kecil menuju halaman Hitungan modal (sengaja tidak sebesar menu utama).
	import { href } from '#lib/nav.ts';
</script>

<a
	href={href('/admin/hitungan-modal')}
	class="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-brand hover:border-brand focus-visible:outline-3 focus-visible:outline-focus"
>
	🧮 Hitungan modal per potong
</a>
