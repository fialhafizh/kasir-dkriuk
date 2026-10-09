-- Tahap 6: notifikasi Telegram. Pesan disusun di DB (trigger) lalu dikirim Edge Function `telegram`.

-- Satu baris pengaturan. chat_id null = belum terhubung (trigger tidak mengantre apa pun).
create table public.telegram_pengaturan (
  id boolean primary key default true check (id),
  chat_id bigint,
  chat_judul text,
  -- id topik (message_thread_id) per kelompok: {"struk":..,"harian":..,"peringatan":..,"kas":..}
  topik jsonb not null default '{}'::jsonb,
  jam_harian time not null default '22:00',
  batas_pengeluaran integer not null default 100000 check (batas_pengeluaran between 0 and 100000000),
  -- jenis pesan yang dimatikan admin (lihat public._tg_topik)
  jenis_mati text[] not null default '{}',
  harian_terakhir date,
  -- alamat Edge Function, diisi saat menghubungkan grup (dipakai pg_cron lewat pg_net)
  fungsi_url text,
  diubah_at timestamptz not null default now()
);
insert into public.telegram_pengaturan (id) values (true);

create table public.telegram_antrean (
  id bigint generated always as identity primary key,
  -- mencegah pesan ganda untuk kejadian yang sama (mis. 'struk:<penjualan_id>')
  kunci text not null unique,
  jenis text not null,
  topik text not null check (topik in ('struk', 'harian', 'peringatan', 'kas')),
  teks text not null check (length(teks) between 1 and 4096),
  dibuat_at timestamptz not null default now(),
  kirim_lagi_at timestamptz not null default now(),
  percobaan integer not null default 0,
  galat text,
  terkirim_at timestamptz
);
create index telegram_antrean_menunggu on public.telegram_antrean (kirim_lagi_at) where terkirim_at is null;

-- Status stok terakhir per baris tampilan stok (kelompok pack / bahan), agar peringatan hanya saat berubah.
create table public.telegram_status_stok (
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  kunci text not null,
  status text not null check (status in ('aman', 'menipis', 'minus')),
  primary key (outlet_id, kunci)
);

alter table public.telegram_pengaturan enable row level security;
alter table public.telegram_antrean enable row level security;
alter table public.telegram_status_stok enable row level security;
-- Tidak ada akses langsung untuk pengguna aplikasi: admin lewat fungsi, Edge Function lewat service_role.
revoke all on public.telegram_pengaturan, public.telegram_antrean, public.telegram_status_stok from anon, authenticated;
grant all on public.telegram_pengaturan, public.telegram_antrean, public.telegram_status_stok to service_role;
