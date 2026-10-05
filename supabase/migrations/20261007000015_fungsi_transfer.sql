-- Tahap 3b: transfer antar outlet. Tanpa persetujuan admin (keputusan owner). Stok pindah saat
-- penerima mengetik jumlah yang SAMA PERSIS dengan kiriman (hitung buta).

-- Pengirim (kasir outlet asal) atau admin; transfer orang lain disamarkan "tidak ditemukan".
create function public._transfer_milik_pengirim(p_id uuid) returns public.transfer
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer;
begin
  select * into t from public.transfer where id = p_id for update;
  if not found or not (public.is_admin() or coalesce(public.my_outlet_id() = t.dari_outlet_id, false)) then
    raise exception 'Transfer tidak ditemukan' using errcode = '22023';
  end if;
  if t.status <> 'dikirim' then
    raise exception 'Transfer sudah diterima atau dibatalkan' using errcode = '22023';
  end if;
  return t;
end
$$;

create function public.kirim_transfer(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_dari uuid := (p ->> 'dari_outlet_id')::uuid;
  v_ke uuid;
  v_id uuid;
  v_catatan text;
begin
  perform public._cek_akses_outlet(v_dari);
  v_id := (p ->> 'id')::uuid;
  v_ke := (p ->> 'ke_outlet_id')::uuid;
  v_catatan := nullif(trim(coalesce(p ->> 'catatan', '')), '');
  if v_id is null or v_ke is null then
    raise exception 'Data transfer tidak lengkap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  if exists (select 1 from public.transfer where id = v_id) then
    return v_id;
  end if;
  if v_ke = v_dari then
    raise exception 'Outlet tujuan harus berbeda dengan outlet pengirim' using errcode = '22023';
  end if;
  if not exists (select 1 from public.outlets where id = v_ke and aktif) then
    raise exception 'Outlet tujuan tidak ditemukan atau nonaktif' using errcode = '22023';
  end if;
  if v_catatan is not null and length(v_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._cek_isian_positif(p -> 'item');
  insert into public.transfer (id, dari_outlet_id, ke_outlet_id, catatan, dikirim_oleh)
  values (v_id, v_dari, v_ke, v_catatan, auth.uid());
  insert into public.transfer_item (transfer_id, bahan_id, qty)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p -> 'item') as x (bahan_id uuid, qty numeric);
  return v_id;
end
$$;

create function public.ubah_transfer(p_id uuid, p_item jsonb, p_catatan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer := public._transfer_milik_pengirim(p_id);
begin
  if p_catatan is not null and length(trim(p_catatan)) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._cek_isian_positif(p_item);
  delete from public.transfer_item where transfer_id = t.id;
  insert into public.transfer_item (transfer_id, bahan_id, qty)
  select t.id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  update public.transfer set diubah_at = now(), catatan = coalesce(nullif(trim(coalesce(p_catatan, '')), ''), catatan) where id = t.id;
end
$$;

create function public.batal_transfer(p_id uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer := public._transfer_milik_pengirim(p_id);
begin
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  update public.transfer set status = 'dibatalkan', batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan)
  where id = t.id;
end
$$;

create function public.terima_transfer(p_id uuid, p_item jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfer;
  v_nama text;
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
    where a.bahan_id is null or b.bahan_id is null or abs(a.qty - b.qty) > 0.0001
  ) then
    select nama into v_nama from public.outlets where id = t.dari_outlet_id;
    raise exception 'Ada perbedaan jumlah. Silakan hubungi outlet pengirim (%)', v_nama using errcode = '22023';
  end if;
  update public.transfer set status = 'diterima', diterima_at = now(), diterima_oleh = auth.uid() where id = p_id;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, transfer_id)
  select t.dari_outlet_id, i.bahan_id, -i.qty, 'transfer_keluar'::public.jenis_gerakan, now(), auth.uid(), p_id from public.transfer_item i where i.transfer_id = p_id
  union all
  select t.ke_outlet_id, i.bahan_id, i.qty, 'transfer_masuk'::public.jenis_gerakan, now(), auth.uid(), p_id from public.transfer_item i where i.transfer_id = p_id;
end
$$;

revoke execute on function public._transfer_milik_pengirim(uuid) from public, anon, authenticated;
revoke execute on function public.kirim_transfer(jsonb) from public, anon;
revoke execute on function public.ubah_transfer(uuid, jsonb, text) from public, anon;
revoke execute on function public.batal_transfer(uuid, text) from public, anon;
revoke execute on function public.terima_transfer(uuid, jsonb) from public, anon;
grant execute on function public.kirim_transfer(jsonb) to authenticated;
grant execute on function public.ubah_transfer(uuid, jsonb, text) to authenticated;
grant execute on function public.batal_transfer(uuid, text) to authenticated;
grant execute on function public.terima_transfer(uuid, jsonb) to authenticated;
