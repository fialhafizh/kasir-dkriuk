-- Tahap 4b: batal, transfer, opname & stok awal dari antrean offline.

alter table public.penjualan
  -- Batal yang jamnya sebelum hitungan fisik (stok awal/opname) yang disetujui tidak mengembalikan stok.
  add column void_tanpa_stok boolean not null default false,
  -- Jam batal sampai di server (void_at = jam batal di perangkat untuk kiriman offline).
  add column void_dicatat_at timestamptz;

create or replace function public._gerakan_batal_jual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.void_tanpa_stok then
    return null;
  end if;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, penjualan_id)
  select g.outlet_id, g.bahan_id, -sum(g.qty), 'jual_batal', new.void_at, new.void_oleh, new.id
  from public.gerakan_stok g
  where g.penjualan_id = new.id and g.jenis = 'jual'
  group by g.outlet_id, g.bahan_id;
  return null;
end
$$;

-- Jam server saat toko benar-benar ditutup / transaksi benar-benar dibatalkan (jam di kolom lain bisa jam perangkat).
alter table public.shift add column ditutup_dicatat_at timestamptz;
-- Shift yang sudah ditutup sebelum migrasi ini: jam server terbaik yang diketahui = jam tutupnya.
update public.shift set ditutup_dicatat_at = ditutup_at where ditutup_at is not null and not tutup_tertunda;

create function public._jam_tutup_server() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (old.ditutup_at is null and new.ditutup_at is not null) or (old.tutup_tertunda and not new.tutup_tertunda) then
    new.ditutup_dicatat_at := now();
  end if;
  return new;
end
$$;
create trigger shift_jam_tutup_server before update on public.shift
  for each row execute function public._jam_tutup_server();

create function public._jam_batal_server() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.void_at is null and new.void_at is not null then
    new.void_dicatat_at := now();
  end if;
  return new;
end
$$;
create trigger penjualan_jam_batal_server before update on public.penjualan
  for each row execute function public._jam_batal_server();

revoke execute on function public._jam_tutup_server() from public, anon, authenticated;
revoke execute on function public._jam_batal_server() from public, anon, authenticated;
