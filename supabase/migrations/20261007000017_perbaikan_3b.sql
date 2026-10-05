-- Perbaikan review akhir Tahap 3b: pesan yang menunjukkan jalan keluar saat terhalang hitungan yang
-- masih MENUNGGU persetujuan, dan kirim_transfer ikut kunci stok outlet pengirim.

-- Waktu hitungan (stok awal/opname) yang masih menunggu persetujuan; null bila tidak ada.
create function public._hitung_menunggu(p_outlet uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(t) from (
    select dihitung_at as t from public.stok_awal where outlet_id = p_outlet and status = 'diajukan'
    union all
    select dihitung_at from public.opname where outlet_id = p_outlet and status = 'diajukan'
  ) x
$$;

create or replace function public._jaga_barang_masuk() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_waktu timestamptz;
begin
  perform public._kunci_stok(new.outlet_id);
  if tg_op = 'INSERT' then
    v_waktu := new.waktu;
  elsif old.batal_at is null and new.batal_at is not null then
    v_waktu := old.waktu;
  else
    return new;
  end if;
  if public._hitung_menunggu(new.outlet_id) >= v_waktu then
    raise exception 'Barang masuk sebelum stok dihitung: masih ada hitungan stok (stok awal/opname) yang menunggu persetujuan. Tolak hitungan itu dulu bila barang masuk ini perlu dicatat/dibatalkan' using errcode = '22023';
  end if;
  if public._dihitung_terakhir(new.outlet_id) >= v_waktu then
    if tg_op = 'INSERT' then
      raise exception 'Barang masuk sebelum stok dihitung (stok awal/opname) sudah termasuk hitungan; koreksi lewat opname' using errcode = '22023';
    end if;
    raise exception 'Barang masuk sebelum stok dihitung (stok awal/opname) tidak bisa dibatalkan; koreksi lewat opname' using errcode = '22023';
  end if;
  return new;
end
$$;

create or replace function public.batal_rusak(p_id uuid, p_alasan text) returns void
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
  if public._hitung_menunggu(v.outlet_id) >= v.waktu then
    raise exception 'Catatan rusak sebelum stok dihitung: masih ada hitungan stok (stok awal/opname) yang menunggu persetujuan. Tolak hitungan itu dulu bila catatan ini perlu dibatalkan' using errcode = '22023';
  end if;
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

create or replace function public.kirim_transfer(p jsonb) returns uuid
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
  -- Kunci stok outlet pengirim: tidak bisa lolos dari cek "transfer menunggu" pada ajukan_opname.
  perform public._kunci_stok(v_dari);
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  if exists (select 1 from public.transfer where id = v_id) then
    -- Kiriman ulang hanya sah dari outlet pengirim yang sama.
    if not exists (select 1 from public.transfer where id = v_id and dari_outlet_id = v_dari) then
      raise exception 'Anda tidak berhak mengakses outlet ini' using errcode = '42501';
    end if;
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

revoke execute on function public._hitung_menunggu(uuid) from public, anon, authenticated;
revoke execute on function public._jaga_barang_masuk() from public, anon, authenticated;
