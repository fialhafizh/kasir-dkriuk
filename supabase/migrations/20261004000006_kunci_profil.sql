-- Profil (peran, outlet, aktif, username) hanya diubah lewat Edge Function admin-akun (service role),
-- supaya username di Auth & profil tetap sama dan admin terakhir tidak bisa mengunci dirinya.
-- Semua hak (termasuk TRUNCATE yang tidak dibatasi RLS) dicabut; pengguna login hanya boleh membaca (dibatasi RLS).
drop policy if exists profiles_admin_ubah on public.profiles;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
