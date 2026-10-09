-- Tahap 5a: buku kas laci (uang laci menumpuk lintas hari), pengeluaran, setoran.
-- Saldo laci TIDAK disimpan: dihitung dari jangkar (uang laci awal / hitungan tutup toko) + gerakan sesudahnya.

-- Uang laci awal per outlet (sekali; jangkar pertama).
create table public.laci_awal (
  outlet_id uuid primary key references public.outlets (id) on delete restrict,
  jumlah integer not null check (jumlah between 0 and 100000000),
  waktu timestamptz not null,
  oleh uuid references public.profiles (id) on delete restrict,
  dicatat_at timestamptz not null default now()
);

-- Tidak ada pengisian otomatis dari shift lama: modal lama diketik kasir setelah uang diambil owner (tanpa catatan
-- setoran), jadi hitungan tutup sebelum 5a bukan jangkar. Uang laci awal diisi kasir saat buka toko pertama di 5a.

create table public.kategori_pengeluaran (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique check (length(trim(nama)) between 2 and 40),
  untuk_kasir boolean not null default false,
  wajib_keterangan boolean not null default false,
  aktif boolean not null default true,
  urutan integer not null default 100
);
insert into public.kategori_pengeluaran (nama, untuk_kasir, wajib_keterangan, urutan) values
  ('Gas', true, false, 10),
  ('Token listrik', true, false, 20),
  ('Air', true, false, 30),
  ('Lain-lain', true, true, 40),
  ('Belanja bahan di luar Barang masuk', false, true, 50),
  ('Perbaikan & peralatan', false, false, 60),
  ('Lain-lain admin', false, true, 70);

create table public.pengeluaran (
  id uuid primary key,
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  -- laci: dibayar dari uang laci (mengurangi saldo laci); luar: dibayar di luar laci (mis. rekening owner).
  sumber text not null check (sumber in ('laci', 'luar')),
  kategori_id uuid not null references public.kategori_pengeluaran (id) on delete restrict,
  jumlah integer not null check (jumlah between 1 and 100000000),
  waktu timestamptz not null,
  keterangan text check (keterangan is null or length(keterangan) <= 200),
  dicatat_oleh uuid references public.profiles (id) on delete restrict,
  perangkat_id uuid references public.perangkat (id) on delete restrict,
  dicatat_at timestamptz not null default now(),
  batal_at timestamptz,
  batal_oleh uuid references public.profiles (id) on delete restrict,
  batal_alasan text,
  constraint pengeluaran_batal_lengkap check ((batal_at is null) = (batal_alasan is null))
);
create index pengeluaran_outlet_waktu on public.pengeluaran (outlet_id, waktu desc);

create table public.setoran (
  id uuid primary key,
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  jumlah integer not null check (jumlah between 1 and 100000000),
  waktu timestamptz not null,
  catatan text check (catatan is null or length(catatan) <= 200),
  dicatat_oleh uuid references public.profiles (id) on delete restrict,
  perangkat_id uuid references public.perangkat (id) on delete restrict,
  dicatat_at timestamptz not null default now(),
  diterima_at timestamptz,
  diterima_oleh uuid references public.profiles (id) on delete restrict,
  jumlah_diterima integer check (jumlah_diterima is null or jumlah_diterima between 0 and 100000000),
  catatan_terima text check (catatan_terima is null or length(catatan_terima) <= 200),
  batal_at timestamptz,
  batal_oleh uuid references public.profiles (id) on delete restrict,
  batal_alasan text,
  constraint setoran_terima_lengkap check ((diterima_at is null) = (jumlah_diterima is null)),
  constraint setoran_batal_lengkap check ((batal_at is null) = (batal_alasan is null)),
  constraint setoran_batal_atau_terima check (batal_at is null or diterima_at is null)
);
create index setoran_outlet_waktu on public.setoran (outlet_id, waktu desc);

-- Batal oleh admin untuk shift yang sudah ditutup = koreksi catatan: transaksi dianggap tidak pernah ada di laci.
alter table public.penjualan add column void_koreksi boolean not null default false;

-- Gerakan batal cash dibaca per outlet & jam batal (saldo laci).
create index penjualan_void_cash on public.penjualan (outlet_id, void_at) where void_at is not null and metode = 'cash';
create unique index kategori_pengeluaran_nama_kecil on public.kategori_pengeluaran (lower(nama));

alter table public.laci_awal enable row level security;
alter table public.kategori_pengeluaran enable row level security;
alter table public.pengeluaran enable row level security;
alter table public.setoran enable row level security;
revoke all on public.laci_awal, public.kategori_pengeluaran, public.pengeluaran, public.setoran from anon, authenticated;
grant select on public.laci_awal, public.kategori_pengeluaran, public.pengeluaran, public.setoran to authenticated;
grant all on public.laci_awal, public.kategori_pengeluaran, public.pengeluaran, public.setoran to service_role;
create policy laci_awal_baca on public.laci_awal for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
create policy kategori_pengeluaran_baca on public.kategori_pengeluaran for select to authenticated using (true);
create policy pengeluaran_baca on public.pengeluaran for select to authenticated
  using ((select public.is_admin()) or (sumber = 'laci' and outlet_id = (select public.my_outlet_id())));
create policy setoran_baca on public.setoran for select to authenticated
  using ((select public.is_admin()) or outlet_id = (select public.my_outlet_id()));
