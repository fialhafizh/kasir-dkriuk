-- Fondasi: peran, outlet, profil pengguna, fungsi bantu, dan aturan akses (RLS).

create type public.user_role as enum ('admin', 'kasir');

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique check (kode ~ '^[A-Z]{2,4}$'),
  nama text not null,
  merek text not null,
  alamat text not null,
  telepon text not null,
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  nama_tampilan text not null,
  role public.user_role not null,
  outlet_id uuid references public.outlets (id),
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  constraint kasir_punya_outlet check (role = 'admin' or outlet_id is not null)
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and aktif
  )
$$;

create function public.my_outlet_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select outlet_id from public.profiles where id = auth.uid() and aktif
$$;

-- Profil dibuat otomatis dari metadata saat akun Auth dibuat (oleh script atau Edge Function admin).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, nama_tampilan, role, outlet_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    coalesce(new.raw_user_meta_data ->> 'nama_tampilan', new.raw_user_meta_data ->> 'username'),
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    (select o.id from public.outlets o where o.kode = new.raw_user_meta_data ->> 'outlet_kode')
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.outlets enable row level security;
alter table public.profiles enable row level security;

create policy outlets_baca on public.outlets
  for select to authenticated using (true);

create policy outlets_admin_tulis on public.outlets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy profiles_baca on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

-- Tambah/hapus akun hanya lewat service role (Edge Function admin di Tahap 1).
create policy profiles_admin_ubah on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
