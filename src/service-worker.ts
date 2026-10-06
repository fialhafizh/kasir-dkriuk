/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Menyimpan semua file aplikasi supaya bisa dibuka tanpa internet. Data (Supabase) tidak disimpan di sini.
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';
import { version } from '$app/env';

const CACHE = `kasir-${version}`;
const BASE = new URL(self.registration.scope).pathname;
const FILES = [...immutable.map((f) => BASE + f.path), ...assets.map((f) => BASE + f.path), BASE, BASE + 'index.html'];

self.addEventListener('install', (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
	e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});

self.addEventListener('message', (e) => {
	if (e.data === 'pasang-versi-baru') void self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
	const req = e.request;
	const url = new URL(req.url);
	if (req.method !== 'GET' || url.origin !== self.location.origin) return;
	if (req.mode === 'navigate') {
		// Halaman: coba jaringan paling lama 4 detik (sinyal lemah), bila gagal pakai index.html tersimpan (hash router).
		// Belum ada salinan (kunjungan pertama): tetap tunggu jaringan.
		const jaringan = fetch(req);
		const batas = new Promise<Response>((_, tolak) => setTimeout(() => tolak(new Error('lama')), 4000));
		e.respondWith(
			Promise.race([jaringan, batas]).catch(async () => (await caches.match(BASE + 'index.html')) ?? jaringan.catch(() => Response.error()))
		);
		return;
	}
	e.respondWith(caches.match(req).then((r) => r ?? fetch(req)));
});
