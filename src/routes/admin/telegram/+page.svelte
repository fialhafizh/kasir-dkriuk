<script lang="ts">
	import { onMount } from 'svelte';
	import { formatWaktuWib } from '#lib/kasir/waktu.ts';
	import { formatAngka, parseRupiah } from '#lib/master/rupiah.ts';
	import {
		hubungkanGrup,
		KELOMPOK_JENIS,
		kirimUji,
		kirimUlang,
		labelJenis,
		muatStatus,
		simpanPengaturan,
		teksPolos,
		type StatusTelegram
	} from '#lib/telegram/api.ts';

	let st = $state<StatusTelegram | null>(null);
	let status = $state<'memuat' | 'siap' | 'gagal'>('memuat');
	let pesan = $state('');
	let fJam = $state('22:00');
	let fBatas = $state('');
	let mati = $state<Set<string>>(new Set());
	type Pesan = { teks: string; galat: boolean } | null;
	let pesanAtur = $state<Pesan>(null);
	let pesanGrup = $state<Pesan>(null);
	let pesanGagal = $state<Pesan>(null);
	let pilihan = $state<{ chat_id: number; judul: string }[]>([]);
	let hasilUji = $state<{ topik: string; ok: boolean; galat?: string }[]>([]);
	let memproses = $state(false);

	function isiForm(s: StatusTelegram) {
		fJam = s.jam_harian;
		fBatas = formatAngka(s.batas_pengeluaran);
		mati = new Set(s.jenis_mati);
	}
	async function muat() {
		try {
			st = await muatStatus();
			isiForm(st);
			status = 'siap';
		} catch (e) {
			pesan = (e as Error).message;
			status = 'gagal';
		}
	}
	onMount(muat);
	/** Muat ulang status setelah aksi tanpa menimpa isian formulir yang belum disimpan. */
	async function segarkan() {
		st = await muatStatus();
	}

	async function jalankan(fn: () => Promise<string | void>, tulis: (p: Pesan) => void) {
		if (memproses) return;
		memproses = true;
		tulis(null);
		try {
			const ok = await fn();
			if (ok) tulis({ teks: ok, galat: false });
		} catch (e) {
			tulis({ teks: (e as Error).message, galat: true });
		} finally {
			memproses = false;
		}
	}

	const hubungkan = (chatId?: number) =>
		jalankan(async () => {
			const h = await hubungkanGrup(chatId);
			if (!h.ok) return void (pilihan = h.pilih);
			pilihan = [];
			await segarkan();
			return `Terhubung ke grup "${h.judul}".${h.dibuat ? ` ${h.dibuat} topik dibuat.` : ''}`;
		}, (m) => (pesanGrup = m));

	const uji = () => {
		hasilUji = [];
		return jalankan(async () => {
			hasilUji = (await kirimUji()).hasil;
		}, (m) => (pesanGrup = m));
	};

	function ubahJenis(kunci: string, nyala: boolean) {
		const s = new Set(mati);
		if (nyala) s.delete(kunci);
		else s.add(kunci);
		mati = s;
	}

	const simpan = (e: SubmitEvent) => {
		e.preventDefault();
		const batas = parseRupiah(fBatas, 100_000_000);
		if (batas === null) return void (pesanAtur = { teks: 'Isi batas pengeluaran, mis. 100.000.', galat: true });
		return jalankan(async () => {
			await simpanPengaturan({ jam_harian: fJam, batas_pengeluaran: batas, jenis_mati: [...mati] });
			await segarkan();
			if (st) isiForm(st);
			return 'Pengaturan disimpan.';
		}, (m) => (pesanAtur = m));
	};

	const ulang = (id: number | null) =>
		jalankan(async () => {
			const n = await kirimUlang(id);
			await segarkan();
			return `${n} pesan dijadwalkan kirim ulang.`;
		}, (m) => (pesanGagal = m));
	const kotak = 'min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-fg';
	const tombol = 'min-h-12 rounded-xl px-4 font-semibold disabled:opacity-60';
</script>

<svelte:head><title>Telegram · Admin D'Kriuk</title></svelte:head>

<h1 class="font-display text-3xl">Telegram</h1>
<p class="mt-1 max-w-prose text-sm text-muted">
	Laporan otomatis ke grup Telegram: struk, tutup toko & ringkasan harian, peringatan, dan kas, masing-masing di topiknya. Pesan dikirim
	sekitar tiap menit; bila internet atau Telegram gangguan, pesan dicoba lagi otomatis.
</p>

{#if status === 'memuat'}
	<p class="mt-4 text-muted" role="status">Memuat…</p>
{:else if status === 'gagal' || !st}
	<p class="mt-4 text-danger" role="alert">{pesan}</p>
{:else}
	<section class="mt-6 grid max-w-2xl gap-3 rounded-2xl border bg-surface p-4 {st.terhubung ? 'border-line' : 'border-warn'}">
		<h2 class="font-display text-xl">Grup</h2>
		{#if st.terhubung}
			<p>
				Terhubung ke <b>{st.chat_judul ?? 'grup'}</b>{st.topik_lengkap ? '' : ' (topik belum lengkap — tekan Hubungkan lagi)'}.
			</p>
			<p class="text-sm text-muted">
				Menunggu dikirim: {st.menunggu} · terakhir terkirim: {st.terkirim_terakhir ? `${formatWaktuWib(st.terkirim_terakhir)} WIB` : 'belum ada'}
			</p>
		{:else}
			<p class="text-sm">
				Belum terhubung. Buat grup Telegram, aktifkan <b>Topics</b>, jadikan bot admin dengan izin <b>Kelola Topik</b>, kirim satu pesan di grup,
				lalu tekan Hubungkan.
			</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			<button type="button" class="{tombol} bg-brand text-on-brand" disabled={memproses} onclick={() => hubungkan()}>
				{st.terhubung ? 'Hubungkan ulang' : 'Hubungkan grup'}
			</button>
			{#if st.terhubung}
				<button type="button" class="{tombol} bg-surface-2" disabled={memproses} onclick={uji}>Kirim pesan uji</button>
			{/if}
		</div>
		{#if pilihan.length}
			<p class="text-sm font-semibold">Bot ada di beberapa grup. Pilih grup laporan:</p>
			<div class="flex flex-wrap gap-2">
				{#each pilihan as g (g.chat_id)}
					<button type="button" class="{tombol} bg-surface-2" disabled={memproses} onclick={() => hubungkan(g.chat_id)}>{g.judul}</button>
				{/each}
			</div>
		{/if}
		{#if pesanGrup}<p class="text-sm {pesanGrup.galat ? 'text-danger' : ''}" role={pesanGrup.galat ? 'alert' : 'status'}>{pesanGrup.teks}</p>{/if}
		{#if hasilUji.length}
			<ul class="grid gap-1 text-sm">
				{#each hasilUji as h (h.topik)}
					<li class={h.ok ? 'text-ok' : 'text-danger'}>{h.ok ? '✓' : '✗'} {h.topik}{h.galat ? ` — ${h.galat}` : ''}</li>
				{/each}
			</ul>
		{/if}
	</section>

	<form class="mt-6 grid max-w-2xl gap-4 rounded-2xl border border-line bg-surface p-4" onsubmit={simpan} novalidate>
		<h2 class="font-display text-xl">Pengaturan</h2>
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="grid gap-1.5">
				<label for="tg-jam" class="text-sm font-semibold">Jam ringkasan harian (WIB)</label>
				<input id="tg-jam" type="time" bind:value={fJam} class={kotak} />
			</div>
			<div class="grid gap-1.5">
				<label for="tg-batas" class="text-sm font-semibold">Lapor pengeluaran laci mulai</label>
				<input id="tg-batas" bind:value={fBatas} inputmode="numeric" class="tabular text-right {kotak}" />
			</div>
		</div>
		{#each KELOMPOK_JENIS as k (k.topik)}
			<fieldset class="grid gap-1">
				<legend class="text-sm font-semibold">{k.topik}</legend>
				{#each k.jenis as j (j.kunci)}
					<label class="flex min-h-11 items-center gap-3">
						<input
							type="checkbox"
							class="size-5"
							checked={!mati.has(j.kunci)}
							onchange={(e) => ubahJenis(j.kunci, (e.currentTarget as HTMLInputElement).checked)}
						/>
						{j.label}
					</label>
				{/each}
			</fieldset>
		{/each}
		{#if pesanAtur}<p class="text-sm {pesanAtur.galat ? 'text-danger' : ''}" role={pesanAtur.galat ? 'alert' : 'status'}>{pesanAtur.teks}</p>{/if}
		<div><button type="submit" disabled={memproses} class="{tombol} bg-brand text-on-brand">Simpan pengaturan</button></div>
	</form>

	{#if st.gagal.length}
		<h2 class="mt-8 font-display text-2xl">Pesan gagal terkirim</h2>
		<p class="mt-1 max-w-prose text-sm text-muted">Sudah dicoba 10 kali. Periksa grup/bot, lalu kirim ulang.</p>
		<button type="button" class="mt-2 {tombol} bg-surface-2" disabled={memproses} onclick={() => ulang(null)}>Kirim ulang semua</button>
		{#if pesanGagal}<p class="mt-2 text-sm {pesanGagal.galat ? 'text-danger' : ''}" role={pesanGagal.galat ? 'alert' : 'status'}>{pesanGagal.teks}</p>{/if}
		<ul class="mt-3 grid gap-2">
			{#each st.gagal as g (g.id)}
				<li class="grid gap-1 rounded-2xl border border-warn bg-surface p-3 text-sm">
					<p class="font-semibold">{formatWaktuWib(g.dibuat_at)} WIB · {labelJenis(g.jenis)}</p>
					<p class="line-clamp-2 whitespace-pre-line text-muted">{teksPolos(g.cuplikan)}</p>
					{#if g.galat}<p class="text-danger">{g.galat}</p>{/if}
					<div><button type="button" class="min-h-11 rounded-xl bg-surface-2 px-3 font-semibold" disabled={memproses} onclick={() => ulang(g.id)}>Kirim ulang</button></div>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
