-- Stok lanjutan (Tahap 3b): rusak/terbuang, transfer antar outlet, opname mingguan.
-- Pengguna login hanya MEMBACA; penulisan lewat fungsi security definer (0014–0016).

create type public.alasan_rusak as enum ('sisa_tidak_laku', 'dimakan_karyawan', 'gosong', 'basi', 'jatuh_rusak', 'lainnya');
create type public.status_transfer as enum ('dikirim', 'diterima', 'dibatalkan');

create table public.rusak (
  id uuid primary key,
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  waktu timestamptz not null default now(),
  alasan public.alasan_rusak not null,
  catatan text check (catatan is null or length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles (id) on delete restrict,
  batal_at timestamptz,
  batal_oleh uuid references public.profiles (id) on delete restrict,
  batal_alasan text,
  constraint rusak_lainnya_bercatatan check (alasan <> 'lainnya' or length(trim(coalesce(catatan, ''))) >= 3),
  constraint rusak_batal_lengkap check ((batal_at is null) = (batal_alasan is null))
);
create index rusak_outlet_waktu on public.rusak (outlet_id, waktu desc);

create table public.rusak_item (
  rusak_id uuid not null references public.rusak (id) on delete restrict,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty numeric(14, 4) not null check (qty > 0),
  primary key (rusak_id, bahan_id)
);

create table public.transfer (
  id uuid primary key,
  dari_outlet_id uuid not null references public.outlets (id) on delete restrict,
  ke_outlet_id uuid not null references public.outlets (id) on delete restrict,
  status public.status_transfer not null default 'dikirim',
  catatan text check (catatan is null or length(catatan) <= 200),
  dikirim_at timestamptz not null default now(),
  dikirim_oleh uuid references public.profiles (id) on delete restrict,
  diubah_at timestamptz,
  diterima_at timestamptz,
  diterima_oleh uuid references public.profiles (id) on delete restrict,
  batal_at timestamptz,
  batal_oleh uuid references public.profiles (id) on delete restrict,
  batal_alasan text,
  constraint transfer_beda_outlet check (dari_outlet_id <> ke_outlet_id),
  constraint transfer_diterima_lengkap check ((status = 'diterima') = (diterima_at is not null)),
  constraint transfer_batal_lengkap check ((status = 'dibatalkan') = (batal_at is not null and batal_alasan is not null))
);
create index transfer_dari on public.transfer (dari_outlet_id, status);
create index transfer_ke on public.transfer (ke_outlet_id, status);

create table public.transfer_item (
  transfer_id uuid not null references public.transfer (id) on delete restrict,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty numeric(14, 4) not null check (qty > 0),
  primary key (transfer_id, bahan_id)
);

create table public.opname (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  status public.status_stok_awal not null default 'diajukan',
  dihitung_at timestamptz not null default now(),
  diajukan_oleh uuid references public.profiles (id) on delete restrict,
  diputus_at timestamptz,
  diputus_oleh uuid references public.profiles (id) on delete restrict,
  catatan text check (catatan is null or length(catatan) <= 200),
  constraint opname_diputus check ((status = 'diajukan') = (diputus_at is null))
);
create unique index opname_satu_diajukan on public.opname (outlet_id) where status = 'diajukan';
create index opname_outlet_dihitung on public.opname (outlet_id, dihitung_at desc);

create table public.opname_item (
  opname_id uuid not null references public.opname (id) on delete restrict,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty_hitung numeric(14, 4) not null check (qty_hitung >= 0 and qty_hitung <= 1000000),
  -- Saldo buku besar s.d. dihitung_at, disimpan saat disetujui (laporan susut).
  qty_sistem numeric(14, 4),
  primary key (opname_id, bahan_id)
);

alter table public.gerakan_stok
  add column rusak_id uuid references public.rusak (id) on delete restrict,
  add column transfer_id uuid references public.transfer (id) on delete restrict,
  add column opname_id uuid references public.opname (id) on delete restrict,
  add constraint gerakan_sumber_rusak check ((jenis in ('rusak', 'rusak_batal')) = (rusak_id is not null)),
  add constraint gerakan_sumber_transfer check ((jenis in ('transfer_keluar', 'transfer_masuk')) = (transfer_id is not null)),
  add constraint gerakan_sumber_opname check ((jenis = 'opname') = (opname_id is not null));
create index gerakan_rusak on public.gerakan_stok (rusak_id) where rusak_id is not null;
create index gerakan_transfer on public.gerakan_stok (transfer_id) where transfer_id is not null;
create index gerakan_opname on public.gerakan_stok (opname_id) where opname_id is not null;

alter table public.rusak enable row level security;
alter table public.rusak_item enable row level security;
alter table public.transfer enable row level security;
alter table public.transfer_item enable row level security;
alter table public.opname enable row level security;
alter table public.opname_item enable row level security;

revoke all on public.rusak, public.rusak_item, public.transfer, public.transfer_item, public.opname, public.opname_item
  from anon, authenticated;
grant select on public.rusak, public.rusak_item, public.transfer, public.transfer_item, public.opname, public.opname_item
  to authenticated;
grant all on public.rusak, public.rusak_item, public.transfer, public.transfer_item, public.opname, public.opname_item
  to service_role;

create policy rusak_baca on public.rusak for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy rusak_item_baca on public.rusak_item for select to authenticated
  using (exists (select 1 from public.rusak r where r.id = rusak_id));
create policy transfer_baca on public.transfer for select to authenticated
  using ((select public.is_admin()) or dari_outlet_id = (select public.my_outlet_id()) or ke_outlet_id = (select public.my_outlet_id()));
-- Hitung buta: outlet tujuan baru melihat isi kiriman setelah selesai (diterima/dibatalkan).
create policy transfer_item_baca on public.transfer_item for select to authenticated
  using (exists (
    select 1 from public.transfer t
    where t.id = transfer_id
      and ((select public.is_admin())
        or t.dari_outlet_id = (select public.my_outlet_id())
        or (t.ke_outlet_id = (select public.my_outlet_id()) and t.status <> 'dikirim'))
  ));
create policy opname_baca on public.opname for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
-- Berisi angka sistem: hanya admin (opname hitung buta).
create policy opname_item_baca on public.opname_item for select to authenticated using ((select public.is_admin()));
