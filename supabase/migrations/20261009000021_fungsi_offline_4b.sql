-- Tahap 4b: fungsi antrean offline untuk batal, transfer, opname & stok awal. Idempoten per id dari perangkat
-- dan memakai jam kejadian (dibatasi _waktu_perangkat).

-- Batal transaksi. Sudah dibatalkan (kiriman ulang / perangkat lain) = berhasil.
create function public.void_penjualan_offline(p jsonb) returns jsonb
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
      void_tanpa_stok = coalesce(public._dihitung_disetujui(v.outlet_id) >= v_waktu, false)
  where id = v_id;
  return jsonb_build_object('id', v.id, 'nomor', v.nomor, 'sudah_dibatalkan', false);
end
$$;

-- Ringkasan + tanda pembatalan yang sampai di server setelah toko ditutup.
create or replace function public.ringkasan_shift(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.shift;
  v_metode jsonb;
  v_jumlah integer;
  v_void integer;
  v_total integer;
  v_cash integer;
  v_batal_telat integer;
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
         coalesce(sum(total) filter (where void_at is null and metode = 'cash'), 0),
         -- Dibandingkan dengan jam server (jam tutup bisa jam perangkat).
         count(*) filter (where not s.tutup_tertunda and void_dicatat_at > s.ditutup_dicatat_at)
  into v_jumlah, v_void, v_total, v_cash, v_batal_telat
  from public.penjualan where shift_id = p_shift;
  return jsonb_build_object(
    'shift_id', s.id, 'outlet_id', s.outlet_id, 'modal', s.modal, 'dibuka_at', s.dibuka_at, 'ditutup_at', s.ditutup_at,
    'jumlah_transaksi', v_jumlah, 'jumlah_void', v_void, 'total', v_total, 'per_metode', v_metode,
    'cash_seharusnya', s.modal + v_cash,
    'uang_fisik', case when s.tutup_tertunda then null else s.uang_fisik end,
    'selisih', case when s.uang_fisik is null or s.tutup_tertunda then null else s.uang_fisik - (s.modal + v_cash) end,
    'digabung', s.digabung, 'jual_setelah_tutup', s.jual_setelah_tutup, 'dibuka_lagi_setelah', s.dibuka_lagi_setelah,
    'tutup_tertunda', s.tutup_tertunda, 'batal_setelah_tutup', v_batal_telat
  );
end
$$;

-- Isi terima transfer dipindah ke sini supaya versi online (jam server) & offline (jam perangkat) sama persis.
create function public._terima_transfer(p_id uuid, p_item jsonb, p_waktu timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer;
  v_nama text;
  v_waktu timestamptz;
begin
  select * into t from public.transfer where id = p_id;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = t.ke_outlet_id, false)) then
    raise exception 'Transfer tidak ditemukan' using errcode = '22023';
  end if;
  -- Kunci kedua outlet dalam urutan tetap (tidak saling menunggu), baru kunci baris transfer.
  perform public._kunci_stok(least(t.dari_outlet_id, t.ke_outlet_id));
  perform public._kunci_stok(greatest(t.dari_outlet_id, t.ke_outlet_id));
  select * into t from public.transfer where id = p_id for update;
  if t.status = 'diterima' then
    raise exception 'Transfer sudah diterima' using errcode = '22023';
  end if;
  if t.status = 'dibatalkan' then
    raise exception 'Transfer sudah dibatalkan oleh pengirim' using errcode = '22023';
  end if;
  perform public._cek_isian_positif(p_item);
  if exists (
    select 1
    from (select bahan_id, qty from public.transfer_item where transfer_id = p_id) a
    full join (select x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric)) b on a.bahan_id = b.bahan_id
    -- Bandingkan dengan pembulatan yang sama seperti saat disimpan (4 desimal).
    where a.bahan_id is null or b.bahan_id is null or a.qty <> round(b.qty, 4)
  ) then
    select nama into v_nama from public.outlets where id = t.dari_outlet_id;
    raise exception 'Ada perbedaan jumlah. Silakan hubungi outlet pengirim (%)', v_nama using errcode = '22023';
  end if;
  -- Barang tidak mungkin diterima sebelum dikirim (jam perangkat bisa meleset).
  v_waktu := greatest(p_waktu, t.dikirim_at);
  update public.transfer set status = 'diterima', diterima_at = v_waktu, diterima_oleh = auth.uid() where id = p_id;
  perform public._gerakan_transfer(t, v_waktu, true);
end
$$;

-- Buku besar transfer (Tahap 4b): barang keluar pada jam DIKIRIM (saat itu fisiknya pergi), masuk kembali/ke
-- tujuan pada jam diterima/dibatalkan. Baris yang jamnya ≤ hitungan fisik yang disetujui tidak ditulis
-- (hitungan sudah mencerminkannya) — aturan yang sama dengan penjualan offline. Hitungan yang masih menunggu
-- otomatis memperhitungkan baris ini saat disetujui.
create function public._gerakan_transfer(t public.transfer, p_waktu timestamptz, p_diterima boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tujuan uuid := case when p_diterima then t.ke_outlet_id else t.dari_outlet_id end;
begin
  if not coalesce(public._dihitung_disetujui(t.dari_outlet_id) >= t.dikirim_at, false) then
    insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, transfer_id)
    select t.dari_outlet_id, i.bahan_id, -i.qty, 'transfer_keluar'::public.jenis_gerakan, t.dikirim_at, auth.uid(), t.id
    from public.transfer_item i where i.transfer_id = t.id;
  end if;
  -- Dibatalkan: barang kembali ke outlet pengirim (dicatat sebagai masuk dari transfer itu).
  if not coalesce(public._dihitung_disetujui(v_tujuan) >= p_waktu, false) then
    insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, transfer_id)
    select v_tujuan, i.bahan_id, i.qty, 'transfer_masuk'::public.jenis_gerakan, p_waktu, auth.uid(), t.id
    from public.transfer_item i where i.transfer_id = t.id;
  end if;
end
$$;

create function public._batal_transfer(p_id uuid, p_alasan text, p_waktu timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer;
  v_waktu timestamptz;
begin
  select * into t from public.transfer where id = p_id;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = t.dari_outlet_id, false)) then
    raise exception 'Transfer tidak ditemukan' using errcode = '22023';
  end if;
  -- Kunci stok pengirim dulu, baru baris transfer (urutan sama dengan terima).
  perform public._kunci_stok(t.dari_outlet_id);
  t := public._transfer_milik_pengirim(p_id);
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  v_waktu := greatest(p_waktu, t.dikirim_at);
  update public.transfer set status = 'dibatalkan', batal_at = v_waktu, batal_oleh = auth.uid(), batal_alasan = trim(p_alasan)
  where id = t.id;
  -- Keluar (jam kirim) lalu kembali (jam batal): bersih nol, tetapi hitungan fisik di antaranya tetap benar.
  perform public._gerakan_transfer(t, v_waktu, false);
end
$$;

create or replace function public.batal_transfer(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._batal_transfer(p_id, p_alasan, now());
end
$$;

create or replace function public.terima_transfer(p_id uuid, p_item jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._terima_transfer(p_id, p_item, now());
end
$$;

create function public.terima_transfer_offline(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'transfer_id')::uuid;
begin
  -- Kiriman ulang setelah jawaban hilang: sudah diterima = selesai.
  if exists (select 1 from public.transfer where id = v_id and status = 'diterima'
             and (public.is_admin() or coalesce(public.my_outlet_id() = ke_outlet_id, false))) then
    return;
  end if;
  perform public._terima_transfer(v_id, p -> 'item', public._waktu_perangkat((p ->> 'waktu')::timestamptz));
end
$$;

create function public.kirim_transfer_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_baru boolean := not exists (select 1 from public.transfer where id = (p ->> 'id')::uuid);
  v_id uuid;
begin
  v_id := public.kirim_transfer(p);
  if v_baru then
    update public.transfer set dikirim_at = public._waktu_perangkat((p ->> 'waktu')::timestamptz) where id = v_id;
  end if;
  return v_id;
end
$$;

create function public.batal_transfer_offline(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'transfer_id')::uuid;
begin
  if exists (select 1 from public.transfer where id = v_id and status = 'dibatalkan'
             and (public.is_admin() or coalesce(public.my_outlet_id() = dari_outlet_id, false))) then
    return;
  end if;
  perform public._batal_transfer(v_id, p ->> 'alasan', public._waktu_perangkat((p ->> 'waktu')::timestamptz));
end
$$;

-- Ubah kiriman. Kiriman ulang setelah jawaban hilang (lalu penerima sudah menerima) = selesai bila isinya sama.
create function public.ubah_transfer_offline(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'transfer_id')::uuid;
begin
  if exists (select 1 from public.transfer t where t.id = v_id and t.status <> 'dikirim'
             and (public.is_admin() or coalesce(public.my_outlet_id() = t.dari_outlet_id, false)))
     and jsonb_typeof(p -> 'item') = 'array'
     and not exists (
       select 1
       from (select bahan_id, qty from public.transfer_item where transfer_id = v_id) a
       full join (select x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric)) b on a.bahan_id = b.bahan_id
       where a.bahan_id is null or b.bahan_id is null or a.qty <> round(b.qty, 4)) then
    return;
  end if;
  perform public.ubah_transfer(v_id, p -> 'item', p ->> 'catatan');
  update public.transfer set diubah_at = public._waktu_perangkat((p ->> 'waktu')::timestamptz) where id = v_id;
end
$$;

-- Opname yang dihitung di perangkat: berlaku pada jam kasir menghitung.
create function public.ajukan_opname_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid := (p ->> 'id')::uuid;
  v_waktu timestamptz := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
begin
  perform public._cek_akses_outlet(v_outlet);
  if v_id is null then
    raise exception 'Data opname tidak lengkap' using errcode = '22023';
  end if;
  perform public._kunci_stok(v_outlet);
  if exists (select 1 from public.opname where id = v_id) then
    if not exists (select 1 from public.opname where id = v_id and outlet_id = v_outlet) then
      raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
    end if;
    return v_id;
  end if;
  if not exists (select 1 from public.stok_awal where outlet_id = v_outlet and status = 'disetujui') then
    raise exception 'Opname butuh stok awal yang sudah disetujui' using errcode = '22023';
  end if;
  if exists (select 1 from public.opname where outlet_id = v_outlet and status = 'diajukan') then
    raise exception 'Opname outlet ini masih menunggu persetujuan admin' using errcode = '22023';
  end if;
  if exists (select 1 from public.transfer where status = 'dikirim' and (dari_outlet_id = v_outlet or ke_outlet_id = v_outlet)) then
    raise exception 'Selesaikan kiriman/penerimaan dulu sebelum opname' using errcode = '22023';
  end if;
  if public._dihitung_terakhir(v_outlet) >= v_waktu then
    raise exception 'Opname ini lebih lama dari hitungan stok terakhir; hitung ulang' using errcode = '22023';
  end if;
  perform public._cek_isian_stok(p -> 'item');
  insert into public.opname (id, outlet_id, diajukan_oleh, dihitung_at) values (v_id, v_outlet, auth.uid(), v_waktu);
  insert into public.opname_item (opname_id, bahan_id, qty_hitung)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric);
  return v_id;
end
$$;

create function public.ajukan_stok_awal_offline(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid := (p ->> 'outlet_id')::uuid;
  v_id uuid := (p ->> 'id')::uuid;
  v_waktu timestamptz := public._waktu_perangkat((p ->> 'waktu')::timestamptz);
begin
  perform public._cek_akses_outlet(v_outlet);
  if v_id is null then
    raise exception 'Data stok awal tidak lengkap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stok_awal:' || v_outlet::text, 0));
  if exists (select 1 from public.stok_awal where id = v_id) then
    if not exists (select 1 from public.stok_awal where id = v_id and outlet_id = v_outlet) then
      raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
    end if;
    return v_id;
  end if;
  if exists (select 1 from public.stok_awal where outlet_id = v_outlet and status = 'disetujui') then
    raise exception 'Stok awal outlet ini sudah disetujui; koreksi berikutnya lewat opname' using errcode = '22023';
  end if;
  if exists (select 1 from public.stok_awal where outlet_id = v_outlet and status = 'diajukan') then
    raise exception 'Stok awal outlet ini masih menunggu persetujuan admin' using errcode = '22023';
  end if;
  perform public._cek_isian_stok(p -> 'item');
  insert into public.stok_awal (id, outlet_id, diajukan_oleh, dihitung_at) values (v_id, v_outlet, auth.uid(), v_waktu);
  insert into public.stok_awal_item (stok_awal_id, bahan_id, qty_hitung)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric);
  return v_id;
end
$$;

revoke execute on function public._terima_transfer(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public._batal_transfer(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public._gerakan_transfer(public.transfer, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.void_penjualan_offline(jsonb) from public, anon;
revoke execute on function public.terima_transfer_offline(jsonb) from public, anon;
revoke execute on function public.kirim_transfer_offline(jsonb) from public, anon;
revoke execute on function public.batal_transfer_offline(jsonb) from public, anon;
revoke execute on function public.ubah_transfer_offline(jsonb) from public, anon;
revoke execute on function public.ajukan_opname_offline(jsonb) from public, anon;
revoke execute on function public.ajukan_stok_awal_offline(jsonb) from public, anon;
grant execute on function public.void_penjualan_offline(jsonb) to authenticated;
grant execute on function public.terima_transfer_offline(jsonb) to authenticated;
grant execute on function public.kirim_transfer_offline(jsonb) to authenticated;
grant execute on function public.batal_transfer_offline(jsonb) to authenticated;
grant execute on function public.ubah_transfer_offline(jsonb) to authenticated;
grant execute on function public.ajukan_opname_offline(jsonb) to authenticated;
grant execute on function public.ajukan_stok_awal_offline(jsonb) to authenticated;
