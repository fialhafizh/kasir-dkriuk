-- Tahap 3b: kunci bersama per outlet, penjaga "sebelum dihitung" (stok awal ATAU opname), rusak/terbuang.

-- Semua penulis yang memengaruhi hitungan stok satu outlet antre di kunci ini.
create function public._kunci_stok(p_outlet uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('stok:' || p_outlet::text, 0));
end
$$;

-- Waktu hitungan fisik terakhir yang disetujui (stok awal atau opname); null bila belum ada.
create function public._dihitung_terakhir(p_outlet uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(t) from (
    select dihitung_at as t from public.stok_awal where outlet_id = p_outlet and status = 'disetujui'
    union all
    select dihitung_at from public.opname where outlet_id = p_outlet and status = 'disetujui'
  ) x
$$;

-- Barang masuk (fungsi 0011 tidak diubah): kunci outlet & tolak bila sebelum hitungan terakhir.
create function public._jaga_barang_masuk() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._kunci_stok(new.outlet_id);
  if tg_op = 'INSERT' then
    if public._dihitung_terakhir(new.outlet_id) >= new.waktu then
      raise exception 'Barang masuk sebelum stok dihitung (stok awal/opname) sudah termasuk hitungan; koreksi lewat opname' using errcode = '22023';
    end if;
  elsif old.batal_at is null and new.batal_at is not null then
    if public._dihitung_terakhir(new.outlet_id) >= old.waktu then
      raise exception 'Barang masuk sebelum stok dihitung (stok awal/opname) tidak bisa dibatalkan; koreksi lewat opname' using errcode = '22023';
    end if;
  end if;
  return new;
end
$$;
create trigger barang_masuk_jaga before insert or update on public.barang_masuk
  for each row execute function public._jaga_barang_masuk();

-- Isian bahan dengan jumlah > 0 (rusak, transfer).
create function public._cek_isian_positif(p_item jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_jumlah integer;
  v_unik integer;
  v_kenal integer;
  v_sah boolean;
begin
  if jsonb_typeof(p_item) is distinct from 'array' or jsonb_array_length(p_item) = 0 then
    raise exception 'Isi minimal satu bahan' using errcode = '22023';
  end if;
  select count(*), count(distinct x.bahan_id), count(b.id),
         coalesce(bool_and(x.qty is not null and round(x.qty, 4) > 0 and x.qty <= 1000000), false)
  into v_jumlah, v_unik, v_kenal, v_sah
  from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric)
  left join public.bahan b on b.id = x.bahan_id and b.aktif;
  if v_kenal <> v_jumlah then
    raise exception 'Bahan tidak dikenal atau nonaktif' using errcode = '22023';
  end if;
  if v_unik <> v_jumlah then
    raise exception 'Bahan yang sama tertulis dua kali' using errcode = '22023';
  end if;
  if not v_sah then
    raise exception 'Jumlah stok tidak sah' using errcode = '22023';
  end if;
end
$$;

-- Stok awal (0011) + kunci bersama sebelum menghitung saldo.
create or replace function public.putuskan_stok_awal(p_id uuid, p_setuju boolean, p_item jsonb, p_catatan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.stok_awal;
begin
  perform public._wajib_admin_stok();
  select * into s from public.stok_awal where id = p_id for update;
  if not found then
    raise exception 'Ajuan stok awal tidak ditemukan' using errcode = '22023';
  end if;
  if s.status <> 'diajukan' then
    raise exception 'Ajuan stok awal sudah diputuskan' using errcode = '22023';
  end if;
  if p_setuju is null then
    raise exception 'Ajuan stok awal tidak lengkap' using errcode = '22023';
  end if;
  if not p_setuju then
    if p_catatan is null or length(trim(p_catatan)) < 3 or length(p_catatan) > 200 then
      raise exception 'Alasan penolakan wajib diisi (3–200 karakter)' using errcode = '22023';
    end if;
    update public.stok_awal set status = 'ditolak', diputus_at = now(), diputus_oleh = auth.uid(), catatan = trim(p_catatan)
    where id = p_id;
    return;
  end if;
  if p_catatan is not null and length(p_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._kunci_stok(s.outlet_id);
  if p_item is not null and jsonb_typeof(p_item) <> 'null' then
    perform public._cek_isian_stok(p_item);
    delete from public.stok_awal_item where stok_awal_id = p_id;
    insert into public.stok_awal_item (stok_awal_id, bahan_id, qty_hitung)
    select p_id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  end if;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, stok_awal_id)
  select s.outlet_id, i.bahan_id, d.selisih, 'awal', s.dihitung_at, auth.uid(), s.id
  from public.stok_awal_item i
  cross join lateral (
    select i.qty_hitung - coalesce(sum(g.qty), 0) as selisih
    from public.gerakan_stok g
    where g.outlet_id = s.outlet_id and g.bahan_id = i.bahan_id and g.waktu <= s.dihitung_at
  ) d
  where i.stok_awal_id = p_id and d.selisih <> 0;
  update public.stok_awal
  set status = 'disetujui', diputus_at = now(), diputus_oleh = auth.uid(), catatan = nullif(trim(coalesce(p_catatan, '')), '')
  where id = p_id;
end
$$;

create function public.catat_rusak(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid;
  v_alasan public.alasan_rusak;
  v_catatan text;
begin
  perform public._cek_akses_outlet(v_outlet);
  v_id := (p ->> 'id')::uuid;
  v_alasan := (p ->> 'alasan')::public.alasan_rusak;
  v_catatan := nullif(trim(coalesce(p ->> 'catatan', '')), '');
  if v_id is null or v_alasan is null then
    raise exception 'Data rusak tidak lengkap' using errcode = '22023';
  end if;
  perform public._kunci_stok(v_outlet);
  -- Simpan ditekan dua kali: id dibuat di perangkat.
  if exists (select 1 from public.rusak where id = v_id) then
    return v_id;
  end if;
  if v_alasan = 'lainnya' and (v_catatan is null or length(v_catatan) < 3) then
    raise exception 'Catatan wajib diisi untuk alasan lainnya (3–200 karakter)' using errcode = '22023';
  end if;
  if v_catatan is not null and length(v_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._cek_isian_positif(p -> 'item');
  insert into public.rusak (id, outlet_id, waktu, alasan, catatan, dicatat_oleh)
  values (v_id, v_outlet, now(), v_alasan, v_catatan, auth.uid());
  insert into public.rusak_item (rusak_id, bahan_id, qty)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric);
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, rusak_id)
  select v_outlet, i.bahan_id, -i.qty, 'rusak', now(), auth.uid(), v_id from public.rusak_item i where i.rusak_id = v_id;
  return v_id;
end
$$;

create function public.batal_rusak(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.rusak;
begin
  perform public._wajib_admin_stok();
  select * into v from public.rusak where id = p_id for update;
  if not found then
    raise exception 'Catatan rusak tidak ditemukan' using errcode = '22023';
  end if;
  if v.batal_at is not null then
    raise exception 'Catatan rusak sudah dibatalkan' using errcode = '22023';
  end if;
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  perform public._kunci_stok(v.outlet_id);
  if public._dihitung_terakhir(v.outlet_id) >= v.waktu then
    raise exception 'Catatan rusak sebelum stok dihitung tidak bisa dibatalkan; koreksi lewat opname' using errcode = '22023';
  end if;
  update public.rusak set batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan) where id = p_id;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, rusak_id)
  select g.outlet_id, g.bahan_id, -sum(g.qty), 'rusak_batal', now(), auth.uid(), p_id
  from public.gerakan_stok g where g.rusak_id = p_id and g.jenis = 'rusak'
  group by g.outlet_id, g.bahan_id;
end
$$;

revoke execute on function public._kunci_stok(uuid) from public, anon, authenticated;
revoke execute on function public._dihitung_terakhir(uuid) from public, anon, authenticated;
revoke execute on function public._jaga_barang_masuk() from public, anon, authenticated;
revoke execute on function public._cek_isian_positif(jsonb) from public, anon, authenticated;
revoke execute on function public.catat_rusak(jsonb) from public, anon;
revoke execute on function public.batal_rusak(uuid, text) from public, anon;
grant execute on function public.catat_rusak(jsonb) to authenticated;
grant execute on function public.batal_rusak(uuid, text) to authenticated;
