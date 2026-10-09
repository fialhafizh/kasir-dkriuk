-- Tahap 7a: dasbor yang bisa dirakit admin (seperti Kibana). Spek panel divalidasi terhadap katalog (migrasi 0030).

create table public.dasbor (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (length(trim(nama)) between 1 and 40),
  urutan integer not null default 0,
  utama boolean not null default false,
  -- dasbor "Ringkasan" bawaan (bisa dikembalikan ke isi awal)
  bawaan boolean not null default false,
  -- saringan atas bawaan: {"outlet_id": uuid|null, "periode": "bulan_ini", "dari": "...", "sampai": "..."}
  saringan jsonb not null default '{"outlet_id": null, "periode": "hari_ini"}'::jsonb,
  diubah_at timestamptz not null default now(),
  diubah_oleh uuid references public.profiles (id) on delete set null
);
create unique index dasbor_satu_utama on public.dasbor (utama) where utama;
create unique index dasbor_satu_bawaan on public.dasbor (bawaan) where bawaan;

create table public.dasbor_panel (
  id uuid primary key default gen_random_uuid(),
  dasbor_id uuid not null references public.dasbor (id) on delete cascade,
  judul text not null check (length(trim(judul)) between 1 and 60),
  jenis text not null check (jenis in ('angka', 'batang', 'garis', 'lingkaran', 'tabel', 'peta_panas',
                                       'status_stok', 'siklus_stok', 'riwayat', 'uang_laci')),
  spek jsonb not null default '{}'::jsonb,
  -- letak di kisi 12 kolom
  x integer not null check (x between 0 and 11),
  y integer not null check (y between 0 and 1000),
  w integer not null check (w between 1 and 12 and x + w <= 12),
  h integer not null check (h between 1 and 20)
);
create index dasbor_panel_dasbor on public.dasbor_panel (dasbor_id, y, x);

-- Indeks untuk agregasi "semua outlet" menurut jam (indeks lama diawali outlet_id).
create index penjualan_waktu on public.penjualan (waktu);
create index penjualan_void_at on public.penjualan (void_at) where void_at is not null;
create index gerakan_jual_waktu on public.gerakan_stok (waktu) where jenis in ('jual', 'jual_batal');
create index shift_ditutup_at on public.shift (ditutup_at) where ditutup_at is not null;
create index rusak_waktu on public.rusak (waktu);
create index pengeluaran_waktu on public.pengeluaran (waktu);
create index setoran_waktu on public.setoran (waktu);
create index barang_masuk_waktu on public.barang_masuk (waktu);
create index kejadian_diabaikan_dibuat on public.kejadian_diabaikan (dibuat_at);

alter table public.dasbor enable row level security;
alter table public.dasbor_panel enable row level security;
revoke all on public.dasbor, public.dasbor_panel from anon, authenticated;
grant select on public.dasbor, public.dasbor_panel to authenticated;
grant all on public.dasbor, public.dasbor_panel to service_role;
create policy dasbor_baca on public.dasbor for select to authenticated using ((select public.is_admin()));
create policy dasbor_panel_baca on public.dasbor_panel for select to authenticated using ((select public.is_admin()));

create function public._wajib_admin_dasbor() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh membuka dasbor' using errcode = '42501';
  end if;
end
$$;

-- Simpan satu dasbor beserta seluruh panelnya (utuh atau tidak sama sekali). Panel yang tidak dikirim dihapus.
create function public.simpan_dasbor(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_nama text := trim(coalesce(p ->> 'nama', ''));
  v_panel jsonb := coalesce(p -> 'panel', '[]'::jsonb);
  x jsonb;
  v_ids uuid[] := '{}';
  v_pid uuid;
begin
  perform public._wajib_admin_dasbor();
  if length(v_nama) not between 1 and 40 then
    raise exception 'Nama dasbor 1–40 karakter' using errcode = '22023';
  end if;
  if jsonb_typeof(v_panel) <> 'array' or jsonb_array_length(v_panel) > 40 then
    raise exception 'Panel paling banyak 40 per dasbor' using errcode = '22023';
  end if;
  if v_id is not null and not exists (select 1 from public.dasbor where id = v_id) then
    raise exception 'Dasbor tidak ditemukan' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(v_panel) e where e ? 'id')
     <> (select count(distinct e ->> 'id') from jsonb_array_elements(v_panel) e where e ? 'id') then
    raise exception 'Panel ganda' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.dasbor (nama, urutan, utama, saringan, diubah_oleh)
    values (v_nama, coalesce((select max(urutan) + 1 from public.dasbor), 0),
            not exists (select 1 from public.dasbor), public._dasbor_cek_saringan(p -> 'saringan'), auth.uid())
    returning id into v_id;
  else
    -- Saringan tidak dikirim = tetap seperti sebelumnya.
    update public.dasbor
    set nama = v_nama, saringan = case when p ? 'saringan' then public._dasbor_cek_saringan(p -> 'saringan') else saringan end,
        diubah_at = now(), diubah_oleh = auth.uid()
    where id = v_id;
  end if;
  for x in select * from jsonb_array_elements(v_panel) loop
    if length(trim(coalesce(x ->> 'judul', ''))) not between 1 and 60 then
      raise exception 'Judul panel 1–60 karakter' using errcode = '22023';
    end if;
    perform public._dasbor_cek_spek(x ->> 'jenis', coalesce(x -> 'spek', '{}'::jsonb));
    begin
      v_pid := coalesce((x ->> 'id')::uuid, gen_random_uuid());
    exception when invalid_text_representation then
      raise exception 'Panel tidak dikenal' using errcode = '22023';
    end;
    begin
      insert into public.dasbor_panel (id, dasbor_id, judul, jenis, spek, x, y, w, h)
      values (v_pid, v_id, trim(x ->> 'judul'), x ->> 'jenis', coalesce(x -> 'spek', '{}'::jsonb),
              (x ->> 'x')::integer, (x ->> 'y')::integer, (x ->> 'w')::integer, (x ->> 'h')::integer)
      on conflict (id) do update
      set judul = excluded.judul, jenis = excluded.jenis, spek = excluded.spek, x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h
      where public.dasbor_panel.dasbor_id = v_id;
    exception when check_violation or not_null_violation or invalid_text_representation then
      raise exception 'Letak panel tidak sah' using errcode = '22023';
    end;
    if not found then
      raise exception 'Panel milik dasbor lain' using errcode = '22023';
    end if;
    v_ids := v_ids || v_pid;
  end loop;
  delete from public.dasbor_panel where dasbor_id = v_id and not (id = any (v_ids));
  return v_id;
end
$$;

create function public.hapus_dasbor(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.dasbor;
begin
  perform public._wajib_admin_dasbor();
  -- Dua penghapusan bersamaan tidak boleh menyisakan nol dasbor.
  lock table public.dasbor in share row exclusive mode;
  select * into v from public.dasbor where id = p_id for update;
  if not found then
    raise exception 'Dasbor tidak ditemukan' using errcode = '22023';
  end if;
  if (select count(*) from public.dasbor) <= 1 then
    raise exception 'Minimal harus ada satu dasbor' using errcode = '22023';
  end if;
  delete from public.dasbor where id = p_id;
  if v.utama then
    update public.dasbor set utama = true where id = (select id from public.dasbor order by urutan, nama limit 1);
  end if;
end
$$;

create function public.jadikan_utama_dasbor(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._wajib_admin_dasbor();
  lock table public.dasbor in share row exclusive mode;
  if not exists (select 1 from public.dasbor where id = p_id) then
    raise exception 'Dasbor tidak ditemukan' using errcode = '22023';
  end if;
  update public.dasbor set utama = false where utama and id <> p_id;
  update public.dasbor set utama = true where id = p_id;
end
$$;

revoke execute on function public._wajib_admin_dasbor() from public, anon, authenticated;
revoke execute on function public.simpan_dasbor(jsonb), public.hapus_dasbor(uuid), public.jadikan_utama_dasbor(uuid) from public, anon;
grant execute on function public.simpan_dasbor(jsonb), public.hapus_dasbor(uuid), public.jadikan_utama_dasbor(uuid) to authenticated;
