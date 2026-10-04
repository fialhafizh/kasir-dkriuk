-- Stok (Tahap 3a): buku besar gerakan stok, barang masuk, stok awal.
-- Pengguna login hanya MEMBACA; penulisan lewat trigger/fungsi security definer.

create type public.jenis_gerakan as enum ('awal', 'masuk', 'masuk_batal', 'jual', 'jual_batal');
create type public.status_stok_awal as enum ('diajukan', 'disetujui', 'ditolak');

create table public.barang_masuk (
  id uuid primary key,
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  tanggal date not null,
  waktu timestamptz not null,
  total bigint not null check (total >= 0),
  catatan text check (catatan is null or length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles (id) on delete restrict,
  dicatat_at timestamptz not null default now(),
  batal_at timestamptz,
  batal_oleh uuid references public.profiles (id) on delete restrict,
  batal_alasan text,
  constraint barang_masuk_batal_lengkap check ((batal_at is null) = (batal_alasan is null))
);
create index barang_masuk_outlet_waktu on public.barang_masuk (outlet_id, waktu desc);

create table public.barang_masuk_item (
  barang_masuk_id uuid not null references public.barang_masuk (id) on delete restrict,
  satuan_beli_id uuid not null references public.satuan_beli (id) on delete restrict,
  nama text not null,
  qty numeric(10, 3) not null check (qty > 0 and qty <= 100000),
  harga integer not null check (harga >= 0 and harga <= 100000000),
  subtotal bigint generated always as (round(qty * harga)::bigint) stored,
  primary key (barang_masuk_id, satuan_beli_id)
);

create table public.stok_awal (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  status public.status_stok_awal not null default 'diajukan',
  dihitung_at timestamptz not null default now(),
  diajukan_oleh uuid references public.profiles (id) on delete restrict,
  diputus_at timestamptz,
  diputus_oleh uuid references public.profiles (id) on delete restrict,
  catatan text check (catatan is null or length(catatan) <= 200),
  constraint stok_awal_diputus check ((status = 'diajukan') = (diputus_at is null))
);
-- Satu ajuan menunggu dan satu yang disetujui per outlet.
create unique index stok_awal_satu_diajukan on public.stok_awal (outlet_id) where status = 'diajukan';
create unique index stok_awal_satu_disetujui on public.stok_awal (outlet_id) where status = 'disetujui';

create table public.stok_awal_item (
  stok_awal_id uuid not null references public.stok_awal (id) on delete restrict,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty_hitung numeric(14, 4) not null check (qty_hitung >= 0 and qty_hitung <= 1000000),
  primary key (stok_awal_id, bahan_id)
);

create table public.gerakan_stok (
  id bigint generated always as identity primary key,
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  bahan_id uuid not null references public.bahan (id) on delete restrict,
  qty numeric(14, 4) not null check (qty <> 0),
  jenis public.jenis_gerakan not null,
  waktu timestamptz not null,
  dicatat_at timestamptz not null default now(),
  oleh uuid references public.profiles (id) on delete restrict,
  penjualan_id uuid references public.penjualan (id) on delete restrict,
  barang_masuk_id uuid references public.barang_masuk (id) on delete restrict,
  stok_awal_id uuid references public.stok_awal (id) on delete restrict,
  -- Setiap baris dapat ditelusuri ke sumbernya (3b menambah jenis & sumber baru).
  constraint gerakan_sumber_jual check ((jenis in ('jual', 'jual_batal')) = (penjualan_id is not null)),
  constraint gerakan_sumber_masuk check ((jenis in ('masuk', 'masuk_batal')) = (barang_masuk_id is not null)),
  constraint gerakan_sumber_awal check ((jenis = 'awal') = (stok_awal_id is not null))
);
create index gerakan_outlet_bahan_waktu on public.gerakan_stok (outlet_id, bahan_id, waktu);
create index gerakan_penjualan on public.gerakan_stok (penjualan_id) where penjualan_id is not null;
create index gerakan_barang_masuk on public.gerakan_stok (barang_masuk_id) where barang_masuk_id is not null;

-- Stok saat ini per outlet × bahan aktif (0 bila belum ada gerakan). security_invoker: RLS pemanggil berlaku.
create view public.stok_outlet with (security_invoker = true) as
select o.id as outlet_id, b.id as bahan_id, coalesce(sum(g.qty), 0)::numeric(14, 4) as qty
from public.outlets o
cross join public.bahan b
left join public.gerakan_stok g on g.outlet_id = o.id and g.bahan_id = b.id
where b.aktif and ((select public.is_admin()) or o.id = (select public.my_outlet_id()))
group by o.id, b.id;

-- Potong stok: satu baris per bahan per transaksi, dari resep saat itu (snapshot di buku besar).
create function public._gerakan_jual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, penjualan_id)
  select p.outlet_id, r.bahan_id, -sum(n.qty * r.qty), 'jual', p.waktu, p.kasir_id, p.id
  from baru n
  join public.penjualan p on p.id = n.penjualan_id
  join public.resep r on r.menu_id = n.menu_id
  join public.bahan b on b.id = r.bahan_id and b.mode = 'otomatis'
  group by p.outlet_id, r.bahan_id, p.waktu, p.kasir_id, p.id;
  return null;
end
$$;
create trigger penjualan_item_potong_stok after insert on public.penjualan_item
  referencing new table as baru for each statement execute function public._gerakan_jual();

-- Void: kembalikan PERSIS baris jual transaksi itu (bukan resep terkini).
create function public._gerakan_batal_jual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, penjualan_id)
  select g.outlet_id, g.bahan_id, -sum(g.qty), 'jual_batal', new.void_at, new.void_oleh, new.id
  from public.gerakan_stok g
  where g.penjualan_id = new.id and g.jenis = 'jual'
  group by g.outlet_id, g.bahan_id;
  return null;
end
$$;
create trigger penjualan_void_kembalikan_stok after update of void_at on public.penjualan
  for each row when (old.void_at is null and new.void_at is not null)
  execute function public._gerakan_batal_jual();

revoke execute on function public._gerakan_jual() from public, anon, authenticated;
revoke execute on function public._gerakan_batal_jual() from public, anon, authenticated;

alter table public.gerakan_stok enable row level security;
alter table public.barang_masuk enable row level security;
alter table public.barang_masuk_item enable row level security;
alter table public.stok_awal enable row level security;
alter table public.stok_awal_item enable row level security;

revoke all on public.gerakan_stok, public.barang_masuk, public.barang_masuk_item, public.stok_awal, public.stok_awal_item, public.stok_outlet
  from anon, authenticated;
revoke all on sequence public.gerakan_stok_id_seq from anon, authenticated;
grant select on public.gerakan_stok, public.barang_masuk, public.barang_masuk_item, public.stok_awal, public.stok_awal_item, public.stok_outlet
  to authenticated;
grant all on public.gerakan_stok, public.barang_masuk, public.barang_masuk_item, public.stok_awal, public.stok_awal_item to service_role;
grant select on public.stok_outlet to service_role;
grant usage, select on sequence public.gerakan_stok_id_seq to service_role;

create policy gerakan_stok_baca on public.gerakan_stok for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy stok_awal_baca on public.stok_awal for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy stok_awal_item_baca on public.stok_awal_item for select to authenticated
  using (exists (select 1 from public.stok_awal s where s.id = stok_awal_id));
-- Barang masuk berisi harga beli: hanya admin.
create policy barang_masuk_baca on public.barang_masuk for select to authenticated using ((select public.is_admin()));
create policy barang_masuk_item_baca on public.barang_masuk_item for select to authenticated using ((select public.is_admin()));
