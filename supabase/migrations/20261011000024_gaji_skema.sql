-- Tahap 5b: karyawan, kehadiran, kasbon & gaji, biaya tetap (sewa).

-- Kategori sistem dikenali dari kode (nama boleh diubah admin).
alter table public.kategori_pengeluaran add column kode text unique check (kode is null or kode in ('kasbon', 'gaji', 'sewa', 'belanja_bahan'));
-- Kategori "Belanja bahan di luar Barang masuk" dari 5a (urutan 50; nama bisa sudah diubah admin).
do $$
begin
  update public.kategori_pengeluaran set kode = 'belanja_bahan'
  where id = (select id from public.kategori_pengeluaran
              where nama = 'Belanja bahan di luar Barang masuk' or (urutan = 50 and not untuk_kasir)
              order by (nama = 'Belanja bahan di luar Barang masuk') desc limit 1);
  if not found then
    raise exception 'Kategori belanja bahan dari Tahap 5a tidak ditemukan';
  end if;
end
$$;
-- Kategori sistem baru; bila admin sudah membuat kategori bernama sama, kategori itu yang dipakai.
-- Kasbon bukan untuk formulir pengeluaran biasa: dicatat lewat menu Kasbon (wajib memilih karyawan).
insert into public.kategori_pengeluaran (nama, untuk_kasir, wajib_keterangan, urutan, kode) values
  ('Kasbon karyawan', false, false, 45, 'kasbon'),
  ('Gaji', false, false, 80, 'gaji'),
  ('Sewa', false, false, 90, 'sewa')
on conflict (nama) do update set kode = excluded.kode, untuk_kasir = false;

-- Karyawan terpisah dari akun aplikasi.
create table public.karyawan (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  nama text not null check (length(trim(nama)) between 2 and 60),
  upah_harian integer not null check (upah_harian between 0 and 10000000),
  aktif boolean not null default true,
  dibuat_at timestamptz not null default now()
);
create index karyawan_outlet on public.karyawan (outlet_id);

-- Ada baris = masuk kerja hari itu.
create table public.kehadiran (
  karyawan_id uuid not null references public.karyawan (id) on delete restrict,
  tanggal date not null,
  dicatat_oleh uuid references public.profiles (id) on delete restrict,
  dicatat_at timestamptz not null default now(),
  primary key (karyawan_id, tanggal)
);

-- Kasbon & pembayaran gaji adalah baris pengeluaran berkategori sistem.
alter table public.pengeluaran add column karyawan_id uuid references public.karyawan (id) on delete restrict;
create index pengeluaran_karyawan on public.pengeluaran (karyawan_id) where karyawan_id is not null;

-- Kasbon & gaji wajib terikat ke karyawan (formulir pengeluaran biasa tidak bisa membuatnya).
create function public._jaga_pengeluaran_karyawan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.karyawan_id is null and exists (select 1 from public.kategori_pengeluaran where id = new.kategori_id and kode in ('kasbon', 'gaji')) then
    raise exception 'Kasbon dan gaji dicatat lewat menu Kasbon/Gaji' using errcode = '22023';
  end if;
  return new;
end
$$;
create trigger pengeluaran_jaga_karyawan before insert on public.pengeluaran for each row execute function public._jaga_pengeluaran_karyawan();
revoke execute on function public._jaga_pengeluaran_karyawan() from public, anon, authenticated;

create table public.gaji (
  id uuid primary key,
  karyawan_id uuid not null references public.karyawan (id) on delete restrict,
  bulan date not null check (extract(day from bulan) = 1),
  hari_masuk integer not null check (hari_masuk between 0 and 31),
  upah_harian integer not null check (upah_harian between 0 and 10000000),
  penyesuaian integer not null default 0 check (penyesuaian between -100000000 and 100000000),
  keterangan text check (keterangan is null or length(keterangan) <= 200),
  potongan_kasbon integer not null default 0 check (potongan_kasbon >= 0),
  dibayar integer not null check (dibayar >= 0),
  pengeluaran_id uuid unique references public.pengeluaran (id) on delete restrict,
  dibayar_at timestamptz not null default now(),
  dibayar_oleh uuid references public.profiles (id) on delete restrict,
  batal_at timestamptz,
  batal_oleh uuid references public.profiles (id) on delete restrict,
  batal_alasan text,
  constraint gaji_batal_lengkap check ((batal_at is null) = (batal_alasan is null))
);
create unique index gaji_satu_per_bulan on public.gaji (karyawan_id, bulan) where batal_at is null;

-- Biaya tetap (sewa): berlaku sejak `mulai` sampai ada baris lebih baru dengan nama yang sama.
create table public.biaya_tetap (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete restrict,
  nama text not null default 'Sewa' check (length(trim(nama)) between 2 and 40),
  per_tahun integer not null check (per_tahun between 0 and 2000000000),
  mulai date not null,
  aktif boolean not null default true,
  dicatat_oleh uuid references public.profiles (id) on delete restrict,
  dicatat_at timestamptz not null default now()
);
create index biaya_tetap_outlet on public.biaya_tetap (outlet_id, nama, mulai desc);

alter table public.karyawan enable row level security;
alter table public.kehadiran enable row level security;
alter table public.gaji enable row level security;
alter table public.biaya_tetap enable row level security;
revoke all on public.karyawan, public.kehadiran, public.gaji, public.biaya_tetap from anon, authenticated;
-- Hanya admin yang membaca (kasir memakai karyawan_outlet() yang tidak menampilkan upah).
grant select on public.karyawan, public.kehadiran, public.gaji, public.biaya_tetap to authenticated;
grant all on public.karyawan, public.kehadiran, public.gaji, public.biaya_tetap to service_role;
create policy karyawan_baca on public.karyawan for select to authenticated using ((select public.is_admin()));
create policy kehadiran_baca on public.kehadiran for select to authenticated using ((select public.is_admin()));
create policy gaji_baca on public.gaji for select to authenticated using ((select public.is_admin()));
create policy biaya_tetap_baca on public.biaya_tetap for select to authenticated using ((select public.is_admin()));

-- Kasir tidak melihat pembayaran gaji (nominal gaji rekan kerja), walau dibayar dari laci.
drop policy pengeluaran_baca on public.pengeluaran;
create policy pengeluaran_baca on public.pengeluaran for select to authenticated
  using ((select public.is_admin())
         or (sumber = 'laci' and outlet_id = (select public.my_outlet_id())
             and kategori_id is distinct from (select k.id from public.kategori_pengeluaran k where k.kode = 'gaji')));
