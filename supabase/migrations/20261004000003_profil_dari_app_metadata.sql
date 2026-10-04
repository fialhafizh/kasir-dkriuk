-- Supabase Auth (admin createUser) menyimpan user dulu dengan app_metadata bawaan,
-- lalu mengisi app_metadata dari admin lewat UPDATE terpisah dalam transaksi yang sama.
-- Karena itu profil dibuat begitu app_metadata berisi peran, baik saat INSERT maupun UPDATE.
-- User tanpa peran di app_metadata tidak mendapat profil (dan tidak punya akses apa pun).
-- Data salah (mis. kode outlet tak dikenal untuk kasir) membuat transaksi gagal sehingga akun ikut batal.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_app_meta_data ->> 'role' is null then
    return new;
  end if;

  insert into public.profiles (id, username, nama_tampilan, role, outlet_id)
  values (
    new.id,
    new.raw_app_meta_data ->> 'username',
    coalesce(new.raw_app_meta_data ->> 'nama_tampilan', new.raw_app_meta_data ->> 'username'),
    (new.raw_app_meta_data ->> 'role')::public.user_role,
    (select o.id from public.outlets o where o.kode = new.raw_app_meta_data ->> 'outlet_kode')
  )
  -- Profil yang sudah ada dikelola lewat tabel profiles, bukan lewat app_metadata.
  on conflict (id) do nothing;
  return new;
end
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.handle_new_user();
