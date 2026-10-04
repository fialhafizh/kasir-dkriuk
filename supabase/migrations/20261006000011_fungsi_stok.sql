-- Fungsi stok (Tahap 3a): barang masuk & stok awal. security definer; akses diperiksa di dalam.

create function public._wajib_admin_stok() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Hanya admin yang boleh mengelola stok' using errcode = '42501';
  end if;
end
$$;

-- Memeriksa daftar hitungan [{bahan_id, qty}] (stok awal).
create function public._cek_isian_stok(p_item jsonb) returns void
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
         coalesce(bool_and(x.qty is not null and x.qty >= 0 and x.qty <= 1000000), false)
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

create function public.catat_barang_masuk(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_outlet uuid;
  v_tanggal date;
  v_catatan text;
  v_hari_ini date := public.tanggal_wib(now());
  v_waktu timestamptz;
  v_jumlah integer;
  v_unik integer;
  v_kenal integer;
  v_qty_sah boolean;
  v_harga_sah boolean;
  v_harga_kosong boolean;
  v_total bigint;
begin
  perform public._wajib_admin_stok();
  v_id := (p ->> 'id')::uuid;
  v_outlet := (p ->> 'outlet_id')::uuid;
  v_tanggal := (p ->> 'tanggal')::date;
  v_catatan := nullif(trim(coalesce(p ->> 'catatan', '')), '');
  if v_id is null or v_outlet is null or v_tanggal is null then
    raise exception 'Data barang masuk tidak lengkap' using errcode = '22023';
  end if;
  -- Simpan ditekan dua kali / kirim ulang: id dibuat di perangkat, kiriman kedua diabaikan.
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  if exists (select 1 from public.barang_masuk where id = v_id) then
    return v_id;
  end if;
  if not exists (select 1 from public.outlets where id = v_outlet) then
    raise exception 'Outlet tidak ditemukan' using errcode = '22023';
  end if;
  if v_tanggal > v_hari_ini or v_tanggal < v_hari_ini - 7 then
    raise exception 'Tanggal barang masuk paling lama 7 hari ke belakang dan tidak boleh di masa depan' using errcode = '22023';
  end if;
  if v_catatan is not null and length(v_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'item') is distinct from 'array' or jsonb_array_length(p -> 'item') = 0 then
    raise exception 'Barang masuk minimal satu barang' using errcode = '22023';
  end if;

  select count(*), count(distinct x.satuan_beli_id), count(s.id),
         coalesce(bool_and(x.qty is not null and x.qty > 0 and x.qty <= 100000 and x.qty = round(x.qty, 3)), false),
         coalesce(bool_and(x.harga is not null and x.harga between 0 and 100000000), false),
         coalesce(bool_or(not s.harga_tetap and x.harga = 0), false),
         coalesce(sum(round(x.qty * x.harga)), 0)::bigint
  into v_jumlah, v_unik, v_kenal, v_qty_sah, v_harga_sah, v_harga_kosong, v_total
  from jsonb_to_recordset(p -> 'item') as x (satuan_beli_id uuid, qty numeric, harga integer)
  left join public.satuan_beli s on s.id = x.satuan_beli_id and s.aktif;

  if v_kenal <> v_jumlah then
    raise exception 'Barang tidak dikenal atau nonaktif' using errcode = '22023';
  end if;
  if v_unik <> v_jumlah then
    raise exception 'Barang yang sama tertulis dua kali' using errcode = '22023';
  end if;
  if not v_qty_sah then
    raise exception 'Jumlah barang tidak sah' using errcode = '22023';
  end if;
  if not v_harga_sah then
    raise exception 'Harga barang tidak sah' using errcode = '22023';
  end if;
  if v_harga_kosong then
    raise exception 'Harga barang yang harganya berubah-ubah wajib diisi' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p -> 'item') as x (satuan_beli_id uuid)
    where not exists (select 1 from public.satuan_beli_isi i where i.satuan_beli_id = x.satuan_beli_id)
  ) then
    raise exception 'Barang belum punya isi bahan; atur dulu di menu Bahan' using errcode = '22023';
  end if;

  -- Tanggal mundur: waktu = jam sekarang pada tanggal itu (urutan riwayat tetap masuk akal).
  v_waktu := case when v_tanggal = v_hari_ini then now() else now() - make_interval(days => v_hari_ini - v_tanggal) end;
  -- Barang yang datang sebelum stok awal dihitung sudah termasuk hitungan kasir: jangan dihitung dua kali.
  if exists (select 1 from public.stok_awal where outlet_id = v_outlet and status = 'disetujui' and dihitung_at >= v_waktu) then
    raise exception 'Barang masuk sebelum stok awal dihitung sudah termasuk hitungan; koreksi lewat opname' using errcode = '22023';
  end if;

  insert into public.barang_masuk (id, outlet_id, tanggal, waktu, total, catatan, dicatat_oleh)
  values (v_id, v_outlet, v_tanggal, v_waktu, v_total, v_catatan, auth.uid());

  insert into public.barang_masuk_item (barang_masuk_id, satuan_beli_id, nama, qty, harga)
  select v_id, s.id, s.nama, x.qty, x.harga
  from jsonb_to_recordset(p -> 'item') as x (satuan_beli_id uuid, qty numeric, harga integer)
  join public.satuan_beli s on s.id = x.satuan_beli_id;

  -- Isi pack dipecah saat ini (snapshot): perubahan isi pack di master tidak mengubah riwayat.
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, barang_masuk_id)
  select v_outlet, i.bahan_id, sum(x.qty * i.qty), 'masuk', v_waktu, auth.uid(), v_id
  from jsonb_to_recordset(p -> 'item') as x (satuan_beli_id uuid, qty numeric, harga integer)
  join public.satuan_beli_isi i on i.satuan_beli_id = x.satuan_beli_id
  group by i.bahan_id;

  return v_id;
end
$$;

create function public.batal_barang_masuk(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.barang_masuk;
begin
  perform public._wajib_admin_stok();
  select * into v from public.barang_masuk where id = p_id for update;
  if not found then
    raise exception 'Barang masuk tidak ditemukan' using errcode = '22023';
  end if;
  if v.batal_at is not null then
    raise exception 'Barang masuk sudah dibatalkan' using errcode = '22023';
  end if;
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  if exists (select 1 from public.stok_awal where outlet_id = v.outlet_id and status = 'disetujui' and dihitung_at >= v.waktu) then
    raise exception 'Barang masuk sebelum stok awal dihitung tidak bisa dibatalkan; koreksi lewat opname' using errcode = '22023';
  end if;
  update public.barang_masuk set batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan) where id = p_id;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, barang_masuk_id)
  select g.outlet_id, g.bahan_id, -sum(g.qty), 'masuk_batal', now(), auth.uid(), p_id
  from public.gerakan_stok g
  where g.barang_masuk_id = p_id and g.jenis = 'masuk'
  group by g.outlet_id, g.bahan_id;
end
$$;

create function public.ajukan_stok_awal(p_outlet uuid, p_item jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public._cek_akses_outlet(p_outlet);
  perform pg_advisory_xact_lock(hashtextextended('stok_awal:' || p_outlet::text, 0));
  if exists (select 1 from public.stok_awal where outlet_id = p_outlet and status = 'disetujui') then
    raise exception 'Stok awal outlet ini sudah disetujui; koreksi berikutnya lewat opname' using errcode = '22023';
  end if;
  if exists (select 1 from public.stok_awal where outlet_id = p_outlet and status = 'diajukan') then
    raise exception 'Stok awal outlet ini masih menunggu persetujuan admin' using errcode = '22023';
  end if;
  perform public._cek_isian_stok(p_item);
  insert into public.stok_awal (outlet_id, diajukan_oleh) values (p_outlet, auth.uid()) returning id into v_id;
  insert into public.stok_awal_item (stok_awal_id, bahan_id, qty_hitung)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  return v_id;
end
$$;

create function public.putuskan_stok_awal(p_id uuid, p_setuju boolean, p_item jsonb, p_catatan text) returns void
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

  -- Admin boleh membetulkan angka kasir sebelum menyetujui.
  if p_item is not null and jsonb_typeof(p_item) <> 'null' then
    perform public._cek_isian_stok(p_item);
    delete from public.stok_awal_item where stok_awal_id = p_id;
    insert into public.stok_awal_item (stok_awal_id, bahan_id, qty_hitung)
    select p_id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  end if;

  -- Hitungan berlaku PADA SAAT DIHITUNG: koreksi = hitungan − saldo buku besar sampai saat itu.
  -- Penjualan sesudah dihitung tetap memotong. (Rumus yang sama dipakai opname 3b.)
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

revoke execute on function public._wajib_admin_stok() from public, anon, authenticated;
revoke execute on function public._cek_isian_stok(jsonb) from public, anon, authenticated;
revoke execute on function public.catat_barang_masuk(jsonb) from public, anon;
revoke execute on function public.batal_barang_masuk(uuid, text) from public, anon;
revoke execute on function public.ajukan_stok_awal(uuid, jsonb) from public, anon;
revoke execute on function public.putuskan_stok_awal(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.catat_barang_masuk(jsonb) to authenticated;
grant execute on function public.batal_barang_masuk(uuid, text) to authenticated;
grant execute on function public.ajukan_stok_awal(uuid, jsonb) to authenticated;
grant execute on function public.putuskan_stok_awal(uuid, boolean, jsonb, text) to authenticated;
