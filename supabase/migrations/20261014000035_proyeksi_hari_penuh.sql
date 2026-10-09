-- Tahap 7b (perbaikan review): proyeksi memakai hari yang SUDAH SELESAI (1 s.d. kemarin), karena sewa & gaji
-- di laporan_keuangan dihitung per hari penuh; membagi dengan pecahan hari membuat laba pagi hari tampak rugi besar.
-- Tanggal 1 belum ada hari selesai → proyeksi kosong (angka hari ini tetap ditampilkan).
create or replace function public.proyeksi_bulan(p_outlet uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hari date := (now() at time zone 'Asia/Jakarta')::date;
  v_awal date := date_trunc('month', v_hari)::date;
  v_jumlah_hari integer := extract(day from (v_awal + interval '1 month - 1 day'))::integer;
  v_lalu_awal date := (v_awal - interval '1 month')::date;
  v_selesai integer := extract(day from v_hari)::integer - 1;
  v_ini jsonb;
  v_dasar jsonb;
  v_lalu jsonb;
begin
  perform public._wajib_admin_dasbor();
  v_ini := public.laporan_keuangan(p_outlet, v_awal, v_hari);
  v_lalu := public.laporan_keuangan(p_outlet, v_lalu_awal, v_awal - 1);
  if v_selesai > 0 then
    v_dasar := public.laporan_keuangan(p_outlet, v_awal, v_hari - 1);
  end if;
  return jsonb_build_object(
    'bulan', v_awal, 'hari_berjalan', v_selesai + 1, 'hari_selesai', v_selesai, 'hari_sebulan', v_jumlah_hari,
    'omzet', v_ini -> 'omzet', 'laba', v_ini -> 'laba',
    'proyeksi_omzet', case when v_selesai > 0 then round((v_dasar ->> 'omzet')::numeric / v_selesai * v_jumlah_hari) end,
    'proyeksi_laba', case when v_selesai > 0 then round((v_dasar ->> 'laba')::numeric / v_selesai * v_jumlah_hari) end,
    'bulan_lalu_omzet', v_lalu -> 'omzet', 'bulan_lalu_laba', v_lalu -> 'laba');
end
$$;
