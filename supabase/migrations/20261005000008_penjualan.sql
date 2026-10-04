-- Penjualan kasir: shift (modal & tutup toko), penjualan + item, nomor harian per outlet.
-- Pengguna login hanya MEMBACA (RLS); semua penulisan lewat fungsi di migrasi 0009.

create type public.metode_bayar as enum ('cash', 'qris', 'gofood', 'grabfood', 'shopeefood');

-- Tanggal bisnis WIB (UTC+7, tanpa musim panas).
create function public.tanggal_wib(t timestamptz) returns date
language sql immutable set search_path = '' as $$
  select (t at time zone 'Asia/Jakarta')::date
$$;

create table public.shift (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  dibuka_oleh uuid not null references public.profiles (id) on delete restrict,
  dibuka_at timestamptz not null default now(),
  modal integer not null default 0 check (modal >= 0 and modal <= 100000000),
  ditutup_oleh uuid references public.profiles (id) on delete restrict,
  ditutup_at timestamptz,
  uang_fisik integer check (uang_fisik is null or (uang_fisik >= 0 and uang_fisik <= 1000000000)),
  catatan text check (catatan is null or length(catatan) <= 500),
  constraint shift_tutup_lengkap check ((ditutup_at is null) = (ditutup_oleh is null) and (ditutup_at is null) = (uang_fisik is null))
);
create unique index shift_satu_terbuka on public.shift (outlet_id) where ditutup_at is null;

create table public.penjualan (
  id uuid primary key,
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  shift_id uuid not null references public.shift (id) on delete restrict,
  kasir_id uuid not null references public.profiles (id) on delete restrict,
  nomor text not null unique,
  waktu timestamptz not null default now(),
  metode public.metode_bayar not null,
  total integer not null check (total >= 0),
  diterima integer,
  kembalian integer,
  void_at timestamptz,
  void_oleh uuid references public.profiles (id) on delete restrict,
  void_alasan text,
  constraint penjualan_cash check (
    (metode = 'cash' and diterima is not null and diterima >= total and kembalian = diterima - total)
    or (metode <> 'cash' and diterima is null and kembalian is null)
  ),
  constraint penjualan_void_lengkap check (
    (void_at is null and void_oleh is null and void_alasan is null)
    or (void_at is not null and void_oleh is not null and length(trim(void_alasan)) >= 3)
  )
);
create index penjualan_outlet_waktu on public.penjualan (outlet_id, waktu);
create index penjualan_shift on public.penjualan (shift_id);

create table public.penjualan_item (
  penjualan_id uuid not null references public.penjualan (id) on delete restrict,
  menu_id uuid not null references public.menu (id) on delete restrict,
  nama text not null,
  harga integer not null check (harga >= 0),
  qty integer not null check (qty between 1 and 999),
  subtotal integer generated always as (harga * qty) stored,
  primary key (penjualan_id, menu_id)
);

create table public.nomor_harian (
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  tanggal date not null,
  terakhir integer not null,
  primary key (outlet_id, tanggal)
);

alter table public.shift enable row level security;
alter table public.penjualan enable row level security;
alter table public.penjualan_item enable row level security;
alter table public.nomor_harian enable row level security;

revoke all on public.shift, public.penjualan, public.penjualan_item, public.nomor_harian from anon, authenticated;
grant select on public.shift, public.penjualan, public.penjualan_item to authenticated;
grant all on public.shift, public.penjualan, public.penjualan_item, public.nomor_harian to service_role;

create policy shift_baca on public.shift for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy penjualan_baca on public.penjualan for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy penjualan_item_baca on public.penjualan_item for select to authenticated
  using (exists (select 1 from public.penjualan p where p.id = penjualan_id));
