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

-- Profil dibuat otomatis saat akun Auth dibuat oleh admin (service role).
-- Data diambil dari app_metadata: hanya service role yang bisa mengisinya,
-- sedangkan user_metadata bisa diubah pengguna sendiri dan tidak boleh dipercaya.
-- Kode outlet tak dikenal untuk kasir membuat insert gagal (constraint), sehingga akun Auth ikut batal.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, nama_tampilan, role, outlet_id)
  values (
    new.id,
    new.raw_app_meta_data ->> 'username',
    coalesce(new.raw_app_meta_data ->> 'nama_tampilan', new.raw_app_meta_data ->> 'username'),
    (new.raw_app_meta_data ->> 'role')::public.user_role,
    (select o.id from public.outlets o where o.kode = new.raw_app_meta_data ->> 'outlet_kode')
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fungsi hanya untuk pengguna login; fungsi trigger tidak boleh dipanggil lewat API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.my_outlet_id() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_outlet_id() to authenticated;

alter table public.outlets enable row level security;
alter table public.profiles enable row level security;

-- (select ...) membuat fungsi dievaluasi sekali per query, bukan per baris.
create policy outlets_baca on public.outlets
  for select to authenticated using (true);

create policy outlets_admin_tambah on public.outlets
  for insert to authenticated with check ((select public.is_admin()));

create policy outlets_admin_ubah on public.outlets
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy outlets_admin_hapus on public.outlets
  for delete to authenticated using ((select public.is_admin()));

create policy profiles_baca on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));

-- Tambah/hapus akun hanya lewat service role (Edge Function admin di Tahap 1).
create policy profiles_admin_ubah on public.profiles
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
