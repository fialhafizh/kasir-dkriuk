-- Data master: bahan baku, satuan beli (isi pack), menu, harga jual per outlet, resep, harga beli per outlet.

create type public.mode_stok as enum ('otomatis', 'catat', 'analisis');
create type public.kategori_menu as enum ('ayam', 'kulit', 'nasi', 'box', 'pelengkap');
create type public.varian_ayam as enum ('ori', 'hot');

create table public.bahan (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique check (kode ~ '^[a-z0-9_]{2,40}$'),
  nama text not null check (length(trim(nama)) > 0),
  satuan text not null check (satuan in ('potong', 'porsi', 'pcs', 'lembar', 'sachet', 'kg', 'liter')),
  mode public.mode_stok not null default 'otomatis',
  urutan int not null default 0,
  aktif boolean not null default true
);

create table public.satuan_beli (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique check (kode ~ '^[a-z0-9_]{2,40}$'),
  nama text not null check (length(trim(nama)) > 0),
  -- ambang stok menipis dalam jumlah satuan beli (mis. 10 pack); null = tidak dipantau
  ambang numeric(10, 2) check (ambang is null or ambang >= 0),
  -- false: harga berubah-ubah, diisi setiap barang masuk (harga di tabel harga_beli hanya acuan)
  harga_tetap boolean not null default true,
  urutan int not null default 0,
  aktif boolean not null default true
);

create table public.satuan_beli_isi (
  satuan_beli_id uuid not null references public.satuan_beli (id) on delete cascade,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty numeric(12, 4) not null check (qty > 0),
  primary key (satuan_beli_id, bahan_id)
);

create table public.menu (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique check (kode ~ '^[a-z0-9_]{2,40}$'),
  nama text not null check (length(trim(nama)) > 0),
  kategori public.kategori_menu not null,
  varian public.varian_ayam,
  urutan int not null default 0,
  aktif boolean not null default true,
  constraint ayam_punya_varian check ((kategori = 'ayam') = (varian is not null))
);

create table public.harga_jual (
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  menu_id uuid not null references public.menu (id) on delete cascade,
  harga integer not null check (harga >= 0 and harga <= 10000000),
  primary key (outlet_id, menu_id)
);

create table public.resep (
  menu_id uuid not null references public.menu (id) on delete cascade,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty numeric(12, 4) not null check (qty > 0),
  primary key (menu_id, bahan_id)
);

create table public.harga_beli (
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  satuan_beli_id uuid not null references public.satuan_beli (id) on delete cascade,
  harga integer not null check (harga >= 0 and harga <= 100000000),
  diubah_at timestamptz not null default now(),
  primary key (outlet_id, satuan_beli_id)
);

-- RLS: admin menulis semua tabel master; pembacaan diatur per tabel di bawah.
do $$
declare t text;
begin
  foreach t in array array['bahan', 'satuan_beli', 'satuan_beli_isi', 'menu', 'harga_jual', 'resep', 'harga_beli'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_admin_tambah', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_admin_ubah', t);
    -- Menu, bahan, dan satuan beli tidak pernah dihapus (cukup dinonaktifkan) supaya riwayat transaksi/stok aman.
    if t not in ('bahan', 'menu', 'satuan_beli') then
      execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t || '_admin_hapus', t);
    end if;
  end loop;
end
$$;

-- Hak eksplisit: project Supabase baru tidak selalu memberi hak otomatis ke tabel baru. RLS tetap yang membatasi.
grant select, insert, update, delete on public.bahan, public.satuan_beli, public.satuan_beli_isi, public.menu,
  public.harga_jual, public.resep, public.harga_beli to authenticated;
revoke all on public.bahan, public.satuan_beli, public.satuan_beli_isi, public.menu,
  public.harga_jual, public.resep, public.harga_beli from anon;

-- Dibaca semua pengguna login (layar kasir butuh menu, resep, bahan untuk stok).
create policy bahan_baca on public.bahan for select to authenticated using (true);
create policy satuan_beli_baca on public.satuan_beli for select to authenticated using (true);
create policy satuan_beli_isi_baca on public.satuan_beli_isi for select to authenticated using (true);
create policy menu_baca on public.menu for select to authenticated using (true);
create policy resep_baca on public.resep for select to authenticated using (true);
-- Kasir hanya harga outletnya; admin semua.
create policy harga_jual_baca on public.harga_jual for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
-- Harga beli hanya admin.
create policy harga_beli_baca on public.harga_beli for select to authenticated using ((select public.is_admin()));

-- Ganti seluruh isi satu resep / satu satuan beli dalam satu transaksi.
-- security invoker: RLS & hak pemanggil tetap berlaku; pengecekan admin eksplisit memberi pesan jelas.
create function public.simpan_resep(p_menu uuid, p_isi jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh mengubah resep' using errcode = '42501';
  end if;
  if p_isi is null or jsonb_typeof(p_isi) is distinct from 'array' or jsonb_array_length(p_isi) = 0 then
    raise exception 'Resep minimal satu bahan' using errcode = '22023';
  end if;
  -- Tepung/minyak (analisis) dan plastik merah (catat) tidak boleh dipotong otomatis lewat resep.
  if exists (
    select 1 from jsonb_array_elements(p_isi) as x
    join public.bahan b on b.id = (x ->> 'bahan_id')::uuid
    where b.mode <> 'otomatis' or not b.aktif
  ) then
    raise exception 'Resep hanya boleh memakai bahan aktif yang dipotong otomatis' using errcode = '22023';
  end if;
  delete from public.resep where menu_id = p_menu;
  insert into public.resep (menu_id, bahan_id, qty)
  select p_menu, (x ->> 'bahan_id')::uuid, (x ->> 'qty')::numeric
  from jsonb_array_elements(p_isi) as x;
end
$$;

create function public.simpan_isi_satuan_beli(p_satuan uuid, p_isi jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh mengubah isi satuan beli' using errcode = '42501';
  end if;
  if p_isi is null or jsonb_typeof(p_isi) is distinct from 'array' or jsonb_array_length(p_isi) = 0 then
    raise exception 'Isi satuan beli minimal satu bahan' using errcode = '22023';
  end if;
  delete from public.satuan_beli_isi where satuan_beli_id = p_satuan;
  insert into public.satuan_beli_isi (satuan_beli_id, bahan_id, qty)
  select p_satuan, (x ->> 'bahan_id')::uuid, (x ->> 'qty')::numeric
  from jsonb_array_elements(p_isi) as x;
end
$$;

revoke execute on function public.simpan_resep(uuid, jsonb) from public, anon;
revoke execute on function public.simpan_isi_satuan_beli(uuid, jsonb) from public, anon;
grant execute on function public.simpan_resep(uuid, jsonb) to authenticated;
grant execute on function public.simpan_isi_satuan_beli(uuid, jsonb) to authenticated;

-- Waktu ubah harga beli selalu diisi server, apa pun yang dikirim klien.
create function public.cap_waktu_harga_beli() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.diubah_at := now();
  return new;
end
$$;
revoke execute on function public.cap_waktu_harga_beli() from public, anon, authenticated;

create trigger harga_beli_diubah_at
  before insert or update on public.harga_beli
  for each row execute function public.cap_waktu_harga_beli();
