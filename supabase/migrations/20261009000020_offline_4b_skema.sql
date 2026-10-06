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
