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
  select shift_id into v_shift from public.shift_perangkat where id = v_id;
  if found then
    return v_shift;
  end if;
  -- Shift yang sedang berjalan saat perangkat ini membuka (hari WIB sama, belum ditutup saat itu) → gabung.
  select id into v_shift from public.shift
  where outlet_id = v_outlet and public.tanggal_wib(dibuka_at) = public.tanggal_wib(v_waktu)
    and (ditutup_at is null or ditutup_at >= v_waktu)
  order by dibuka_at limit 1;
  if v_shift is not null then
    update public.shift set digabung = true where id = v_shift;
  else
    if exists (select 1 from public.shift where outlet_id = v_outlet and ditutup_at is null) then
      raise exception 'Toko kemarin belum ditutup' using errcode = '22023';
    end if;
    insert into public.shift (id, outlet_id, dibuka_oleh, modal, dibuka_at, dibuka_lagi_setelah)
    values (v_id, v_outlet, auth.uid(), v_modal, v_waktu,
      (select max(ditutup_at) from public.shift
       where outlet_id = v_outlet and public.tanggal_wib(dibuka_at) = public.tanggal_wib(v_waktu) and ditutup_at < v_waktu));
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
    'cash_seharusnya', s.modal + v_cash, 'uang_fisik', s.uang_fisik,
    'selisih', case when s.uang_fisik is null then null else s.uang_fisik - (s.modal + v_cash) end,
    'digabung', s.digabung, 'jual_setelah_tutup', s.jual_setelah_tutup, 'dibuka_lagi_setelah', s.dibuka_lagi_setelah
  );
end
$$;

create function public.tutup_shift_offline(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_shift uuid := public._shift_dari_perangkat((p ->> 'shift_id')::uuid);
  v_uang integer := (p ->> 'uang_fisik')::integer;
  v_waktu timestamptz := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  s public.shift;
begin
  select * into s from public.shift where id = v_shift for update;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = s.outlet_id, false)) then
    raise exception 'Shift tidak ditemukan' using errcode = '22023';
  end if;
  if v_id is not null and s.tutup_id = v_id then
    return public.ringkasan_shift(s.id);
  end if;
  if s.ditutup_at is not null then
    raise exception 'Shift sudah ditutup' using errcode = '22023';
  end if;
  if v_id is null or v_uang is null or v_uang < 0 or v_uang > 1000000000 then
    raise exception 'Jumlah uang di laci tidak sah' using errcode = '22023';
  end if;
  update public.shift
  set ditutup_at = greatest(v_waktu, s.dibuka_at), ditutup_oleh = auth.uid(), uang_fisik = v_uang, tutup_id = v_id,
      catatan = nullif(trim(coalesce(p ->> 'catatan', '')), '')
  where id = s.id;
  return public.ringkasan_shift(s.id);
end
$$;

revoke execute on function public._shift_dari_perangkat(uuid) from public, anon, authenticated;
revoke execute on function public.daftar_perangkat(uuid, uuid) from public, anon;
revoke execute on function public.tandai_sinkron(uuid) from public, anon;
revoke execute on function public.buka_shift_offline(jsonb) from public, anon;
revoke execute on function public.tutup_shift_offline(jsonb) from public, anon;
grant execute on function public.daftar_perangkat(uuid, uuid) to authenticated;
grant execute on function public.tandai_sinkron(uuid) to authenticated;
grant execute on function public.buka_shift_offline(jsonb) to authenticated;
grant execute on function public.tutup_shift_offline(jsonb) to authenticated;
