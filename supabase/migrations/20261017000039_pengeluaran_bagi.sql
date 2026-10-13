-- Pengeluaran lainnya dibagi rata ke semua outlet aktif (permintaan owner 13 Okt 2026): admin mengisi nominal &
-- keterangan sekali; tiap outlet mendapat satu baris pengeluaran (dibayar di luar laci) yang terikat bagi_id.

alter table public.pengeluaran add column bagi_id uuid;
create index pengeluaran_bagi_idx on public.pengeluaran (bagi_id) where bagi_id is not null;

create function public.catat_pengeluaran_bagi(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_jumlah bigint := (p ->> 'jumlah')::bigint;
  v_ket text := nullif(trim(coalesce(p ->> 'keterangan', '')), '');
  v_tanggal date := (p ->> 'tanggal')::date;
  v_kategori uuid := (p ->> 'kategori_id')::uuid;
  v_waktu timestamptz;
  v_n integer;
  v_bagian bigint;
  v_sisa bigint;
  k public.kategori_pengeluaran;
begin
  perform public._wajib_admin_keuangan();
  if v_id is null then
    raise exception 'Data pengeluaran tidak lengkap' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));
  if exists (select 1 from public.pengeluaran where bagi_id = v_id) then
    return v_id;
  end if;
  select * into k from public.kategori_pengeluaran where id = v_kategori;
  if not found or not k.aktif or k.kode is not null then
    raise exception 'Kategori pengeluaran tidak dikenal atau nonaktif' using errcode = '22023';
  end if;
  if v_ket is null or length(v_ket) < 3 or length(v_ket) > 200 then
    raise exception 'Keterangan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  if v_tanggal is not null and (v_tanggal > public.tanggal_wib(now()) or v_tanggal < public.tanggal_wib(now()) - 400) then
    raise exception 'Tanggal pengeluaran tidak sah' using errcode = '22023';
  end if;
  select count(*) into v_n from public.outlets where aktif;
  if v_n = 0 then
    raise exception 'Tidak ada outlet aktif' using errcode = '22023';
  end if;
  if v_jumlah is null or v_jumlah < v_n or v_jumlah > 100000000::bigint * v_n then
    raise exception 'Jumlah pengeluaran tidak sah' using errcode = '22023';
  end if;
  v_waktu := case when v_tanggal is null then now() else (v_tanggal::text || ' 12:00:00+07')::timestamptz end;
  v_bagian := v_jumlah / v_n;
  v_sisa := v_jumlah - v_bagian * v_n;
  -- sisa pembagian (rupiah) ke outlet pertama menurut kode, satu rupiah per outlet
  insert into public.pengeluaran (id, outlet_id, sumber, kategori_id, jumlah, waktu, keterangan, dicatat_oleh, bagi_id)
  select gen_random_uuid(), o.id, 'luar', v_kategori, v_bagian + case when o.urut <= v_sisa then 1 else 0 end, v_waktu, v_ket, auth.uid(), v_id
  from (select id, row_number() over (order by kode) as urut from public.outlets where aktif) o;
  return v_id;
end
$$;

create function public.batal_pengeluaran_bagi(p_bagi uuid, p_alasan text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._wajib_admin_keuangan();
  if p_alasan is null or length(trim(p_alasan)) < 3 or length(p_alasan) > 200 then
    raise exception 'Alasan pembatalan wajib diisi (3–200 karakter)' using errcode = '22023';
  end if;
  perform 1 from public.pengeluaran where bagi_id = p_bagi for update;
  if not found then
    raise exception 'Pengeluaran tidak ditemukan' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pengeluaran where bagi_id = p_bagi and batal_at is null) then
    raise exception 'Pengeluaran sudah dibatalkan' using errcode = '22023';
  end if;
  update public.pengeluaran set batal_at = now(), batal_oleh = auth.uid(), batal_alasan = trim(p_alasan)
  where bagi_id = p_bagi and batal_at is null;
end
$$;

-- Satu bagian tidak boleh dibatalkan sendiri (pembagian jadi timpang).
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
  if v.bagi_id is not null then
    raise exception 'Pengeluaran ini dibagi ke semua outlet; batalkan lewat Belanja riil' using errcode = '22023';
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

revoke execute on function public.catat_pengeluaran_bagi(jsonb), public.batal_pengeluaran_bagi(uuid, text) from public, anon;
grant execute on function public.catat_pengeluaran_bagi(jsonb), public.batal_pengeluaran_bagi(uuid, text) to authenticated;
