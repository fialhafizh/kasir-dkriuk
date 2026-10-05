-- Tahap 4a: perangkat kasir, shift dari perangkat (digabung saat sinkron), jejak penjualan offline.

create table public.perangkat (
  id uuid primary key,
  kode integer generated always as identity unique,
  outlet_id uuid references public.outlets (id) on delete restrict,
  label text check (label is null or length(label) <= 60),
  terakhir_oleh uuid references public.profiles (id) on delete restrict,
  terakhir_sinkron timestamptz,
  dibuat_at timestamptz not null default now()
);

-- id = id shift yang dibuat perangkat; shift_id = shift sebenarnya (sama, atau shift lain bila digabung).
create table public.shift_perangkat (
  id uuid primary key,
  shift_id uuid not null references public.shift (id) on delete restrict,
  perangkat_id uuid references public.perangkat (id) on delete restrict,
  modal integer not null check (modal >= 0),
  dibuka_at timestamptz not null,
  dicatat_at timestamptz not null default now()
);
create index shift_perangkat_shift on public.shift_perangkat (shift_id);

alter table public.shift
  add column digabung boolean not null default false,
  add column jual_setelah_tutup integer not null default 0,
  add column dibuka_lagi_setelah timestamptz,
  add column tutup_id uuid unique;

alter table public.penjualan
  add column kode_struk text unique check (kode_struk ~ '^[0-9A-Z]{6}$'),
  add column nomor_sementara text check (nomor_sementara ~ '^S[0-9]+-[0-9]{3,}$'),
  add column perangkat_id uuid references public.perangkat (id) on delete restrict,
  add column tanpa_stok boolean not null default false;

alter table public.rusak
  add column perangkat_id uuid references public.perangkat (id) on delete restrict,
  add column tanpa_stok boolean not null default false;

-- Penjualan yang jamnya sebelum hitungan fisik (stok awal/opname) tetapi tiba sesudahnya tidak memotong stok.
create or replace function public._gerakan_jual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, penjualan_id)
  select p.outlet_id, r.bahan_id, -sum(n.qty * r.qty), 'jual', p.waktu, p.kasir_id, p.id
  from baru n
  join public.penjualan p on p.id = n.penjualan_id and not p.tanpa_stok
  join public.resep r on r.menu_id = n.menu_id
  join public.bahan b on b.id = r.bahan_id and b.mode = 'otomatis'
  group by p.outlet_id, r.bahan_id, p.waktu, p.kasir_id, p.id;
  return null;
end
$$;

alter table public.perangkat enable row level security;
alter table public.shift_perangkat enable row level security;
revoke all on public.perangkat, public.shift_perangkat from anon, authenticated;
revoke all on sequence public.perangkat_kode_seq from anon, authenticated;
grant select on public.perangkat, public.shift_perangkat to authenticated;
grant all on public.perangkat, public.shift_perangkat to service_role;
grant usage, select on sequence public.perangkat_kode_seq to service_role;
create policy perangkat_baca on public.perangkat for select to authenticated using ((select public.is_admin()));
create policy shift_perangkat_baca on public.shift_perangkat for select to authenticated
  using (exists (select 1 from public.shift s where s.id = shift_id));
