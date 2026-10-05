-- Tahap 4a: fungsi untuk antrean offline. Semua idempoten per id dari perangkat dan memakai jam kejadian.

-- Jam dari perangkat dipercaya dalam batas wajar; di luar itu memakai jam server.
create function public._waktu_perangkat(p_waktu timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when p_waktu is null or p_waktu > now() + interval '5 minutes' or p_waktu < now() - interval '7 days' then now()
    else p_waktu
  end
$$;

-- Shift sebenarnya dari id shift perangkat (atau id shift server langsung, untuk shift Tahap 2).
create function public._shift_dari_perangkat(p_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce((select shift_id from public.shift_perangkat where id = p_id), (select id from public.shift where id = p_id))
$$;

-- Hitungan fisik terakhir yang SUDAH DISETUJUI (yang menunggu bisa ditolak; koreksinya dihitung saat disetujui).
create function public._dihitung_disetujui(p_outlet uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(t) from (
    select dihitung_at as t from public.stok_awal where outlet_id = p_outlet and status = 'disetujui'
    union all
    select dihitung_at from public.opname where outlet_id = p_outlet and status = 'disetujui'
  ) x
$$;

-- Perangkat yang tidak dikenal dicatat kosong (bukan galat kunci asing).
create function public._perangkat_dikenal(p_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.perangkat where id = p_id
$$;

create function public.daftar_perangkat(p_id uuid, p_outlet uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_kode integer;
begin
  perform public._cek_akses_outlet(p_outlet);
  if p_id is null then
    raise exception 'Data perangkat tidak lengkap' using errcode = '22023';
  end if;
  -- Sudah terdaftar: perbarui saja (insert ... on conflict tetap memakan nomor kode).
  update public.perangkat set outlet_id = p_outlet, terakhir_oleh = auth.uid() where id = p_id returning kode into v_kode;
  if found then
    return v_kode;
  end if;
  insert into public.perangkat (id, outlet_id, terakhir_oleh) values (p_id, p_outlet, auth.uid()) returning kode into v_kode;
  return v_kode;
end
$$;

create function public.tandai_sinkron(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.perangkat set terakhir_sinkron = now(), terakhir_oleh = auth.uid()
  where id = p_id and (public.is_admin() or coalesce(public.my_outlet_id() = outlet_id, false));
end
$$;

create function public.buka_shift_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid;
  v_modal integer;
  v_perangkat uuid;
  v_waktu timestamptz;
  v_shift uuid;
begin
  perform public._cek_akses_outlet(v_outlet);
  v_id := (p ->> 'id')::uuid;
  v_modal := (p ->> 'modal')::integer;
  v_perangkat := (p ->> 'perangkat_id')::uuid;
  v_waktu := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  if v_id is null then
    raise exception 'Data shift tidak lengkap' using errcode = '22023';
  end if;
  if v_modal is null or v_modal < 0 or v_modal > 100000000 then
    raise exception 'Modal kembalian tidak sah' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shift:' || v_outlet::text, 0));
  select sp.shift_id into v_shift from public.shift_perangkat sp join public.shift s on s.id = sp.shift_id
  where sp.id = v_id and s.outlet_id = v_outlet;
  if found then
    return v_shift;
  end if;
  v_perangkat := public._perangkat_dikenal(v_perangkat);
  -- Shift yang sedang berjalan saat perangkat ini membuka (hari WIB sama, belum ditutup saat itu) → gabung.
  select id into v_shift from public.shift
  where outlet_id = v_outlet and public.tanggal_wib(dibuka_at) = public.tanggal_wib(v_waktu)
    and (ditutup_at is null or ditutup_at >= v_waktu)
  order by dibuka_at limit 1;
  if v_shift is not null then
    update public.shift set digabung = true where id = v_shift;
  else
    if exists (select 1 from public.shift where outlet_id = v_outlet and ditutup_at is null
               and public.tanggal_wib(dibuka_at) < public.tanggal_wib(v_waktu)) then
      raise exception 'Toko kemarin belum ditutup' using errcode = '22023';
    end if;
    if exists (select 1 from public.shift where outlet_id = v_outlet and ditutup_at is null) then
      -- Shift hari berikutnya sudah buka (perangkat ini terlambat sinkron): shift hari itu dibuat
      -- tertutup sementara; tutup toko dari perangkat ini nanti mengisi angka sebenarnya.
      insert into public.shift (id, outlet_id, dibuka_oleh, modal, dibuka_at, ditutup_at, ditutup_oleh, uang_fisik, tutup_tertunda)
      values (v_id, v_outlet, auth.uid(), v_modal, v_waktu, v_waktu, auth.uid(), 0, true);
    else
      insert into public.shift (id, outlet_id, dibuka_oleh, modal, dibuka_at, dibuka_lagi_setelah)
      values (v_id, v_outlet, auth.uid(), v_modal, v_waktu,
        (select max(ditutup_at) from public.shift
         where outlet_id = v_outlet and public.tanggal_wib(dibuka_at) = public.tanggal_wib(v_waktu) and ditutup_at < v_waktu));
    end if;
    v_shift := v_id;
  end if;
  insert into public.shift_perangkat (id, shift_id, perangkat_id, modal, dibuka_at) values (v_id, v_shift, v_perangkat, v_modal, v_waktu);
  return v_shift;
end
$$;

create or replace function public.ringkasan_shift(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.shift;
  v_metode jsonb;
  v_jumlah integer;
  v_void integer;
  v_total integer;
  v_cash integer;
begin
  select * into s from public.shift where id = p_shift;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = s.outlet_id, false)) then
    raise exception 'Shift tidak ditemukan' using errcode = '22023';
  end if;
  select jsonb_object_agg(m.metode, jsonb_build_object('jumlah', coalesce(x.jumlah, 0), 'total', coalesce(x.total, 0)))
  into v_metode
  from unnest(enum_range(null::public.metode_bayar)) as m (metode)
  left join (
    select metode, count(*)::integer as jumlah, sum(total)::integer as total
    from public.penjualan where shift_id = p_shift and void_at is null group by metode
  ) x on x.metode = m.metode;
  select count(*) filter (where void_at is null), count(*) filter (where void_at is not null),
         coalesce(sum(total) filter (where void_at is null), 0),
         coalesce(sum(total) filter (where void_at is null and metode = 'cash'), 0)
  into v_jumlah, v_void, v_total, v_cash
  from public.penjualan where shift_id = p_shift;
  return jsonb_build_object(
    'shift_id', s.id, 'outlet_id', s.outlet_id, 'modal', s.modal, 'dibuka_at', s.dibuka_at, 'ditutup_at', s.ditutup_at,
    'jumlah_transaksi', v_jumlah, 'jumlah_void', v_void, 'total', v_total, 'per_metode', v_metode,
    'cash_seharusnya', s.modal + v_cash,
    'uang_fisik', case when s.tutup_tertunda then null else s.uang_fisik end,
    'selisih', case when s.uang_fisik is null or s.tutup_tertunda then null else s.uang_fisik - (s.modal + v_cash) end,
    'digabung', s.digabung, 'jual_setelah_tutup', s.jual_setelah_tutup, 'dibuka_lagi_setelah', s.dibuka_lagi_setelah,
    'tutup_tertunda', s.tutup_tertunda
  );
end
$$;

create function public.tutup_shift_offline(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_dev uuid := (p ->> 'shift_id')::uuid;
  v_shift uuid := public._shift_dari_perangkat(v_dev);
  v_uang integer := (p ->> 'uang_fisik')::integer;
  v_waktu timestamptz := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  v_outlet uuid;
  s public.shift;
begin
  select outlet_id into v_outlet from public.shift where id = v_shift;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = v_outlet, false)) then
    raise exception 'Shift tidak ditemukan' using errcode = '22023';
  end if;
  -- Kunci yang sama dengan buka: perangkat yang membuka tidak bisa digabung ke shift yang sedang ditutup.
  perform pg_advisory_xact_lock(hashtextextended('shift:' || v_outlet::text, 0));
  select * into s from public.shift where id = v_shift for update;
  if v_id is not null and (s.tutup_id = v_id or exists (select 1 from public.shift_perangkat where tutup_id = v_id)) then
    return public.ringkasan_shift(s.id) || jsonb_build_object('sudah_ditutup', s.tutup_id is distinct from v_id);
  end if;
  if v_id is null or v_uang is null or v_uang < 0 or v_uang > 1000000000 then
    raise exception 'Jumlah uang di laci tidak sah' using errcode = '22023';
  end if;
  if s.ditutup_at is not null and not s.tutup_tertunda then
    -- Sudah ditutup perangkat lain (shift gabungan): simpan hitungan laci perangkat ini sebagai catatan.
    -- Hanya baris perangkat ini (bukan baris pembuka shift yang id-nya = id shift).
    update public.shift_perangkat set uang_fisik = v_uang, ditutup_at = v_waktu, tutup_id = v_id where id = v_dev and v_dev <> s.id;
    if not found then
      raise exception 'Shift sudah ditutup' using errcode = '22023';
    end if;
    return public.ringkasan_shift(s.id) || jsonb_build_object('sudah_ditutup', true);
  end if;
  update public.shift
  set ditutup_at = greatest(v_waktu, s.dibuka_at), ditutup_oleh = auth.uid(), uang_fisik = v_uang, tutup_id = v_id,
      tutup_tertunda = false, catatan = nullif(trim(coalesce(p ->> 'catatan', '')), '')
  where id = s.id;
  return public.ringkasan_shift(s.id) || jsonb_build_object('sudah_ditutup', false);
end
$$;

revoke execute on function public._shift_dari_perangkat(uuid) from public, anon, authenticated;
revoke execute on function public._dihitung_disetujui(uuid) from public, anon, authenticated;
revoke execute on function public._perangkat_dikenal(uuid) from public, anon, authenticated;
revoke execute on function public.daftar_perangkat(uuid, uuid) from public, anon;
revoke execute on function public.tandai_sinkron(uuid) from public, anon;
revoke execute on function public.buka_shift_offline(jsonb) from public, anon;
revoke execute on function public.tutup_shift_offline(jsonb) from public, anon;
grant execute on function public.daftar_perangkat(uuid, uuid) to authenticated;
grant execute on function public.tandai_sinkron(uuid) to authenticated;
grant execute on function public.buka_shift_offline(jsonb) to authenticated;
grant execute on function public.tutup_shift_offline(jsonb) to authenticated;

create function public.catat_penjualan_offline(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid;
  v_shift uuid;
  v_metode public.metode_bayar;
  v_diterima integer;
  v_waktu timestamptz;
  v_kode_struk text;
  v_sementara text;
  v_perangkat uuid;
  v_ada public.penjualan;
  s public.shift;
  v_minta integer;
  v_cocok integer;
  v_qty_sah boolean;
  v_total integer;
  v_kembalian integer;
  v_kode text;
  v_urut integer;
  v_nomor text;
begin
  perform public._cek_akses_outlet(v_outlet);
  v_id := (p ->> 'id')::uuid;
  v_metode := (p ->> 'metode')::public.metode_bayar;
  v_diterima := (p ->> 'diterima')::integer;
  v_kode_struk := p ->> 'kode_struk';
  v_sementara := nullif(p ->> 'nomor_sementara', '');
  v_perangkat := (p ->> 'perangkat_id')::uuid;
  v_waktu := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  if v_id is null or v_metode is null then
    raise exception 'Data penjualan tidak lengkap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  select * into v_ada from public.penjualan where id = v_id;
  if found then
    if v_ada.outlet_id <> v_outlet then
      raise exception 'Penjualan tidak ditemukan' using errcode = '22023';
    end if;
    return jsonb_build_object('id', v_ada.id, 'nomor', v_ada.nomor, 'total', v_ada.total, 'kembalian', v_ada.kembalian,
      'waktu', v_ada.waktu, 'ulang', true, 'batal', v_ada.void_at is not null, 'kode_struk', v_ada.kode_struk);
  end if;
  if v_kode_struk is null or v_kode_struk !~ '^[0-9A-Z]{6}$' then
    raise exception 'Kode struk tidak sah' using errcode = '22023';
  end if;
  v_shift := public._shift_dari_perangkat((p ->> 'shift_id')::uuid);
  select * into s from public.shift where id = v_shift for share;
  if not found or s.outlet_id <> v_outlet then
    raise exception 'Shift belum dibuka' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'item') is distinct from 'array' or jsonb_array_length(p -> 'item') = 0 then
    raise exception 'Penjualan minimal satu item' using errcode = '22023';
  end if;
  with i as (
    select menu_id, sum(qty)::integer as qty, bool_and(coalesce(qty between 1 and 999, false)) as sah
    from jsonb_to_recordset(p -> 'item') as x (menu_id uuid, qty integer)
    group by menu_id
  )
  select count(*), count(h.menu_id), coalesce(bool_and(i.sah and i.qty <= 999), false), coalesce(sum(h.harga * i.qty), 0)
  into v_minta, v_cocok, v_qty_sah, v_total
  from i
  left join public.menu m on m.id = i.menu_id and m.aktif
  left join public.harga_jual h on h.menu_id = m.id and h.outlet_id = v_outlet;
  if not v_qty_sah then
    raise exception 'Jumlah item tidak sah' using errcode = '22023';
  end if;
  if v_cocok <> v_minta then
    raise exception 'Menu tidak tersedia di outlet ini' using errcode = '22023';
  end if;
  if v_metode = 'cash' then
    if v_diterima is null or v_diterima < v_total then
      raise exception 'Uang diterima kurang dari total' using errcode = '22023';
    end if;
    v_kembalian := v_diterima - v_total;
  else
    v_diterima := null;
    v_kembalian := null;
  end if;

  -- Nomor resmi: urut kedatangan per outlet per hari WIB (hari dari jam kejadian).
  select kode into v_kode from public.outlets where id = v_outlet;
  insert into public.nomor_harian (outlet_id, tanggal, terakhir)
  values (v_outlet, public.tanggal_wib(v_waktu), 1)
  on conflict (outlet_id, tanggal) do update set terakhir = public.nomor_harian.terakhir + 1
  returning terakhir into v_urut;
  v_nomor := v_kode || '-' || to_char(v_waktu at time zone interval '+07:00', 'YYMMDD') || '-' || lpad(v_urut::text, greatest(3, length(v_urut::text)), '0');

  -- Kunci stok outlet: persetujuan stok awal/opname yang bersamaan tidak bisa melewatkan penjualan ini.
  perform public._kunci_stok(v_outlet);
  insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, metode, total, diterima, kembalian,
    kode_struk, nomor_sementara, perangkat_id, tanpa_stok)
  values (v_id, v_outlet, s.id, auth.uid(), v_nomor, v_waktu, v_metode, v_total, v_diterima, v_kembalian,
    v_kode_struk, v_sementara, public._perangkat_dikenal(v_perangkat), coalesce(public._dihitung_disetujui(v_outlet) >= v_waktu, false));

  insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty)
  select v_id, m.id, m.nama, h.harga, sum(x.qty)::integer
  from jsonb_to_recordset(p -> 'item') as x (menu_id uuid, qty integer)
  join public.menu m on m.id = x.menu_id
  join public.harga_jual h on h.menu_id = m.id and h.outlet_id = v_outlet
  group by m.id, m.nama, h.harga;

  if s.ditutup_at is not null and not s.tutup_tertunda then
    update public.shift set jual_setelah_tutup = jual_setelah_tutup + 1 where id = s.id;
  end if;

  return jsonb_build_object('id', v_id, 'nomor', v_nomor, 'total', v_total, 'kembalian', v_kembalian,
    'waktu', v_waktu, 'ulang', false, 'batal', false, 'kode_struk', v_kode_struk);
end
$$;

create function public.catat_rusak_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid;
  v_alasan public.alasan_rusak;
  v_catatan text;
  v_waktu timestamptz;
  v_tanpa boolean;
begin
  perform public._cek_akses_outlet(v_outlet);
  v_id := (p ->> 'id')::uuid;
  v_alasan := (p ->> 'alasan')::public.alasan_rusak;
  v_catatan := nullif(trim(coalesce(p ->> 'catatan', '')), '');
  v_waktu := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  if v_id is null or v_alasan is null then
    raise exception 'Data rusak tidak lengkap' using errcode = '22023';
  end if;
  perform public._kunci_stok(v_outlet);
  if exists (select 1 from public.rusak where id = v_id) then
    if not exists (select 1 from public.rusak where id = v_id and outlet_id = v_outlet) then
      raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
    end if;
    return v_id;
  end if;
  if v_alasan = 'lainnya' and (v_catatan is null or length(v_catatan) < 3) then
    raise exception 'Catatan wajib diisi untuk alasan lainnya (3–200 karakter)' using errcode = '22023';
  end if;
  if v_catatan is not null and length(v_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._cek_isian_positif(p -> 'item');
  v_tanpa := coalesce(public._dihitung_disetujui(v_outlet) >= v_waktu, false);
  insert into public.rusak (id, outlet_id, waktu, alasan, catatan, dicatat_oleh, perangkat_id, tanpa_stok)
  values (v_id, v_outlet, v_waktu, v_alasan, v_catatan, auth.uid(), public._perangkat_dikenal((p ->> 'perangkat_id')::uuid), v_tanpa);
  insert into public.rusak_item (rusak_id, bahan_id, qty)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric);
  if not v_tanpa then
    insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, rusak_id)
    select v_outlet, i.bahan_id, -i.qty, 'rusak', v_waktu, auth.uid(), v_id from public.rusak_item i where i.rusak_id = v_id;
  end if;
  return v_id;
end
$$;

create function public.lapor_kejadian_diabaikan(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_alasan text := trim(coalesce(p ->> 'alasan', ''));
begin
  perform public._cek_akses_outlet(v_outlet);
  if length(v_alasan) < 3 or length(v_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  insert into public.kejadian_diabaikan (id, outlet_id, perangkat_id, jenis, data, alasan_tolak, alasan, oleh)
  values ((p ->> 'id')::uuid, v_outlet, public._perangkat_dikenal((p ->> 'perangkat_id')::uuid), left(coalesce(p ->> 'jenis', '-'), 30),
    coalesce(p -> 'data', '{}'::jsonb), left(p ->> 'alasan_tolak', 500), v_alasan, auth.uid())
  on conflict (id) do nothing;
end
$$;

revoke execute on function public.lapor_kejadian_diabaikan(jsonb) from public, anon;
grant execute on function public.lapor_kejadian_diabaikan(jsonb) to authenticated;
revoke execute on function public.catat_penjualan_offline(jsonb) from public, anon;
revoke execute on function public.catat_rusak_offline(jsonb) from public, anon;
grant execute on function public.catat_penjualan_offline(jsonb) to authenticated;
grant execute on function public.catat_rusak_offline(jsonb) to authenticated;
