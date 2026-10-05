-- Tahap 3b: opname mingguan (hitung buta). Rumus sama dengan stok awal: hitungan berlaku pada jam
-- dihitung; koreksi = hitungan − saldo s.d. jam itu; angka sistem disimpan untuk laporan susut.

create function public.ajukan_opname(p_outlet uuid, p_item jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public._cek_akses_outlet(p_outlet);
  perform public._kunci_stok(p_outlet);
  if not exists (select 1 from public.stok_awal where outlet_id = p_outlet and status = 'disetujui') then
    raise exception 'Opname butuh stok awal yang sudah disetujui' using errcode = '22023';
  end if;
  if exists (select 1 from public.opname where outlet_id = p_outlet and status = 'diajukan') then
    raise exception 'Opname outlet ini masih menunggu persetujuan admin' using errcode = '22023';
  end if;
  if exists (select 1 from public.transfer where status = 'dikirim' and (dari_outlet_id = p_outlet or ke_outlet_id = p_outlet)) then
    raise exception 'Selesaikan kiriman/penerimaan dulu sebelum opname' using errcode = '22023';
  end if;
  perform public._cek_isian_stok(p_item);
  insert into public.opname (outlet_id, diajukan_oleh) values (p_outlet, auth.uid()) returning id into v_id;
  insert into public.opname_item (opname_id, bahan_id, qty_hitung)
  select v_id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  return v_id;
end
$$;

create function public.pratinjau_opname(p_id uuid) returns table (bahan_id uuid, qty_hitung numeric, qty_sistem numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._wajib_admin_stok();
  return query
  select i.bahan_id, i.qty_hitung::numeric,
         coalesce((select sum(g.qty) from public.gerakan_stok g
                   where g.outlet_id = o.outlet_id and g.bahan_id = i.bahan_id and g.waktu <= o.dihitung_at), 0)::numeric
  from public.opname_item i
  join public.opname o on o.id = i.opname_id
  where i.opname_id = p_id;
end
$$;

create function public.putuskan_opname(p_id uuid, p_setuju boolean, p_item jsonb, p_catatan text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.opname;
begin
  perform public._wajib_admin_stok();
  select * into s from public.opname where id = p_id for update;
  if not found then
    raise exception 'Ajuan opname tidak ditemukan' using errcode = '22023';
  end if;
  if s.status <> 'diajukan' then
    raise exception 'Ajuan opname sudah diputuskan' using errcode = '22023';
  end if;
  if p_setuju is null then
    raise exception 'Ajuan opname tidak lengkap' using errcode = '22023';
  end if;
  if not p_setuju then
    if p_catatan is null or length(trim(p_catatan)) < 3 or length(p_catatan) > 200 then
      raise exception 'Alasan penolakan wajib diisi (3–200 karakter)' using errcode = '22023';
    end if;
    update public.opname set status = 'ditolak', diputus_at = now(), diputus_oleh = auth.uid(), catatan = trim(p_catatan) where id = p_id;
    return;
  end if;
  if p_catatan is not null and length(p_catatan) > 200 then
    raise exception 'Catatan paling banyak 200 karakter' using errcode = '22023';
  end if;
  perform public._kunci_stok(s.outlet_id);
  if p_item is not null and jsonb_typeof(p_item) <> 'null' then
    perform public._cek_isian_stok(p_item);
    delete from public.opname_item where opname_id = p_id;
    insert into public.opname_item (opname_id, bahan_id, qty_hitung)
    select p_id, x.bahan_id, x.qty from jsonb_to_recordset(p_item) as x (bahan_id uuid, qty numeric);
  end if;
  update public.opname_item i
  set qty_sistem = coalesce((select sum(g.qty) from public.gerakan_stok g
                             where g.outlet_id = s.outlet_id and g.bahan_id = i.bahan_id and g.waktu <= s.dihitung_at), 0)
  where i.opname_id = p_id;
  insert into public.gerakan_stok (outlet_id, bahan_id, qty, jenis, waktu, oleh, opname_id)
  select s.outlet_id, i.bahan_id, i.qty_hitung - i.qty_sistem, 'opname', s.dihitung_at, auth.uid(), s.id
  from public.opname_item i
  where i.opname_id = p_id and i.qty_hitung <> i.qty_sistem;
  update public.opname
  set status = 'disetujui', diputus_at = now(), diputus_oleh = auth.uid(), catatan = nullif(trim(coalesce(p_catatan, '')), '')
  where id = p_id;
end
$$;

revoke execute on function public.ajukan_opname(uuid, jsonb) from public, anon;
revoke execute on function public.pratinjau_opname(uuid) from public, anon;
revoke execute on function public.putuskan_opname(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.ajukan_opname(uuid, jsonb) to authenticated;
grant execute on function public.pratinjau_opname(uuid) to authenticated;
grant execute on function public.putuskan_opname(uuid, boolean, jsonb, text) to authenticated;
