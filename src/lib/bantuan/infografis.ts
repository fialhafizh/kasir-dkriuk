// Infografis panduan: satu file HTML mandiri (tanpa pustaka luar) dari isi.ts → static/panduan.html (npm run panduan).
// Interaktif: tab peran, cari, buka-tutup, mode slide (←/→), tema terang/gelap, cetak (slide = 1 halaman lanskap → PDF/PPT).
import { ALUR_HARIAN, BAGIAN, tebal, type Topik } from './isi.ts';

const TAHAP = [
	['0', 'Fondasi', 'Login, tema, database & aturan akses'],
	['1', 'Data master', 'Outlet, akun, bahan & isi pack, harga, menu & resep'],
	['2', 'Kasir', 'Jualan, 5 cara bayar, struk printer, buka & tutup toko'],
	['3', 'Stok', 'Potong otomatis, barang masuk, sisa, transfer, opname'],
	['4', 'Offline', 'Semua pekerjaan kasir tanpa internet, PWA'],
	['5', 'Keuangan', 'Kas laci, setoran, pengeluaran, gaji & kasbon, laba-rugi'],
	['6', 'Telegram', 'Struk, tutup toko, peringatan, kas, ringkasan harian'],
	['7', 'Dasbor & analisis', 'Dasbor rakitan, kebocoran, belanja, ojol, Excel'],
	['8', 'Rilis', 'Panduan, bantuan di aplikasi, uji menyeluruh']
] as const;

const ARSITEKTUR = [
	['📱', 'HP/tablet kasir', 'Aplikasi terpasang di layar utama; data disimpan dulu di HP saat offline, lalu dikirim berurutan.'],
	['🗄️', 'Server Supabase', 'Database + aturan akses: kasir hanya outletnya, admin semua. Semua hitungan laporan di server.'],
	['🤖', 'Bot Telegram', 'Mengirim struk, tutup toko, peringatan & ringkasan harian ke grup bertopik ±1 menit.'],
	['💻', 'Admin & pemilik', 'Dasbor, analisis, belanja, gaji, laporan, Excel — dari HP atau laptop.']
] as const;

const daftar = (xs: string[] | undefined, tag: 'ol' | 'ul', kelas: string) =>
	xs?.length ? `<${tag} class="${kelas}">${xs.map((x) => `<li>${tebal(x)}</li>`).join('')}</${tag}>` : '';

const atribut = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const polos = (t: Topik) => [t.judul, t.ringkas, t.menu ?? '', ...(t.langkah ?? []), ...(t.catatan ?? []), ...(t.awas ?? [])].join(' ').replace(/\*\*/g, '').toLowerCase();

function kartu(t: Topik, peran: string, bagian: string): string {
	return `<article class="slide topik" data-peran="${peran}" id="t-${t.id}" data-cari="${atribut(polos(t))}">
<p class="label-bagian">${tebal(bagian)}</p>
<header><span class="ikon">${t.ikon}</span><div><h3>${tebal(t.judul)}</h3>${t.menu ? `<p class="menu">📍 ${tebal(t.menu)}</p>` : ''}</div></header>
<p class="ringkas">${tebal(t.ringkas)}</p>
${t.langkah || t.catatan || t.awas ? `<details open><summary>Rincian</summary>${daftar(t.langkah, 'ol', 'langkah')}${daftar(t.catatan, 'ul', 'catatan')}${daftar(t.awas, 'ul', 'awas')}</details>` : ''}
</article>`;
}

const CSS = `
:root{--merah:#e3191f;--kuning:#ffd60a;--bg:#fffaf0;--kartu:#fff;--teks:#2a1a12;--redup:#6b5a4e;--garis:#ecdccb;color-scheme:light}
:root[data-tema=gelap]{--merah:#ff4136;--kuning:#ffd23f;--bg:#1a1210;--kartu:#261c18;--teks:#f6eee6;--redup:#c2b2a3;--garis:#3d2d26;color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-tema=terang]){--merah:#ff4136;--kuning:#ffd23f;--bg:#1a1210;--kartu:#261c18;--teks:#f6eee6;--redup:#c2b2a3;--garis:#3d2d26;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--teks)}
a{color:inherit}h1,h2,h3{line-height:1.2;margin:0}
.wadah{max-width:1100px;margin:0 auto;padding:0 16px}
.sampul{background:linear-gradient(135deg,var(--merah),#b5121a 60%,#7a0b10);color:#fff;padding:48px 0 40px}
.sampul h1{font-size:clamp(2rem,6vw,3.4rem);letter-spacing:-.02em}.sampul p{max-width:60ch;opacity:.95}
.angka{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}.angka div{background:rgba(255,255,255,.14);border-radius:16px;padding:10px 14px}
.angka b{display:block;font-size:1.6rem;color:var(--kuning)}
.alat{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--garis);padding:10px 0}
.alat .wadah{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.alat button,.alat input{min-height:40px;border-radius:12px;border:1px solid var(--garis);background:var(--kartu);color:var(--teks);padding:0 12px;font:inherit;font-size:.9rem}
.alat button[aria-pressed=true]{background:var(--merah);color:#fff;border-color:var(--merah)}.alat input{flex:1;min-width:160px}
section.bab{padding:28px 0}section.bab>h2{font-size:1.7rem;margin-bottom:6px}.pengantar{color:var(--redup);margin:0 0 14px}
.alur{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;counter-reset:a}
.alur li{list-style:none;background:var(--kartu);border:1px solid var(--garis);border-radius:18px;padding:12px;position:relative}
.alur li::before{counter-increment:a;content:counter(a);position:absolute;top:-10px;left:-6px;background:var(--kuning);color:#000;font-weight:800;border-radius:999px;width:26px;height:26px;display:grid;place-items:center;font-size:.8rem}
.alur .ikon{font-size:1.8rem}.alur b{display:block}.alur small{color:var(--redup)}
.arsi{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.arsi div{background:var(--kartu);border:1px solid var(--garis);border-left:6px solid var(--merah);border-radius:16px;padding:12px}
.peta{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
.peta div{background:var(--kartu);border:1px solid var(--garis);border-radius:18px;padding:12px}
.peta a{display:inline-block;margin:3px 4px 0 0;padding:3px 9px;border-radius:999px;background:var(--bg);border:1px solid var(--garis);font-size:.82rem;text-decoration:none}
.kisi{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.topik{background:var(--kartu);border:1px solid var(--garis);border-radius:20px;padding:14px}
.topik header{display:flex;gap:10px;align-items:center}.topik .ikon{font-size:2rem}.menu{margin:2px 0 0;color:var(--redup);font-size:.85rem}
.ringkas{margin:10px 0}details summary{cursor:pointer;font-weight:700;color:var(--merah)}
ol.langkah{counter-reset:l;padding:0;margin:8px 0}ol.langkah li{list-style:none;counter-increment:l;padding-left:34px;position:relative;margin:6px 0}
ol.langkah li::before{content:counter(l);position:absolute;left:0;top:0;width:24px;height:24px;border-radius:999px;background:var(--merah);color:#fff;display:grid;place-items:center;font-size:.8rem;font-weight:700}
ul.catatan{padding-left:20px}ul.awas{list-style:none;padding:8px 10px;border:2px solid #d18a00;border-radius:12px}ul.awas li::before{content:"⚠️ "}
.waktu{display:grid;gap:8px}.waktu div{display:grid;grid-template-columns:44px 1fr;gap:10px;align-items:center;background:var(--kartu);border:1px solid var(--garis);border-radius:14px;padding:8px 12px}
.waktu b{font-size:1.3rem;color:var(--merah);text-align:center}
.label-bagian{display:none;margin:0 0 6px;color:var(--redup);font-size:.85rem;font-weight:700}
.sembunyi{display:none!important}footer{color:var(--redup);font-size:.85rem;padding:24px 0 48px}
body.slide-mode .alat .cari{display:none}body.slide-mode .slide{display:none}body.slide-mode .slide.aktif{display:block}
body.slide-mode main .slide{max-width:1000px;min-height:min(560px,75vh);margin:16px auto;padding:28px;border-radius:24px;background:var(--kartu);border:1px solid var(--garis);font-size:1.15rem}
body.slide-mode details{pointer-events:none}body.slide-mode .label-bagian{display:block}
body.slide-mode section.bab:not(.slide){padding:0}body.slide-mode section.bab:not(.slide)>.wadah>h2,body.slide-mode section.bab:not(.slide)>.wadah>.pengantar{display:none}
body.slide-mode .kisi{display:block}body.slide-mode details summary{display:none}
.nav-slide{display:none}body.slide-mode .nav-slide{display:flex;gap:8px;justify-content:center;align-items:center;padding:10px}
@media print{.alat,.nav-slide{display:none!important}details>*{display:block}body{background:#fff;color:#000}.topik,.slide{break-inside:avoid}
body.slide-mode .slide{display:block!important;break-after:page;min-height:auto;border:none}
body.slide-mode .slide.sembunyi,body.slide-mode .sembunyi .slide{display:none!important}@page{size:A4 landscape;margin:12mm}}
`;

const JS = `
const $=(s,e=document)=>[...e.querySelectorAll(s)];
let peran='semua',slide=0;
function saring(){const q=document.getElementById('cari').value.toLowerCase().trim();
 $('main .topik').forEach(t=>{const ok=(peran==='semua'||t.dataset.peran===peran||t.dataset.peran==='umum')&&(!q||t.dataset.cari.includes(q));t.classList.toggle('sembunyi',!ok)});
 $('main section.bab[data-peran]').forEach(s=>s.classList.toggle('sembunyi',!$('.topik',s).some(t=>!t.classList.contains('sembunyi'))));}
$('[data-tab]').forEach(b=>b.onclick=()=>{peran=b.dataset.tab;$('[data-tab]').forEach(x=>x.setAttribute('aria-pressed',x===b));saring();if(document.body.classList.contains('slide-mode'))tampil(0)});
document.getElementById('cari').oninput=saring;
const terlihat=()=>$('.slide').filter(s=>!s.classList.contains('sembunyi')&&!s.closest('.sembunyi'));
function tampil(i){const d=terlihat();slide=Math.max(0,Math.min(i,d.length-1));$('.slide').forEach(s=>s.classList.remove('aktif'));if(d[slide])d[slide].classList.add('aktif');
 $('.hitung').forEach(h=>h.textContent=(d.length?slide+1:0)+' / '+d.length);scrollTo(0,0)}
document.getElementById('mode').onclick=e=>{const on=document.body.classList.toggle('slide-mode');e.target.setAttribute('aria-pressed',on);if(on)tampil(0)};
$('[data-geser]').forEach(b=>b.onclick=()=>tampil(slide+Number(b.dataset.geser)));
addEventListener('keydown',e=>{if(!document.body.classList.contains('slide-mode'))return;if(e.key==='ArrowRight'||e.key==='PageDown')tampil(slide+1);if(e.key==='ArrowLeft'||e.key==='PageUp')tampil(slide-1)});
const tema=document.getElementById('tema');
function pasangTema(t){if(t)document.documentElement.dataset.tema=t;tema.setAttribute('aria-pressed',document.documentElement.dataset.tema==='gelap')}
try{pasangTema(localStorage.getItem('panduan-tema'))}catch(e){}
tema.onclick=()=>{const r=document.documentElement;const gelap=r.dataset.tema?r.dataset.tema==='gelap':matchMedia('(prefers-color-scheme: dark)').matches;pasangTema(gelap?'terang':'gelap');try{localStorage.setItem('panduan-tema',r.dataset.tema)}catch(e){}};
addEventListener('beforeprint',()=>$('details').forEach(d=>d.open=true));
document.getElementById('cetak').onclick=()=>print();
`;

export function buatInfografis(): string {
	const jumlahTopik = BAGIAN.reduce((t, b) => t + b.topik.length, 0);
	const peta = BAGIAN.map(
		(b) => `<div><h3>${b.ikon} ${tebal(b.judul)}</h3>${b.topik.map((t) => `<a href="#t-${t.id}">${t.ikon} ${tebal(t.judul)}</a>`).join('')}</div>`
	).join('');
	const bab = BAGIAN.map(
		(b) => `<section class="bab" data-peran="${b.peran}" id="b-${b.id}"><div class="wadah"><h2>${b.ikon} ${tebal(b.judul)}</h2><p class="pengantar">${tebal(b.pengantar)}</p>
<div class="kisi">${b.topik.map((t) => kartu(t, b.peran, `${b.ikon} ${b.judul}`)).join('\n')}</div></div></section>`
	).join('\n');
	return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panduan Kasir D'Kriuk</title><meta name="description" content="Panduan lengkap aplikasi kasir, stok, dan keuangan D'Kriuk & D'Krizzpy.">
<style>${CSS}</style></head><body>
<!-- Dibuat otomatis oleh "npm run panduan" dari src/lib/bantuan/isi.ts — jangan diubah langsung. -->
<div class="slide sampul" id="sampul"><div class="wadah">
<p>📘 Panduan lengkap</p><h1>Kasir D'Kriuk</h1>
<p>Aplikasi kasir, stok, dan keuangan untuk Bukit Lama, Talang Kerangga (D'Kriuk), dan Kertapati (D'Krizzpy) — jualan, stok otomatis, kas & gaji, laporan Telegram, dasbor, dan analisis.</p>
<div class="angka"><div><b>3</b>outlet</div><div><b>${jumlahTopik}</b>topik panduan</div><div><b>100%</b>pekerjaan kasir bisa offline</div><div><b>4</b>topik grup Telegram</div></div>
</div></div>
<nav class="alat" aria-label="Alat panduan"><div class="wadah">
<button data-tab="semua" aria-pressed="true">Semua</button><button data-tab="kasir" aria-pressed="false">Kasir</button><button data-tab="admin" aria-pressed="false">Admin</button><button data-tab="pemilik" aria-pressed="false">Pemilik</button>
<input id="cari" class="cari" type="search" placeholder="Cari: setoran, opname, printer…" aria-label="Cari">
<button id="mode" aria-pressed="false">Mode slide</button><button id="tema" aria-pressed="false">Tema gelap</button><button id="cetak">Cetak / PDF</button>
</div></nav>
<div class="nav-slide"><button data-geser="-1">← Sebelumnya</button><span class="hitung" aria-live="polite"></span><button data-geser="1">Berikutnya →</button></div>
<main>
<section class="bab slide" id="alur"><div class="wadah"><h2>🔄 Alur harian</h2><p class="pengantar">Dari buka toko sampai laporan di HP pemilik.</p>
<ol class="alur">${ALUR_HARIAN.map((a) => `<li><span class="ikon">${a.ikon}</span><b>${a.judul}</b><small>${a.isi}</small></li>`).join('')}</ol></div></section>
<section class="bab slide" id="arsitektur"><div class="wadah"><h2>🧩 Cara kerja</h2><p class="pengantar">Bagian-bagian aplikasi dan bagaimana data mengalir.</p>
<div class="arsi">${ARSITEKTUR.map(([i, j, k]) => `<div><b>${i} ${j}</b><p>${k}</p></div>`).join('')}</div></div></section>
<section class="bab slide" id="peta"><div class="wadah"><h2>🗺️ Peta fitur</h2><p class="pengantar">Ketuk untuk lompat ke topiknya.</p><div class="peta">${peta}</div></div></section>
${bab}
<section class="bab slide" id="tahap"><div class="wadah"><h2>🏗️ Tahapan pembangunan</h2><p class="pengantar">Aplikasi dibangun bertahap; setiap tahap diuji sebelum dipakai.</p>
<div class="waktu">${TAHAP.map(([n, j, k]) => `<div><b>${n}</b><span><strong>${j}</strong> — ${k}</span></div>`).join('')}</div></div></section>
</main>
<div class="nav-slide"><button data-geser="-1">← Sebelumnya</button><span class="hitung" aria-live="polite"></span><button data-geser="1">Berikutnya →</button></div>
<footer><div class="wadah">Buka aplikasi: fialhafizh.github.io/kasir-dkriuk · <a href="daftar-uji.html">Daftar uji coba</a> · Bantuan yang sama ada di menu <b>Bantuan</b> aplikasi. Mode slide + Cetak = satu slide per halaman (simpan PDF, lalu bisa diubah ke PPT).</div></footer>
<script>${JS}</script></body></html>
`;
}
