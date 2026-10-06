-- Tahap 5a: fungsi buku kas laci, pengeluaran, setoran, kas harian.

-- Saldo laci pada jam p_jam = jangkar terakhir ≤ p_jam (uang laci awal / hitungan tutup toko, kecuali shift
-- p_kecuali) + gerakan dengan jam sesudah jangkar s.d. p_jam. Gerakan yang jamnya ≤ jangkar sudah termasuk
-- uang yang dihitung, jadi data offline yang telat hanya mengubah selisih shift-nya, bukan saldo sesudahnya.
create function public._saldo_laci(p_outlet uuid, p_jam timestamptz, p_kecuali uuid default null) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_awal timestamptz;
  v_t timestamptz;
  v_uang bigint;
begin
  select waktu, jumlah into v_t, v_uang from public.laci_awal where outlet_id = p_outlet;
  if not found or v_t > p_jam then
    return 0;
  end if;
  v_awal := v_t;
  -- Hitungan tutup toko sejak uang laci awal (shift sebelum 5a bukan jangkar).
  select x.t, x.uang into v_t, v_uang from (
    select v_awal as t, v_uang as uang, 0 as ord, null::uuid as id
    union all
    select ditutup_at, uang_fisik::bigint, 1, id from public.shift
    where outlet_id = p_outlet and ditutup_at is not null and not tutup_tertunda and id is distinct from p_kecuali
      and ditutup_at >= v_awal and ditutup_at <= p_jam
  ) x
  order by x.t desc, x.ord desc, x.id desc
  limit 1;
  return v_uang
    + coalesce((select sum(total) from public.penjualan
                where outlet_id = p_outlet and metode = 'cash' and not void_koreksi and waktu > v_t and waktu <= p_jam), 0)
    - coalesce((select sum(total) from public.penjualan
                where outlet_id = p_outlet and metode = 'cash' and not void_koreksi and void_at > v_t and void_at <= p_jam), 0)
    - coalesce((select sum(jumlah) from public.pengeluaran
                where outlet_id = p_outlet and sumber = 'laci' and batal_at is null and waktu > v_t and waktu <= p_jam), 0)
    - coalesce((select sum(jumlah) from public.setoran
                where outlet_id = p_outlet and batal_at is null and waktu > v_t and waktu <= p_jam), 0);
end
$$;

-- Uang seharusnya di laci saat shift ditutup (atau sekarang bila masih buka). Shift sebelum uang laci awal
-- (sebelum Tahap 5a) memakai rumus lama: modal + penjualan cash shift itu. Shift sementara (tertunda): null.
create function public._seharusnya_shift(s public.shift) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare
  v_awal timestamptz;
begin
  if s.tutup_tertunda then
    return null;
  end if;
  select waktu into v_awal from public.laci_awal where outlet_id = s.outlet_id;
  if v_awal is null or s.dibuka_at < v_awal then
    return s.modal + coalesce((select sum(total) from public.penjualan where shift_id = s.id and void_at is null and metode = 'cash'), 0);
  end if;
  return public._saldo_laci(s.outlet_id, coalesce(s.ditutup_at, now()), s.id);
end
$$;

-- Saldo laci sekarang + jam uang laci awal & jangkar terakhir (perangkat mengabaikan antrean yang jamnya ≤ jangkar,
-- persis seperti rumus server).
create function public.saldo_laci(p_outlet uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_awal timestamptz;
  v_jangkar timestamptz;
begin
  perform public._cek_akses_outlet(p_outlet);
  select waktu into v_awal from public.laci_awal where outlet_id = p_outlet;
  if v_awal is not null then
    select max(ditutup_at) into v_jangkar from public.shift
    where outlet_id = p_outlet and ditutup_at is not null and not tutup_tertunda and ditutup_at >= v_awal and ditutup_at <= now();
    v_jangkar := coalesce(v_jangkar, v_awal);
  end if;
  return jsonb_build_object(
    'saldo', public._saldo_laci(p_outlet, now()),
    'ada_awal', v_awal is not null,
    'awal_at', v_awal,
    'jangkar_at', v_jangkar
  );
end
$$;

-- Ringkasan shift: uang seharusnya = saldo laci saat tutup (sudah termasuk uang laci sebelumnya, pengeluaran, setoran).
create or replace function public.ringkasan_shift(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.shift;
  v_metode jsonb;
  v_jumlah integer;
  v_void integer;
  v_total integer;
  v_batal_telat integer;
  v_akhir timestamptz;
  v_seharusnya bigint;
  v_pengeluaran bigint;
  v_setoran bigint;
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
         count(*) filter (where not s.tutup_tertunda and void_dicatat_at > s.ditutup_dicatat_at)
  into v_jumlah, v_void, v_total, v_batal_telat
  from public.penjualan where shift_id = p_shift;
  v_akhir := coalesce(s.ditutup_at, now());
  v_seharusnya := public._seharusnya_shift(s);
  select coalesce(sum(jumlah), 0) into v_pengeluaran from public.pengeluaran
  where outlet_id = s.outlet_id and sumber = 'laci' and batal_at is null and waktu > s.dibuka_at and waktu <= v_akhir;
  select coalesce(sum(jumlah), 0) into v_setoran from public.setoran
  where outlet_id = s.outlet_id and batal_at is null and waktu > s.dibuka_at and waktu <= v_akhir;
  return jsonb_build_object(
    'shift_id', s.id, 'outlet_id', s.outlet_id, 'modal', s.modal, 'dibuka_at', s.dibuka_at, 'ditutup_at', s.ditutup_at,
    'jumlah_transaksi', v_jumlah, 'jumlah_void', v_void, 'total', v_total, 'per_metode', v_metode,
    'cash_seharusnya', v_seharusnya,
    'uang_fisik', case when s.tutup_tertunda then null else s.uang_fisik end,
    'selisih', case when s.uang_fisik is null or s.tutup_tertunda then null else s.uang_fisik - v_seharusnya end,
    'pengeluaran_laci', v_pengeluaran, 'setoran', v_setoran,
    'digabung', s.digabung, 'jual_setelah_tutup', s.jual_setelah_tutup, 'dibuka_lagi_setelah', s.dibuka_lagi_setelah,
    'tutup_tertunda', s.tutup_tertunda, 'batal_setelah_tutup', v_batal_telat
  );
end
$$;

-- Buka toko (pengganti versi 0019): uang laci awal sekali per outlet; modal shift = saldo laci saat buka.
create or replace function public.buka_shift_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid;
  v_modal integer;
  v_awal integer;
  v_perangkat uuid;
  v_waktu timestamptz;
  v_shift uuid;
  v_saldo integer;
begin
  perform public._cek_akses_outlet(v_outlet);
  v_id := (p ->> 'id')::uuid;
  v_modal := coalesce((p ->> 'modal')::integer, 0);
  v_awal := (p ->> 'laci_awal')::integer;
  v_perangkat := (p ->> 'perangkat_id')::uuid;
  v_waktu := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  if v_id is null then
    raise exception 'Data shift tidak lengkap' using errcode = '22023';
  end if;
  if v_modal < 0 or v_modal > 100000000 then
    raise exception 'Modal kembalian tidak sah' using errcode = '22023';
  end if;
  if v_awal is not null and (v_awal < 0 or v_awal > 100000000) then
    raise exception 'Uang laci awal tidak sah' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('shift:' || v_outlet::text, 0));
  select sp.shift_id into v_shift from public.shift_perangkat sp join public.shift s on s.id = sp.shift_id
  where sp.id = v_id and s.outlet_id = v_outlet;
  if found then
    return v_shift;
  end if;
  -- Pertama kali outlet ini buka: uang laci awal (perangkat lama tanpa isian ini → modal yang diketik).
  insert into public.laci_awal (outlet_id, jumlah, waktu, oleh)
  values (v_outlet, coalesce(v_awal, v_modal), v_waktu, auth.uid())
  on conflict (outlet_id) do nothing;
  v_perangkat := public._perangkat_dikenal(v_perangkat);
  v_saldo := least(greatest(public._saldo_laci(v_outlet, v_waktu), 0), 100000000);
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
      insert into public.shift (id, outlet_id, dibuka_oleh, modal, dibuka_at, ditutup_at, ditutup_oleh, uang_fisik, tutup_tertunda)
      values (v_id, v_outlet, auth.uid(), v_saldo, v_waktu, v_waktu, auth.uid(), 0, true);
    else
      -- Outlet nonaktif tidak bisa buka toko baru (data lama dari perangkat yang telat sinkron tetap diterima).
      if not exists (select 1 from public.outlets where id = v_outlet and aktif) then
        raise exception 'Outlet ini nonaktif' using errcode = '22023';
      end if;
      insert into public.shift (id, outlet_id, dibuka_oleh, modal, dibuka_at, dibuka_lagi_setelah)
      values (v_id, v_outlet, auth.uid(), v_saldo, v_waktu,
        (select max(ditutup_at) from public.shift
         where outlet_id = v_outlet and public.tanggal_wib(dibuka_at) = public.tanggal_wib(v_waktu) and ditutup_at < v_waktu));
    end if;
    v_shift := v_id;
  end if;
  insert into public.shift_perangkat (id, shift_id, perangkat_id, modal, dibuka_at) values (v_id, v_shift, v_perangkat, v_modal, v_waktu);
  return v_shift;
end
$$;

-- Buka toko versi online lama (Tahap 2): uang laci awal dari modal bila outlet belum punya.
create or replace function public.buka_shift(p_outlet uuid, p_modal integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public._cek_akses_outlet(p_outlet);
  if p_modal is null or p_modal < 0 or p_modal > 100000000 then
    raise exception 'Modal kembalian tidak sah' using errcode = '22023';
  end if;
  if not exists (select 1 from public.outlets where id = p_outlet and aktif) then
    raise exception 'Outlet ini nonaktif' using errcode = '22023';
  end if;
  insert into public.laci_awal (outlet_id, jumlah, waktu, oleh) values (p_outlet, p_modal, now(), auth.uid())
  on conflict (outlet_id) do nothing;
  insert into public.shift (outlet_id, dibuka_oleh, modal)
  values (p_outlet, auth.uid(), least(greatest(public._saldo_laci(p_outlet, now()), 0), 100000000))
  on conflict (outlet_id) where ditutup_at is null do nothing;
  select id into v_id from public.shift where outlet_id = p_outlet and ditutup_at is null;
  return v_id;
end
$$;

revoke execute on function public._saldo_laci(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public._seharusnya_shift(public.shift) from public, anon, authenticated;
revoke execute on function public.saldo_laci(uuid) from public, anon;
grant execute on function public.saldo_laci(uuid) to authenticated;

-- ===== Pengeluaran & setoran =====

create function public._wajib_admin_keuangan() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Hanya admin yang boleh mengelola keuangan' using errcode = '42501';
  end if;
end
$$;

-- Isi pengeluaran (dipakai kasir & admin). Mengembalikan true bila id sudah ada (kiriman ulang).
create function public._simpan_pengeluaran(p jsonb, p_sumber text, p_waktu timestamptz, p_dari_antrean boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid := (p ->> 'id')::uuid;
  v_kategori uuid := (p ->> 'kategori_id')::uuid;
  v_jumlah integer := (p ->> 'jumlah')::integer;
  v_ket text := nullif(trim(coalesce(p ->> 'keterangan', '')), '');
  k public.kategori_pengeluaran;
begin
  if v_id is null or v_outlet is null then
    raise exception 'Data pengeluaran tidak lengkap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  if exists (select 1 from public.pengeluaran where id = v_id) then
    if not exists (select 1 from public.pengeluaran where id = v_id and outlet_id = v_outlet) then
      raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
    end if;
    return true;
  end if;
  select * into k from public.kategori_pengeluaran where id = v_kategori;
  -- Dari antrean perangkat: uangnya sudah keluar dari laci; kategori yang dinonaktifkan / dijadikan khusus admin
  -- sebelum kiriman ini sampai tetap diterima (kalau ditolak, laci kasir terlihat kurang padahal tidak).
  if not found or (not p_dari_antrean and (not k.aktif or (not k.untuk_kasir and not public.is_admin()))) then
    raise exception 'Kategori pengeluaran tidak dikenal atau nonaktif' using errcode = '22023';
  end if;
  if v_jumlah is null or v_jumlah < 1 or v_jumlah > 100000000 then
    raise exception 'Jumlah pengeluaran tidak sah' using errcode = '22023';
  end if;
  if k.wajib_keterangan and (v_ket is null or length(v_ket) < 3) then
    raise exception 'Keterangan wajib diisi untuk kategori ini (3–200 karakter)' using errcode = '22023';
  end if;
  if v_ket is not null and length(v_ket) > 200 then
    raise exception 'Keterangan paling banyak 200 karakter' using errcode = '22023';
  end if;
  insert into public.pengeluaran (id, outlet_id, sumber, kategori_id, jumlah, waktu, keterangan, dicatat_oleh, perangkat_id)
  values (v_id, v_outlet, p_sumber, v_kategori, v_jumlah, p_waktu, v_ket, auth.uid(), public._perangkat_dikenal((p ->> 'perangkat_id')::uuid));
  return false;
end
$$;

-- Kasir (dan admin di layar kasir): dibayar dari laci, jam kejadian di perangkat.
create function public.catat_pengeluaran_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform public._cek_akses_outlet((p ->> 'outlet_id')::uuid);
  perform public._simpan_pengeluaran(p, 'laci', public._waktu_perangkat((p ->> 'waktu')::timestamptz), true);
  return (p ->> 'id')::uuid;
end
$$;

-- Admin: sumber laci/luar; tanggal (pukul 12.00 WIB) atau jam sekarang.
create function public.catat_pengeluaran_admin(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_sumber text := coalesce(p ->> 'sumber', 'luar');
  v_tanggal date := (p ->> 'tanggal')::date;
begin
  perform public._wajib_admin_keuangan();
  if v_sumber not in ('laci', 'luar') then
    raise exception 'Sumber pengeluaran tidak sah' using errcode = '22023';
  end if;
  if not exists (select 1 from public.outlets where id = (p ->> 'outlet_id')::uuid) then
    raise exception 'Outlet tidak ditemukan' using errcode = '22023';
  end if;
  if v_tanggal is not null and (v_tanggal > public.tanggal_wib(now()) or v_tanggal < public.tanggal_wib(now()) - 400) then
    raise exception 'Tanggal pengeluaran tidak sah' using errcode = '22023';
  end if;
  -- Dari laci: uang keluar sekarang (tanggal lampau tidak boleh menyelip sebelum hitungan laci).
  perform public._simpan_pengeluaran(p, v_sumber,
    case when v_tanggal is null or v_sumber = 'laci' then now() else (v_tanggal::text || ' 12:00:00+07')::timestamptz end, false);
  return (p ->> 'id')::uuid;
end
$$;

-- Batal = koreksi catatan (pengeluaran dianggap tidak pernah ada di laci).
create function public.batal_pengeluaran(p_id uuid, p_alasan text) returns void
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
  update public.pengeluaran set batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan) where id = p_id;
end
$$;

create function public.catat_setoran_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid := (p ->> 'id')::uuid;
  v_jumlah integer := (p ->> 'jumlah')::integer;
  v_catatan text := nullif(trim(coalesce(p ->> 'catatan', '')), '');
begin
  perform public._cek_akses_outlet(v_outlet);
  if v_id is null then
    raise exception 'Data setoran tidak lengkap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  if exists (select 1 from public.setoran where id = v_id) then
    if not exists (select 1 from public.setoran where id = v_id and outlet_id = v_outlet) then
      raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
    end if;
    return v_id;
  end if;
  if v_jumlah is null or v_jumlah < 1 or v_jumlah > 100000000 then
    raise exception 'Jumlah setoran tidak sah' using errcode = '22023';
  end if;
  if v_catatan is not null and length(v_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  insert into public.setoran (id, outlet_id, jumlah, waktu, catatan, dicatat_oleh, perangkat_id)
  values (v_id, v_outlet, v_jumlah, public._waktu_perangkat((p ->> 'waktu')::timestamptz), v_catatan, auth.uid(),
    public._perangkat_dikenal((p ->> 'perangkat_id')::uuid));
  return v_id;
end
$$;

-- Owner menerima setoran; jumlah beda → catatan wajib (selisih setoran). Laci tidak berubah lagi.
create function public.terima_setoran(p_id uuid, p_jumlah integer, p_catatan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.setoran;
  v_catatan text := nullif(trim(coalesce(p_catatan, '')), '');
begin
  perform public._wajib_admin_keuangan();
  select * into v from public.setoran where id = p_id for update;
  if not found then
    raise exception 'Setoran tidak ditemukan' using errcode = '22023';
  end if;
  if v.batal_at is not null then
    raise exception 'Setoran sudah dibatalkan' using errcode = '22023';
  end if;
  if v.diterima_at is not null then
    raise exception 'Setoran sudah diterima' using errcode = '22023';
  end if;
  if p_jumlah is null or p_jumlah < 0 or p_jumlah > 100000000 then
    raise exception 'Jumlah setoran tidak sah' using errcode = '22023';
  end if;
  if p_jumlah <> v.jumlah and (v_catatan is null or length(v_catatan) < 3) then
    raise exception 'Catatan wajib diisi bila jumlah yang diterima berbeda (3–200 karakter)' using errcode = '22023';
  end if;
  if v_catatan is not null and length(v_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  update public.setoran set diterima_at = now(), diterima_oleh = auth.uid(), jumlah_diterima = p_jumlah, catatan_terima = v_catatan
  where id = p_id;
end
$$;

-- Batal setoran (tidak jadi diserahkan / salah catat) = koreksi catatan; hanya yang belum diterima.
create function public.batal_setoran(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.setoran;
begin
  perform public._wajib_admin_keuangan();
  select * into v from public.setoran where id = p_id for update;
  if not found then
    raise exception 'Setoran tidak ditemukan' using errcode = '22023';
  end if;
  if v.diterima_at is not null then
    raise exception 'Setoran yang sudah diterima tidak bisa dibatalkan' using errcode = '22023';
  end if;
  if v.batal_at is not null then
    raise exception 'Setoran sudah dibatalkan' using errcode = '22023';
  end if;
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  update public.setoran set batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan) where id = p_id;
end
$$;

create function public.simpan_kategori(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_nama text := trim(coalesce(p ->> 'nama', ''));
begin
  perform public._wajib_admin_keuangan();
  if length(v_nama) < 2 or length(v_nama) > 40 then
    raise exception 'Nama kategori 2–40 karakter' using errcode = '22023';
  end if;
  if exists (select 1 from public.kategori_pengeluaran where lower(nama) = lower(v_nama) and id is distinct from v_id) then
    raise exception 'Nama kategori sudah dipakai' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.kategori_pengeluaran (nama, untuk_kasir, wajib_keterangan, aktif)
    values (v_nama, coalesce((p ->> 'untuk_kasir')::boolean, false), coalesce((p ->> 'wajib_keterangan')::boolean, false), true)
    returning id into v_id;
  else
    update public.kategori_pengeluaran
    set nama = v_nama, untuk_kasir = coalesce((p ->> 'untuk_kasir')::boolean, untuk_kasir),
        wajib_keterangan = coalesce((p ->> 'wajib_keterangan')::boolean, wajib_keterangan),
        aktif = coalesce((p ->> 'aktif')::boolean, aktif)
    where id = v_id;
    if not found then
      raise exception 'Kategori tidak ditemukan' using errcode = '22023';
    end if;
  end if;
  return v_id;
end
$$;

-- ===== Batal penjualan oleh admin & kas harian =====

-- Pengganti versi 0009: admin membatalkan penjualan dari shift yang sudah ditutup = koreksi catatan (bukan uang keluar laci).
create or replace function public.void_penjualan(p_id uuid, p_alasan text) returns void
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
  select case when tutup_tertunda then null else ditutup_at end into v_tutup from public.shift where id = v.shift_id for share;
  if v_tutup is not null and not public.is_admin() then
    raise exception 'Penjualan dari shift yang sudah ditutup hanya bisa dibatalkan admin' using errcode = '42501';
  end if;
  update public.penjualan
  set void_at = now(), void_oleh = auth.uid(), void_alasan = trim(p_alasan), void_koreksi = v_tutup is not null
  where id = p_id;
end
$$;

-- Pengganti versi 0021: batal admin sesudah jam tutup = koreksi catatan.
create or replace function public.void_penjualan_offline(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'penjualan_id')::uuid;
  v_alasan text := trim(coalesce(p ->> 'alasan', ''));
  v_waktu timestamptz := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
  v public.penjualan;
  s public.shift;
begin
  select * into v from public.penjualan where id = v_id;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = v.outlet_id, false)) then
    raise exception 'Penjualan tidak ditemukan' using errcode = '22023';
  end if;
  -- Kunci stok dulu (urutan sama dengan persetujuan hitungan), baru baris penjualan. Baris shift tidak dikunci
  -- (catat_penjualan_offline memegang shift lalu meminta kunci stok).
  perform public._kunci_stok(v.outlet_id);
  select * into v from public.penjualan where id = v_id for update;
  if v.void_at is not null then
    return jsonb_build_object('id', v.id, 'nomor', v.nomor, 'sudah_dibatalkan', true);
  end if;
  if length(v_alasan) < 3 or length(v_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  v_waktu := greatest(v_waktu, v.waktu);
  select * into s from public.shift where id = v.shift_id;
  if s.ditutup_at is not null and not s.tutup_tertunda and v_waktu > s.ditutup_at and not public.is_admin() then
    raise exception 'Penjualan dari shift yang sudah ditutup hanya bisa dibatalkan admin' using errcode = '42501';
  end if;
  update public.penjualan
  set void_at = v_waktu, void_oleh = auth.uid(), void_alasan = v_alasan,
      -- Hanya admin yang bisa sampai di sini dengan jam sesudah tutup: koreksi catatan, bukan uang keluar laci.
      void_koreksi = s.ditutup_at is not null and not s.tutup_tertunda and v_waktu > s.ditutup_at,
      void_tanpa_stok = coalesce(public._dihitung_disetujui(v.outlet_id) >= v_waktu, false)
  where id = v_id;
  return jsonb_build_object('id', v.id, 'nomor', v.nomor, 'sudah_dibatalkan', false);
end
$$;

-- Catatan harian per outlet (tanggal WIB), maks 62 hari.
create function public.kas_harian(p_outlet uuid, p_dari date, p_sampai date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d date;
  v_awal timestamptz;
  v_akhir timestamptz;
  hasil jsonb := '[]'::jsonb;
  v_metode jsonb;
begin
  perform public._wajib_admin_keuangan();
  if p_outlet is null or p_dari is null or p_sampai is null or p_sampai < p_dari or p_sampai - p_dari > 61 then
    raise exception 'Rentang tanggal tidak sah (paling lama 62 hari)' using errcode = '22023';
  end if;
  for d in select generate_series(p_dari, p_sampai, interval '1 day')::date loop
    v_awal := (d::text || ' 00:00:00+07')::timestamptz;
    v_akhir := v_awal + interval '1 day' - interval '1 microsecond';
    select jsonb_object_agg(m.metode, jsonb_build_object('jumlah', coalesce(x.jumlah, 0), 'total', coalesce(x.total, 0)))
    into v_metode
    from unnest(enum_range(null::public.metode_bayar)) as m (metode)
    left join (
      select metode, count(*)::integer as jumlah, sum(total)::bigint as total from public.penjualan
      where outlet_id = p_outlet and void_at is null and waktu between v_awal and v_akhir group by metode
    ) x on x.metode = m.metode;
    hasil := hasil || jsonb_build_array(jsonb_build_object(
      'tanggal', d,
      'per_metode', v_metode,
      'total', (select coalesce(sum(total), 0) from public.penjualan where outlet_id = p_outlet and void_at is null and waktu between v_awal and v_akhir),
      'jumlah_batal', (select count(*) from public.penjualan where outlet_id = p_outlet and void_at is not null and waktu between v_awal and v_akhir),
      'pengeluaran_laci', (select coalesce(jsonb_agg(jsonb_build_object('kategori', k.nama, 'jumlah', x.jumlah) order by k.urutan), '[]'::jsonb)
        from (select kategori_id, sum(jumlah)::bigint as jumlah from public.pengeluaran
              where outlet_id = p_outlet and sumber = 'laci' and batal_at is null and waktu between v_awal and v_akhir group by kategori_id) x
        join public.kategori_pengeluaran k on k.id = x.kategori_id),
      'pengeluaran_luar', (select coalesce(jsonb_agg(jsonb_build_object('kategori', k.nama, 'jumlah', x.jumlah) order by k.urutan), '[]'::jsonb)
        from (select kategori_id, sum(jumlah)::bigint as jumlah from public.pengeluaran
              where outlet_id = p_outlet and sumber = 'luar' and batal_at is null and waktu between v_awal and v_akhir group by kategori_id) x
        join public.kategori_pengeluaran k on k.id = x.kategori_id),
      -- Barang masuk menurut tanggalnya; pembatalan sebagai koreksi pada tanggal batal (hari lampau tidak berubah diam-diam).
      'belanja_bahan', (select coalesce(sum(total), 0) from public.barang_masuk where outlet_id = p_outlet and tanggal = d)
                     - (select coalesce(sum(total), 0) from public.barang_masuk where outlet_id = p_outlet and batal_at between v_awal and v_akhir),
      'setoran', (select coalesce(sum(jumlah), 0) from public.setoran where outlet_id = p_outlet and batal_at is null and waktu between v_awal and v_akhir),
      'saldo_awal', public._saldo_laci(p_outlet, v_awal - interval '1 microsecond'),
      'saldo_akhir', public._saldo_laci(p_outlet, v_akhir),
      'selisih', (select coalesce(sum(s.uang_fisik - public._seharusnya_shift(s)), 0) from public.shift s
                  where s.outlet_id = p_outlet and not s.tutup_tertunda and s.ditutup_at between v_awal and v_akhir)
    ));
  end loop;
  return hasil;
end
$$;

revoke execute on function public._wajib_admin_keuangan() from public, anon, authenticated;
revoke execute on function public._simpan_pengeluaran(jsonb, text, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.catat_pengeluaran_offline(jsonb) from public, anon;
revoke execute on function public.catat_pengeluaran_admin(jsonb) from public, anon;
revoke execute on function public.batal_pengeluaran(uuid, text) from public, anon;
revoke execute on function public.catat_setoran_offline(jsonb) from public, anon;
revoke execute on function public.terima_setoran(uuid, integer, text) from public, anon;
revoke execute on function public.batal_setoran(uuid, text) from public, anon;
revoke execute on function public.simpan_kategori(jsonb) from public, anon;
revoke execute on function public.kas_harian(uuid, date, date) from public, anon;
grant execute on function public.catat_pengeluaran_offline(jsonb) to authenticated;
grant execute on function public.catat_pengeluaran_admin(jsonb) to authenticated;
grant execute on function public.batal_pengeluaran(uuid, text) to authenticated;
grant execute on function public.catat_setoran_offline(jsonb) to authenticated;
grant execute on function public.terima_setoran(uuid, integer, text) to authenticated;
grant execute on function public.batal_setoran(uuid, text) to authenticated;
grant execute on function public.simpan_kategori(jsonb) to authenticated;
grant execute on function public.kas_harian(uuid, date, date) to authenticated;
