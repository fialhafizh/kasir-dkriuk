-- Aturan resep berlaku selamanya (bukan hanya saat simpan_resep), karena pemotongan stok bergantung padanya:
-- 1) baris resep apa pun hanya boleh memakai bahan aktif yang dipotong otomatis;
-- 2) bahan yang masih dipakai resep tidak boleh dinonaktifkan atau diubah dari 'otomatis'.
-- Outlet juga tidak boleh dihapus (harga & riwayat ikut terhapus); cukup dinonaktifkan.

create function public.cek_baris_resep() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.bahan b where b.id = new.bahan_id and b.aktif and b.mode = 'otomatis') then
    raise exception 'Resep hanya boleh memakai bahan aktif yang dipotong otomatis' using errcode = '22023';
  end if;
  return new;
end
$$;

create trigger resep_bahan_sah
  before insert or update on public.resep
  for each row execute function public.cek_baris_resep();

create function public.cek_bahan_dipakai_resep() returns trigger
language plpgsql set search_path = '' as $$
declare
  menu_pemakai text;
begin
  if (old.aktif and not new.aktif) or (old.mode = 'otomatis' and new.mode <> 'otomatis') then
    select string_agg(m.nama, ', ' order by m.urutan) into menu_pemakai
    from public.resep r join public.menu m on m.id = r.menu_id
    where r.bahan_id = new.id;
    if menu_pemakai is not null then
      raise exception 'Bahan masih dipakai di resep: %', menu_pemakai using errcode = '22023';
    end if;
  end if;
  return new;
end
$$;

create trigger bahan_jaga_resep
  before update of aktif, mode on public.bahan
  for each row execute function public.cek_bahan_dipakai_resep();

revoke execute on function public.cek_baris_resep() from public, anon, authenticated;
revoke execute on function public.cek_bahan_dipakai_resep() from public, anon, authenticated;

drop policy if exists outlets_admin_hapus on public.outlets;

-- Hak eksplisit untuk service_role (script lokal & Edge Function) agar project baru pun berfungsi.
grant all on public.bahan, public.satuan_beli, public.satuan_beli_isi, public.menu,
  public.harga_jual, public.resep, public.harga_beli to service_role;
