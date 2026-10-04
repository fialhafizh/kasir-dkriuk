-- Fungsi kasir. security definer karena tabel transaksi tidak bisa ditulis langsung;
-- setiap fungsi memeriksa hak akses pemanggil sendiri.

create function public._cek_akses_outlet(p_outlet uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  -- coalesce: kasir nonaktif → my_outlet_id() NULL → perbandingan NULL tidak boleh lolos.
  if p_outlet is null or not (public.is_admin() or coalesce(public.my_outlet_id() = p_outlet, false)) then
    raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
  end if;
end
$$;

create function public.buka_shift(p_outlet uuid, p_modal integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public._cek_akses_outlet(p_outlet);
  if p_modal is null or p_modal < 0 or p_modal > 100000000 then
    raise exception 'Modal kembalian tidak sah' using errcode = '22023';
  end if;
  insert into public.shift (outlet_id, dibuka_oleh, modal)
  values (p_outlet, auth.uid(), p_modal)
  on conflict (outlet_id) where ditutup_at is null do nothing;
  select id into v_id from public.shift where outlet_id = p_outlet and ditutup_at is null;
  return v_id;
end
$$;

create function public.catat_penjualan(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_metode public.metode_bayar := (p ->> 'metode')::public.metode_bayar;
  v_diterima integer := (p ->> 'diterima')::integer;
  v_waktu timestamptz := coalesce((p ->> 'waktu')::timestamptz, now());
  v_ada public.penjualan;
  v_shift uuid;
  v_minta integer;
  v_cocok integer;
  v_qty_sah boolean;
  v_total integer;
  v_kembalian integer;
  v_kode text;
  v_urut integer;
  v_nomor text;
begin
  if v_id is null or v_outlet is null or v_metode is null then
    raise exception 'Data penjualan tidak lengkap' using errcode = '22023';
  end if;
  perform public._cek_akses_outlet(v_outlet);
  -- Kiriman ulang bersamaan dengan id sama menunggu yang pertama selesai.
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));

  -- Idempoten: ID dibuat di perangkat; kiriman ulang mengembalikan hasil pertama.
  select * into v_ada from public.penjualan where id = v_id;
  if found then
    if v_ada.outlet_id <> v_outlet then
      raise exception 'Penjualan tidak ditemukan' using errcode = '22023';
    end if;
    return jsonb_build_object('id', v_ada.id, 'nomor', v_ada.nomor, 'total', v_ada.total,
      'kembalian', v_ada.kembalian, 'waktu', v_ada.waktu, 'ulang', true, 'batal', v_ada.void_at is not null);
  end if;

  -- Waktu dari perangkat dipakai bila wajar (persiapan offline), selain itu waktu server.
  if v_waktu > now() + interval '5 minutes' or v_waktu < now() - interval '7 days' then
    v_waktu := now();
  end if;

  -- Kunci baris shift agar tidak bisa ditutup bersamaan dengan penjualan ini.
  select id into v_shift from public.shift where outlet_id = v_outlet and ditutup_at is null for share;
  if v_shift is null then
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

  select kode into v_kode from public.outlets where id = v_outlet;
  insert into public.nomor_harian (outlet_id, tanggal, terakhir)
  values (v_outlet, public.tanggal_wib(v_waktu), 1)
  on conflict (outlet_id, tanggal) do update set terakhir = public.nomor_harian.terakhir + 1
  returning terakhir into v_urut;
  v_nomor := v_kode || '-' || to_char(v_waktu at time zone interval '+07:00', 'YYMMDD') || '-' || lpad(v_urut::text, greatest(3, length(v_urut::text)), '0');

  insert into public.penjualan (id, outlet_id, shift_id, kasir_id, nomor, waktu, metode, total, diterima, kembalian)
  values (v_id, v_outlet, v_shift, auth.uid(), v_nomor, v_waktu, v_metode, v_total, v_diterima, v_kembalian);

  insert into public.penjualan_item (penjualan_id, menu_id, nama, harga, qty)
  select v_id, m.id, m.nama, h.harga, sum(x.qty)::integer
  from jsonb_to_recordset(p -> 'item') as x (menu_id uuid, qty integer)
  join public.menu m on m.id = x.menu_id
  join public.harga_jual h on h.menu_id = m.id and h.outlet_id = v_outlet
  group by m.id, m.nama, h.harga;

  return jsonb_build_object('id', v_id, 'nomor', v_nomor, 'total', v_total,
    'kembalian', v_kembalian, 'waktu', v_waktu, 'ulang', false, 'batal', false);
end
$$;

create function public.void_penjualan(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.penjualan;
  v_tutup timestamptz;
begin
  select * into v from public.penjualan where id = p_id for update;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = v.outlet_id, false)) then
    raise exception 'Penjualan tidak ditemukan' using errcode = '22023';
  end if;
  if v.void_at is not null then
    raise exception 'Penjualan sudah dibatalkan' using errcode = '22023';
  end if;
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  select ditutup_at into v_tutup from public.shift where id = v.shift_id for share;
  if v_tutup is not null and not public.is_admin() then
    raise exception 'Penjualan dari shift yang sudah ditutup hanya bisa dibatalkan admin' using errcode = '42501';
  end if;
  update public.penjualan
  set void_at = now(), void_oleh = auth.uid(), void_alasan = trim(p_alasan)
  where id = p_id;
end
$$;

create function public.ringkasan_shift(p_shift uuid) returns jsonb
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
    'selisih', case when s.uang_fisik is null then null else s.uang_fisik - (s.modal + v_cash) end
  );
end
$$;

create function public.tutup_shift(p_shift uuid, p_uang_fisik integer, p_catatan text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.shift;
begin
  select * into s from public.shift where id = p_shift for update;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = s.outlet_id, false)) then
    raise exception 'Shift tidak ditemukan' using errcode = '22023';
  end if;
  if s.ditutup_at is not null then
    raise exception 'Shift sudah ditutup' using errcode = '22023';
  end if;
  if p_uang_fisik is null or p_uang_fisik < 0 or p_uang_fisik > 1000000000 then
    raise exception 'Jumlah uang di laci tidak sah' using errcode = '22023';
  end if;
  update public.shift
  set ditutup_at = now(), ditutup_oleh = auth.uid(), uang_fisik = p_uang_fisik,
      catatan = nullif(trim(coalesce(p_catatan, '')), '')
  where id = p_shift;
  return public.ringkasan_shift(p_shift);
end
$$;

revoke execute on function public._cek_akses_outlet(uuid) from public, anon, authenticated;
revoke execute on function public.buka_shift(uuid, integer) from public, anon;
revoke execute on function public.catat_penjualan(jsonb) from public, anon;
revoke execute on function public.void_penjualan(uuid, text) from public, anon;
revoke execute on function public.ringkasan_shift(uuid) from public, anon;
revoke execute on function public.tutup_shift(uuid, integer, text) from public, anon;
grant execute on function public.buka_shift(uuid, integer) to authenticated;
grant execute on function public.catat_penjualan(jsonb) to authenticated;
grant execute on function public.void_penjualan(uuid, text) to authenticated;
grant execute on function public.ringkasan_shift(uuid) to authenticated;
grant execute on function public.tutup_shift(uuid, integer, text) to authenticated;
