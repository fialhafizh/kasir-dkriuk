-- Tahap 5b: fungsi karyawan, kehadiran, kasbon, gaji, biaya tetap, laporan keuangan.

create function public._kategori_kode(p_kode text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.kategori_pengeluaran where kode = p_kode
$$;

-- Sisa kasbon = kasbon tidak batal − potongan kasbon di gaji yang dibayar (tidak batal).
create function public._sisa_kasbon(p_karyawan uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(jumlah) from public.pengeluaran
                   where karyawan_id = p_karyawan and kategori_id = public._kategori_kode('kasbon') and batal_at is null), 0)
       - coalesce((select sum(potongan_kasbon) from public.gaji where karyawan_id = p_karyawan and batal_at is null), 0)
$$;

-- ===== Karyawan & kehadiran (admin) =====

create function public.simpan_karyawan(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_nama text := trim(coalesce(p ->> 'nama', ''));
  v_upah integer := (p ->> 'upah_harian')::integer;
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
begin
  perform public._wajib_admin_keuangan();
  if length(v_nama) < 2 or length(v_nama) > 60 then
    raise exception 'Nama karyawan 2–60 karakter' using errcode = '22023';
  end if;
  if v_upah is null or v_upah < 0 or v_upah > 10000000 then
    raise exception 'Upah harian tidak sah' using errcode = '22023';
  end if;
  if v_id is null then
    if not exists (select 1 from public.outlets where id = v_outlet) then
      raise exception 'Outlet tidak ditemukan' using errcode = '22023';
    end if;
    insert into public.karyawan (outlet_id, nama, upah_harian) values (v_outlet, v_nama, v_upah) returning id into v_id;
  else
    -- Outlet tidak bisa dipindah (riwayat kehadiran & gaji tetap milik outlet lama): buat karyawan baru.
    if v_outlet is not null and exists (select 1 from public.karyawan where id = v_id and outlet_id <> v_outlet) then
      raise exception 'Outlet karyawan tidak bisa dipindah; tambahkan sebagai karyawan baru di outlet lain' using errcode = '22023';
    end if;
    update public.karyawan
    set nama = v_nama, upah_harian = v_upah, aktif = coalesce((p ->> 'aktif')::boolean, aktif)
    where id = v_id;
    if not found then
      raise exception 'Karyawan tidak ditemukan' using errcode = '22023';
    end if;
  end if;
  return v_id;
end
$$;

-- Untuk kasir (kasbon dari laci): nama karyawan aktif outletnya, tanpa upah.
create function public.karyawan_outlet(p_outlet uuid) returns table (id uuid, nama text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._cek_akses_outlet(p_outlet);
  return query select k.id, k.nama from public.karyawan k where k.outlet_id = p_outlet and k.aktif order by k.nama;
end
$$;

create function public.atur_kehadiran(p_karyawan uuid, p_tanggal date, p_hadir boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._wajib_admin_keuangan();
  if p_tanggal is null or p_hadir is null or not exists (select 1 from public.karyawan where id = p_karyawan) then
    raise exception 'Karyawan tidak ditemukan' using errcode = '22023';
  end if;
  if p_tanggal > public.tanggal_wib(now()) then
    raise exception 'Tanggal kehadiran tidak sah' using errcode = '22023';
  end if;
  -- Kunci yang sama dengan bayar/batal gaji: kehadiran tidak bisa menyelip saat gaji sedang dihitung.
  perform pg_advisory_xact_lock(hashtextextended('gaji:' || p_karyawan::text, 0));
  if exists (select 1 from public.gaji where karyawan_id = p_karyawan and batal_at is null
             and bulan = date_trunc('month', p_tanggal)::date) then
    raise exception 'Gaji bulan ini sudah dibayar; batalkan pembayarannya dulu untuk mengubah kehadiran' using errcode = '22023';
  end if;
  if p_hadir then
    insert into public.kehadiran (karyawan_id, tanggal, dicatat_oleh) values (p_karyawan, p_tanggal, auth.uid())
    on conflict (karyawan_id, tanggal) do nothing;
  else
    delete from public.kehadiran where karyawan_id = p_karyawan and tanggal = p_tanggal;
  end if;
end
$$;

-- ===== Kasbon =====

create function public._simpan_kasbon(p jsonb, p_sumber text, p_waktu timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_karyawan uuid := (p ->> 'karyawan_id')::uuid;
  v_jumlah integer := (p ->> 'jumlah')::integer;
  v_ket text := nullif(trim(coalesce(p ->> 'keterangan', '')), '');
begin
  if v_id is null or v_outlet is null then
    raise exception 'Data kasbon tidak lengkap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  if exists (select 1 from public.pengeluaran where id = v_id) then
    if not exists (select 1 from public.pengeluaran where id = v_id and outlet_id = v_outlet) then
      raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
    end if;
    return v_id;
  end if;
  -- Karyawan yang sudah dinonaktifkan tetap diterima (kiriman offline yang telat).
  if not exists (select 1 from public.karyawan where id = v_karyawan and outlet_id = v_outlet) then
    raise exception 'Karyawan tidak ditemukan' using errcode = '22023';
  end if;
  if v_jumlah is null or v_jumlah < 1 or v_jumlah > 100000000 then
    raise exception 'Jumlah kasbon tidak sah' using errcode = '22023';
  end if;
  if v_ket is not null and length(v_ket) > 200 then
    raise exception 'Keterangan paling banyak 200 karakter' using errcode = '22023';
  end if;
  insert into public.pengeluaran (id, outlet_id, sumber, kategori_id, jumlah, waktu, keterangan, dicatat_oleh, perangkat_id, karyawan_id)
  values (v_id, v_outlet, p_sumber, public._kategori_kode('kasbon'), v_jumlah, p_waktu, v_ket, auth.uid(),
    public._perangkat_dikenal((p ->> 'perangkat_id')::uuid), v_karyawan);
  return v_id;
end
$$;

-- Kasir (atau admin di layar kasir): kasbon dari laci, jam kejadian di perangkat.
create function public.catat_kasbon_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform public._cek_akses_outlet((p ->> 'outlet_id')::uuid);
  return public._simpan_kasbon(p, 'laci', public._waktu_perangkat((p ->> 'waktu')::timestamptz));
end
$$;

-- Admin: kasbon dari laci (jam sekarang) atau dari owner (tanggal pukul 12.00 WIB atau sekarang).
create function public.catat_kasbon_admin(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_sumber text := coalesce(p ->> 'sumber', 'luar');
  v_tanggal date := (p ->> 'tanggal')::date;
begin
  perform public._wajib_admin_keuangan();
  if v_sumber not in ('laci', 'luar') then
    raise exception 'Sumber pengeluaran tidak sah' using errcode = '22023';
  end if;
  if v_tanggal is not null and (v_tanggal > public.tanggal_wib(now()) or v_tanggal < public.tanggal_wib(now()) - 400) then
    raise exception 'Tanggal pengeluaran tidak sah' using errcode = '22023';
  end if;
  return public._simpan_kasbon(p, v_sumber,
    case when v_tanggal is null or v_sumber = 'laci' then now() else (v_tanggal::text || ' 12:00:00+07')::timestamptz end);
end
$$;

-- Pengganti versi 0023: gaji dibatalkan lewat halaman Gaji; kasbon hanya bila belum dipotong gaji.
create or replace function public.batal_pengeluaran(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.pengeluaran;
begin
  perform public._wajib_admin_keuangan();
  select * into v from public.pengeluaran where id = p_id for update;
  if not found then
    raise exception 'Pengeluaran tidak ditemukan' using errcode = '22023';
  end if;
  if v.batal_at is not null then
    raise exception 'Pengeluaran sudah dibatalkan' using errcode = '22023';
  end if;
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  if v.kategori_id = public._kategori_kode('gaji') then
    raise exception 'Pembayaran gaji dibatalkan lewat halaman Gaji' using errcode = '22023';
  end if;
  if v.kategori_id = public._kategori_kode('kasbon') then
    perform pg_advisory_xact_lock(hashtextextended('gaji:' || v.karyawan_id::text, 0));
    if public._sisa_kasbon(v.karyawan_id) < v.jumlah then
      raise exception 'Kasbon ini sudah dipotong dari gaji; batalkan pembayaran gajinya dulu' using errcode = '22023';
    end if;
  end if;
  update public.pengeluaran set batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan) where id = p_id;
end
$$;

-- ===== Gaji =====

-- Rekap gaji per karyawan outlet untuk satu bulan (karyawan aktif, atau yang punya kehadiran/gaji bulan itu).
create function public.hitung_gaji(p_outlet uuid, p_bulan date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_bulan date := date_trunc('month', p_bulan)::date;
begin
  perform public._wajib_admin_keuangan();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'karyawan_id', k.id, 'nama', k.nama, 'aktif', k.aktif, 'upah_harian', k.upah_harian,
      'hari_masuk', (select count(*) from public.kehadiran h
                     where h.karyawan_id = k.id and h.tanggal >= v_bulan and h.tanggal < (v_bulan + interval '1 month')::date),
      'sisa_kasbon', public._sisa_kasbon(k.id),
      'gaji', (select to_jsonb(g) from public.gaji g where g.karyawan_id = k.id and g.bulan = v_bulan and g.batal_at is null)
    ) order by k.nama)
    from public.karyawan k
    where k.outlet_id = p_outlet
      and (k.aktif
           or exists (select 1 from public.kehadiran h where h.karyawan_id = k.id and h.tanggal >= v_bulan and h.tanggal < (v_bulan + interval '1 month')::date)
           or exists (select 1 from public.gaji g where g.karyawan_id = k.id and g.bulan = v_bulan and g.batal_at is null))
  ), '[]'::jsonb);
end
$$;

-- Bayar gaji: hari masuk & upah dihitung server; dibayar = hari × upah + penyesuaian − potongan kasbon.
create function public.bayar_gaji(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_karyawan uuid := (p ->> 'karyawan_id')::uuid;
  v_bulan date := date_trunc('month', (p ->> 'bulan')::date)::date;
  v_penyesuaian integer := coalesce((p ->> 'penyesuaian')::integer, 0);
  v_ket text := nullif(trim(coalesce(p ->> 'keterangan', '')), '');
  v_potongan integer := coalesce((p ->> 'potongan_kasbon')::integer, 0);
  v_sumber text := coalesce(p ->> 'sumber', 'luar');
  k public.karyawan;
  g public.gaji;
  v_hari integer;
  v_dibayar bigint;
  v_peng uuid;
begin
  perform public._wajib_admin_keuangan();
  if v_id is null or v_bulan is null then
    raise exception 'Data gaji tidak lengkap' using errcode = '22023';
  end if;
  select * into k from public.karyawan where id = v_karyawan;
  if not found then
    raise exception 'Karyawan tidak ditemukan' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gaji:' || v_karyawan::text, 0));
  select * into g from public.gaji where id = v_id;
  if found then
    if g.karyawan_id <> v_karyawan or g.batal_at is not null then
      raise exception 'Data gaji tidak lengkap' using errcode = '22023';
    end if;
    return to_jsonb(g);
  end if;
  if v_bulan > date_trunc('month', public.tanggal_wib(now()))::date then
    raise exception 'Bulan gaji tidak sah' using errcode = '22023';
  end if;
  if exists (select 1 from public.gaji where karyawan_id = v_karyawan and bulan = v_bulan and batal_at is null) then
    raise exception 'Gaji bulan ini sudah dibayar' using errcode = '22023';
  end if;
  if v_sumber not in ('laci', 'luar') then
    raise exception 'Sumber pengeluaran tidak sah' using errcode = '22023';
  end if;
  if v_penyesuaian < -100000000 or v_penyesuaian > 100000000 then
    raise exception 'Penyesuaian tidak sah' using errcode = '22023';
  end if;
  if v_penyesuaian <> 0 and (v_ket is null or length(v_ket) < 3) then
    raise exception 'Keterangan penyesuaian wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  if v_ket is not null and length(v_ket) > 200 then
    raise exception 'Keterangan paling banyak 200 karakter' using errcode = '22023';
  end if;
  if v_potongan < 0 or v_potongan > public._sisa_kasbon(v_karyawan) then
    raise exception 'Potongan kasbon melebihi sisa kasbon' using errcode = '22023';
  end if;
  select count(*) into v_hari from public.kehadiran
  where karyawan_id = v_karyawan and tanggal >= v_bulan and tanggal < (v_bulan + interval '1 month')::date;
  v_dibayar := v_hari::bigint * k.upah_harian + v_penyesuaian - v_potongan;
  if v_dibayar < 0 then
    raise exception 'Gaji yang dibayar tidak boleh minus; kurangi potongan kasbon' using errcode = '22023';
  end if;
  if v_dibayar > 100000000 then
    raise exception 'Gaji yang dibayar terlalu besar' using errcode = '22023';
  end if;
  if v_dibayar > 0 then
    v_peng := gen_random_uuid();
    insert into public.pengeluaran (id, outlet_id, sumber, kategori_id, jumlah, waktu, keterangan, dicatat_oleh, karyawan_id)
    values (v_peng, k.outlet_id, v_sumber, public._kategori_kode('gaji'), v_dibayar, now(),
      left('Gaji ' || to_char(v_bulan, 'MM/YYYY') || ' ' || k.nama, 200), auth.uid(), k.id);
  end if;
  insert into public.gaji (id, karyawan_id, bulan, hari_masuk, upah_harian, penyesuaian, keterangan, potongan_kasbon, dibayar, pengeluaran_id, dibayar_oleh)
  values (v_id, k.id, v_bulan, v_hari, k.upah_harian, v_penyesuaian, v_ket, v_potongan, v_dibayar, v_peng, auth.uid())
  returning * into g;
  return to_jsonb(g);
end
$$;

-- Batal gaji: pembayaran dianggap tidak pernah ada (koreksi laci, sesuai 5a); kehadiran bulan itu terbuka lagi.
create function public.batal_gaji(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.gaji;
begin
  perform public._wajib_admin_keuangan();
  select * into g from public.gaji where id = p_id;
  if not found then
    raise exception 'Gaji tidak ditemukan' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gaji:' || g.karyawan_id::text, 0));
  select * into g from public.gaji where id = p_id for update;
  if g.batal_at is not null then
    raise exception 'Gaji sudah dibatalkan' using errcode = '22023';
  end if;
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  update public.gaji set batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan) where id = p_id;
  update public.pengeluaran set batal_at = now(), batal_oleh = auth.uid(), batal_alasan = 'Gaji dibatalkan: ' || trim(p_alasan)
  where id = g.pengeluaran_id and batal_at is null;
end
$$;

-- ===== Biaya tetap =====

create function public.simpan_biaya_tetap(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_nama text := trim(coalesce(p ->> 'nama', 'Sewa'));
  v_per integer := (p ->> 'per_tahun')::integer;
  v_mulai date := (p ->> 'mulai')::date;
begin
  perform public._wajib_admin_keuangan();
  if v_id is not null then
    -- Hanya menonaktifkan (riwayat tetap ada).
    update public.biaya_tetap set aktif = coalesce((p ->> 'aktif')::boolean, aktif) where id = v_id;
    if not found then
      raise exception 'Biaya tetap tidak ditemukan' using errcode = '22023';
    end if;
    return v_id;
  end if;
  if not exists (select 1 from public.outlets where id = (p ->> 'outlet_id')::uuid) then
    raise exception 'Outlet tidak ditemukan' using errcode = '22023';
  end if;
  if length(v_nama) < 2 or length(v_nama) > 40 then
    raise exception 'Nama biaya tetap 2–40 karakter' using errcode = '22023';
  end if;
  if v_per is null or v_per < 0 or v_per > 2000000000 then
    raise exception 'Nominal per tahun tidak sah' using errcode = '22023';
  end if;
  if v_mulai is null then
    raise exception 'Tanggal mulai berlaku wajib diisi' using errcode = '22023';
  end if;
  insert into public.biaya_tetap (outlet_id, nama, per_tahun, mulai, dicatat_oleh)
  values ((p ->> 'outlet_id')::uuid, v_nama, v_per, v_mulai, auth.uid()) returning id into v_id;
  return v_id;
end
$$;

revoke execute on function public._kategori_kode(text) from public, anon, authenticated;
revoke execute on function public._sisa_kasbon(uuid) from public, anon, authenticated;
revoke execute on function public._simpan_kasbon(jsonb, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.simpan_karyawan(jsonb) from public, anon;
revoke execute on function public.karyawan_outlet(uuid) from public, anon;
revoke execute on function public.atur_kehadiran(uuid, date, boolean) from public, anon;
revoke execute on function public.catat_kasbon_offline(jsonb) from public, anon;
revoke execute on function public.catat_kasbon_admin(jsonb) from public, anon;
revoke execute on function public.hitung_gaji(uuid, date) from public, anon;
revoke execute on function public.bayar_gaji(jsonb) from public, anon;
revoke execute on function public.batal_gaji(uuid, text) from public, anon;
revoke execute on function public.simpan_biaya_tetap(jsonb) from public, anon;
grant execute on function public.simpan_karyawan(jsonb) to authenticated;
grant execute on function public.karyawan_outlet(uuid) to authenticated;
grant execute on function public.atur_kehadiran(uuid, date, boolean) to authenticated;
grant execute on function public.catat_kasbon_offline(jsonb) to authenticated;
grant execute on function public.catat_kasbon_admin(jsonb) to authenticated;
grant execute on function public.hitung_gaji(uuid, date) to authenticated;
grant execute on function public.bayar_gaji(jsonb) to authenticated;
grant execute on function public.batal_gaji(uuid, text) to authenticated;
grant execute on function public.simpan_biaya_tetap(jsonb) to authenticated;

-- ===== Laporan keuangan: laba-rugi sederhana & arus kas (cara owner) =====

create function public.laporan_keuangan(p_outlet uuid, p_dari date, p_sampai date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_awal timestamptz;
  v_akhir timestamptz;
  v_metode jsonb;
  v_omzet bigint;
  v_bahan_masuk bigint;
  v_bahan_lain bigint;
  v_gaji bigint;
  v_sewa bigint;
  v_lain jsonb;
  v_lain_total bigint;
  v_keluar jsonb;
  v_setor_terima bigint;
  v_setor_selisih bigint;
begin
  perform public._wajib_admin_keuangan();
  if p_dari is null or p_sampai is null or p_sampai < p_dari or p_sampai - p_dari > 365 then
    raise exception 'Rentang tanggal tidak sah (paling lama 366 hari)' using errcode = '22023';
  end if;
  v_awal := (p_dari::text || ' 00:00:00+07')::timestamptz;
  v_akhir := ((p_sampai + 1)::text || ' 00:00:00+07')::timestamptz;

  select jsonb_object_agg(m.metode, jsonb_build_object('jumlah', coalesce(x.jumlah, 0), 'total', coalesce(x.total, 0))),
         coalesce(sum(x.total), 0)
  into v_metode, v_omzet
  from unnest(enum_range(null::public.metode_bayar)) as m (metode)
  left join (
    select metode, count(*)::integer as jumlah, sum(total)::bigint as total from public.penjualan
    where (p_outlet is null or outlet_id = p_outlet) and void_at is null and waktu >= v_awal and waktu < v_akhir
    group by metode
  ) x on x.metode = m.metode;

  -- Barang masuk menurut tanggalnya; pembatalan sebagai koreksi pada tanggal batal (sama dengan kas harian).
  v_bahan_masuk := (select coalesce(sum(total), 0) from public.barang_masuk
                    where (p_outlet is null or outlet_id = p_outlet) and tanggal between p_dari and p_sampai)
                 - (select coalesce(sum(total), 0) from public.barang_masuk
                    where (p_outlet is null or outlet_id = p_outlet) and batal_at >= v_awal and batal_at < v_akhir);
  v_bahan_lain := (select coalesce(sum(jumlah), 0) from public.pengeluaran
                   where (p_outlet is null or outlet_id = p_outlet) and batal_at is null and waktu >= v_awal and waktu < v_akhir
                     and kategori_id = public._kategori_kode('belanja_bahan'));

  -- Gaji akrual: hari masuk di periode × upah (upah di gaji yang dibayar untuk bulan itu, selain itu upah sekarang)
  -- + penyesuaian gaji dibayar yang bulannya (tanggal 1) di periode.
  v_gaji := (select coalesce(sum(coalesce(g.upah_harian, k.upah_harian)), 0)
             from public.kehadiran h
             join public.karyawan k on k.id = h.karyawan_id
             left join public.gaji g on g.karyawan_id = h.karyawan_id and g.bulan = date_trunc('month', h.tanggal)::date and g.batal_at is null
             where (p_outlet is null or k.outlet_id = p_outlet) and h.tanggal between p_dari and p_sampai)
          + (select coalesce(sum(g.penyesuaian), 0) from public.gaji g join public.karyawan k on k.id = g.karyawan_id
             where (p_outlet is null or k.outlet_id = p_outlet) and g.batal_at is null and g.bulan between p_dari and p_sampai);

  -- Sewa: tiap hari, baris aktif dengan mulai terakhir ≤ hari itu (per outlet & nama), dibagi 365.
  v_sewa := (select coalesce(round(sum(b.per_tahun::numeric / 365)), 0)
             from generate_series(p_dari::timestamp, p_sampai::timestamp, interval '1 day') as d (hari)
             cross join lateral (
               select distinct on (bt.outlet_id, bt.nama) bt.per_tahun
               from public.biaya_tetap bt
               where bt.aktif and bt.mulai <= d.hari::date and (p_outlet is null or bt.outlet_id = p_outlet)
               order by bt.outlet_id, bt.nama, bt.mulai desc, bt.dicatat_at desc
             ) b);

  select coalesce(jsonb_agg(jsonb_build_object('kategori', x.nama, 'jumlah', x.jumlah) order by x.urutan), '[]'::jsonb),
         coalesce(sum(x.jumlah), 0)
  into v_lain, v_lain_total
  from (
    select k.nama, k.urutan, sum(p.jumlah)::bigint as jumlah
    from public.pengeluaran p join public.kategori_pengeluaran k on k.id = p.kategori_id
    where (p_outlet is null or p.outlet_id = p_outlet) and p.batal_at is null and p.waktu >= v_awal and p.waktu < v_akhir
      and (k.kode is null)
    group by k.nama, k.urutan
  ) x;

  -- Arus kas keluar: semua pengeluaran per kategori, dipisah laci / di luar laci.
  select coalesce(jsonb_agg(jsonb_build_object('kategori', x.nama, 'laci', x.laci, 'luar', x.luar) order by x.urutan), '[]'::jsonb)
  into v_keluar
  from (
    select k.nama, k.urutan,
           coalesce(sum(p.jumlah) filter (where p.sumber = 'laci'), 0)::bigint as laci,
           coalesce(sum(p.jumlah) filter (where p.sumber = 'luar'), 0)::bigint as luar
    from public.pengeluaran p join public.kategori_pengeluaran k on k.id = p.kategori_id
    where (p_outlet is null or p.outlet_id = p_outlet) and p.batal_at is null and p.waktu >= v_awal and p.waktu < v_akhir
    group by k.nama, k.urutan
  ) x;

  select coalesce(sum(jumlah_diterima), 0), coalesce(sum(jumlah_diterima - jumlah), 0)
  into v_setor_terima, v_setor_selisih
  from public.setoran
  where (p_outlet is null or outlet_id = p_outlet) and batal_at is null and diterima_at >= v_awal and diterima_at < v_akhir;

  return jsonb_build_object(
    'dari', p_dari, 'sampai', p_sampai,
    'omzet', v_omzet, 'per_metode', v_metode,
    'belanja_bahan', v_bahan_masuk + v_bahan_lain, 'belanja_bahan_masuk', v_bahan_masuk, 'belanja_bahan_lain', v_bahan_lain,
    'gaji', v_gaji, 'sewa', v_sewa,
    'pengeluaran_lain', v_lain, 'pengeluaran_lain_total', v_lain_total,
    'laba', v_omzet - (v_bahan_masuk + v_bahan_lain) - v_gaji - v_sewa - v_lain_total,
    'arus_keluar', v_keluar, 'setoran_diterima', v_setor_terima, 'selisih_setoran', v_setor_selisih
  );
end
$$;

revoke execute on function public.laporan_keuangan(uuid, date, date) from public, anon;
grant execute on function public.laporan_keuangan(uuid, date, date) to authenticated;
