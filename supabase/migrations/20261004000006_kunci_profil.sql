-- Profil (peran, outlet, aktif, username) hanya diubah lewat Edge Function admin-akun (service role),
-- supaya username di Auth & profil tetap sama dan admin terakhir tidak bisa mengunci dirinya.
drop policy if exists profiles_admin_ubah on public.profiles;
revoke insert, update, delete on public.profiles from anon, authenticated;
