-- Tahap 6: penyusun pesan Telegram & trigger. Notifikasi tidak boleh menggagalkan transaksi:
-- setiap trigger menangkap galatnya sendiri (warning) dan tetap meneruskan.

-- ---------- Bantuan format ----------
create function public._tg_esc(t text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

create function public._tg_rp(n bigint) returns text
language sql immutable set search_path = '' as $$
  select case when n < 0 then '-' else '' end || 'Rp' || replace(to_char(abs(coalesce(n, 0)), 'FM999,999,999,990'), ',', '.')
$$;

-- Jam WIB; tanggal ikut ditulis bila bukan hari ini (mis. penjualan offline kemarin).
create function public._tg_jam(t timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when (t at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
              then to_char(t at time zone 'Asia/Jakarta', 'HH24:MI')
              else to_char(t at time zone 'Asia/Jakarta', 'DD/MM HH24:MI') end
$$;

create function public._tg_metode(m text) returns text
language sql immutable set search_path = '' as $$
  select case m when 'cash' then 'Tunai' when 'qris' then 'QRIS' when 'gofood' then 'GoFood'
                when 'grabfood' then 'GrabFood' when 'shopeefood' then 'ShopeeFood' else m end
$$;

create function public._tg_outlet(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public._tg_esc(nama) from public.outlets where id = p_id
$$;

create function public._tg_nama(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public._tg_esc(coalesce((select nama_tampilan from public.profiles where id = p_id), '-'))
$$;

-- Jenis pesan → topik grup.
create function public._tg_topik(p_jenis text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_jenis = 'struk' then 'struk'
    when p_jenis in ('tutup', 'harian') then 'harian'
    when p_jenis in ('setoran', 'kasbon', 'pengeluaran') then 'kas'
    else 'peringatan' end
$$;

-- Batas Telegram 4096 karakter: potong di akhir baris (setiap tag HTML dibuka & ditutup dalam satu baris).
create function public._tg_potong(t text) returns text
language sql immutable set search_path = '' as $$
  select case when length(t) <= 4000 then t
              else coalesce(substring(left(t, 3900) from '^(.*)\n'), '') || e'\n…' end
$$;

-- Masukkan pesan ke antrean bila grup sudah terhubung & jenisnya tidak dimatikan; kunci sama → diabaikan.
create function public._tg_antre(p_jenis text, p_kunci text, p_teks text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.telegram_pengaturan;
begin
  select * into v from public.telegram_pengaturan where id;
  if v.chat_id is null or p_jenis = any (v.jenis_mati) then
    return;
  end if;
  insert into public.telegram_antrean (kunci, jenis, topik, teks)
  values (p_kunci, p_jenis, public._tg_topik(p_jenis), public._tg_potong(p_teks))
  on conflict (kunci) do nothing;
end
$$;

create function public._tg_aktif(p_jenis text) returns boolean
language sql stable security definer set search_path = '' as $$
  select chat_id is not null and not (p_jenis = any (jenis_mati)) from public.telegram_pengaturan where id
$$;

-- Ringkasan shift tanpa cek akses (dipakai trigger Telegram; isi sama dengan ringkasan_shift 0023).
create function public._ringkasan_shift(p_shift uuid) returns jsonb
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
  if not found then
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

create or replace function public.ringkasan_shift(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_outlet uuid;
begin
  select outlet_id into v_outlet from public.shift where id = p_shift;
  if v_outlet is null or not (public.is_admin() or coalesce(public.my_outlet_id() = v_outlet, false)) then
    raise exception 'Shift tidak ditemukan' using errcode = '22023';
  end if;
  return public._ringkasan_shift(p_shift);
end
$$;

-- ---------- Struk (dikirim saat transaksi selesai, termasuk itemnya) ----------
create function public._tg_struk() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.penjualan;
  v_item text;
  v_bayar text;
begin
  begin
    select * into p from public.penjualan where id = new.id;
    if not found or p.void_at is not null or not public._tg_aktif('struk') then
      return null;
    end if;
    select string_agg(i.qty || '× ' || public._tg_esc(i.nama) || ' — ' || public._tg_rp(i.subtotal), e'\n' order by i.nama)
    into v_item from public.penjualan_item i where i.penjualan_id = p.id;
    v_bayar := public._tg_metode(p.metode::text)
      || case when p.metode = 'cash' then ' (bayar ' || public._tg_rp(p.diterima) || ', kembali ' || public._tg_rp(p.kembalian) || ')' else '' end;
    perform public._tg_antre('struk', 'struk:' || p.id,
      '🧾 <b>' || public._tg_outlet(p.outlet_id) || '</b> · ' || public._tg_esc(p.nomor) || e'\n'
      || public._tg_jam(p.waktu) || ' · ' || public._tg_nama(p.kasir_id) || e'\n'
      || coalesce(v_item, '-') || e'\n'
      || '<b>Total ' || public._tg_rp(p.total) || '</b> · ' || v_bayar
      || case when p.dicatat_at - p.waktu > interval '10 minutes'
              then e'\n<i>Dicatat offline, sampai di server ' || public._tg_jam(p.dicatat_at) || '</i>' else '' end);
    if p.metode = 'cash' and exists (select 1 from public.shift s where s.id = p.shift_id and s.ditutup_dicatat_at < p.dicatat_at) then
      perform public._tg_koreksi_tutup(p.shift_id, 'koreksi_jual:' || p.id,
        'penjualan tunai ' || public._tg_esc(p.nomor) || ' (' || public._tg_jam(p.waktu) || ', ' || public._tg_rp(p.total) || ') baru sampai setelah toko ditutup.');
    end if;
  exception when others then
    raise warning 'telegram struk: %', sqlerrm;
  end;
  return null;
end
$$;
create constraint trigger penjualan_tg_struk after insert on public.penjualan
  deferrable initially deferred for each row execute function public._tg_struk();

-- Transaksi/batal tunai yang sampai di server setelah toko ditutup mengubah selisih shift itu: kirim selisih terbaru.
create function public._tg_koreksi_tutup(p_shift uuid, p_kunci text, p_sebab text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.shift;
  r jsonb;
begin
  select * into s from public.shift where id = p_shift;
  if s.ditutup_dicatat_at is null or s.tutup_tertunda then
    return;
  end if;
  r := public._ringkasan_shift(p_shift);
  perform public._tg_antre('selisih_kas', p_kunci,
    '⚠️ <b>Koreksi tutup toko</b> · ' || public._tg_outlet(s.outlet_id) || e'\n'
    || 'Shift tutup ' || public._tg_jam(s.ditutup_at) || ': ' || p_sebab || e'\n'
    || 'Laci seharusnya kini ' || public._tg_rp((r ->> 'cash_seharusnya')::bigint)
    || case when r ->> 'selisih' is null then ''
            else ' · selisih kini <b>' || public._tg_rp((r ->> 'selisih')::bigint) || '</b>' end);
end
$$;

-- ---------- Batal transaksi ----------
create function public._tg_batal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.shift;
begin
  begin
    select * into s from public.shift where id = new.shift_id;
    perform public._tg_antre('batal', 'batal:' || new.id,
      '⚠️ <b>Batal transaksi</b> · ' || public._tg_outlet(new.outlet_id) || e'\n'
      || public._tg_esc(new.nomor) || ' (' || public._tg_jam(new.waktu) || ') · ' || public._tg_rp(new.total) || ' · ' || public._tg_metode(new.metode::text) || e'\n'
      || 'Oleh ' || public._tg_nama(new.void_oleh) || ': ' || public._tg_esc(new.void_alasan)
      || case when s.ditutup_dicatat_at is not null and not s.tutup_tertunda and new.void_dicatat_at > s.ditutup_dicatat_at
              then e'\n<i>Dibatalkan setelah tutup toko</i>' else '' end);
    if new.metode = 'cash' and s.ditutup_dicatat_at < new.void_dicatat_at then
      perform public._tg_koreksi_tutup(new.shift_id, 'koreksi_batal:' || new.id,
        'batal tunai ' || public._tg_esc(new.nomor) || ' (' || public._tg_rp(new.total) || ') masuk setelah toko ditutup.');
    end if;
  exception when others then
    raise warning 'telegram batal: %', sqlerrm;
  end;
  return null;
end
$$;
create trigger penjualan_tg_batal after update of void_at on public.penjualan
  for each row when (old.void_at is null and new.void_at is not null)
  execute function public._tg_batal();

-- ---------- Tutup toko (+ peringatan selisih kas) ----------
create function public._tg_tutup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_kanal text := '';
  m text;
  v_selisih bigint;
begin
  begin
    if not (public._tg_aktif('tutup') or public._tg_aktif('selisih_kas')) then
      return null;
    end if;
    r := public._ringkasan_shift(new.id);
    for m in select x::text from unnest(enum_range(null::public.metode_bayar)) as x loop
      if (r -> 'per_metode' -> m ->> 'jumlah')::integer > 0 then
        v_kanal := v_kanal || e'\n' || public._tg_metode(m) || ': ' || public._tg_rp((r -> 'per_metode' -> m ->> 'total')::bigint)
          || ' (' || (r -> 'per_metode' -> m ->> 'jumlah') || ')';
      end if;
    end loop;
    v_selisih := (r ->> 'selisih')::bigint;
    perform public._tg_antre('tutup', 'tutup:' || new.id,
      '🏪 <b>Tutup toko · ' || public._tg_outlet(new.outlet_id) || '</b>' || e'\n'
      || 'Buka ' || public._tg_jam(new.dibuka_at) || ' – tutup ' || public._tg_jam(new.ditutup_at)
      || ' · ' || public._tg_nama(coalesce(new.ditutup_oleh, new.dibuka_oleh)) || e'\n'
      || 'Transaksi: ' || (r ->> 'jumlah_transaksi') || ' (batal ' || (r ->> 'jumlah_void') || ')'
      || v_kanal || e'\n'
      || '<b>Total ' || public._tg_rp((r ->> 'total')::bigint) || '</b>' || e'\n'
      || 'Laci seharusnya ' || public._tg_rp((r ->> 'cash_seharusnya')::bigint)
      || ' · dihitung ' || case when r ->> 'uang_fisik' is null then '-' else public._tg_rp((r ->> 'uang_fisik')::bigint) end
      || ' · selisih ' || case when v_selisih is null then '-' else public._tg_rp(v_selisih) end || case when v_selisih = 0 then ' ✅' when v_selisih <> 0 then ' ⚠️' else '' end || e'\n'
      || 'Pengeluaran laci ' || public._tg_rp((r ->> 'pengeluaran_laci')::bigint) || ' · setoran ' || public._tg_rp((r ->> 'setoran')::bigint));
    if v_selisih <> 0 then
      perform public._tg_antre('selisih_kas', 'selisih_kas:' || new.id,
        '⚠️ <b>Selisih kas</b> · ' || public._tg_outlet(new.outlet_id) || e'\n'
        || 'Tutup toko ' || public._tg_jam(new.ditutup_at) || ' (' || public._tg_nama(coalesce(new.ditutup_oleh, new.dibuka_oleh)) || ')' || e'\n'
        || 'Laci seharusnya ' || public._tg_rp((r ->> 'cash_seharusnya')::bigint) || ', dihitung ' || public._tg_rp((r ->> 'uang_fisik')::bigint) || e'\n'
        || '<b>' || case when v_selisih > 0 then 'Lebih ' else 'Kurang ' end || public._tg_rp(abs(v_selisih)) || '</b>');
    end if;
  exception when others then
    raise warning 'telegram tutup: %', sqlerrm;
  end;
  return null;
end
$$;
create trigger shift_tg_tutup after update on public.shift
  for each row when (new.ditutup_dicatat_at is not null and new.ditutup_dicatat_at is distinct from old.ditutup_dicatat_at and not new.tutup_tertunda)
  execute function public._tg_tutup();
create trigger shift_tg_tutup_baru after insert on public.shift
  for each row when (new.ditutup_at is not null and not new.tutup_tertunda)
  execute function public._tg_tutup();

-- ---------- Setoran (+ peringatan selisih setoran) ----------
create function public._tg_setoran() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform public._tg_antre('setoran', 'setoran:' || new.id,
        '💰 <b>Setoran dicatat</b> · ' || public._tg_outlet(new.outlet_id) || e'\n'
        || '<b>' || public._tg_rp(new.jumlah) || '</b> · ' || public._tg_jam(new.waktu) || ' · ' || public._tg_nama(new.dicatat_oleh)
        || coalesce(e'\n' || public._tg_esc(new.catatan), '') || e'\nMenunggu dikonfirmasi owner.');
    else
      perform public._tg_antre('setoran', 'setoran_terima:' || new.id,
        '💰 <b>Setoran diterima</b> · ' || public._tg_outlet(new.outlet_id) || e'\n'
        || '<b>' || public._tg_rp(new.jumlah_diterima) || '</b> dari setoran ' || public._tg_rp(new.jumlah) || ' (' || public._tg_jam(new.waktu) || ')'
        || ' · dikonfirmasi ' || public._tg_nama(new.diterima_oleh));
      if new.jumlah_diterima <> new.jumlah then
        perform public._tg_antre('selisih_setoran', 'selisih_setoran:' || new.id,
          '⚠️ <b>Selisih setoran</b> · ' || public._tg_outlet(new.outlet_id) || e'\n'
          || 'Dicatat kasir ' || public._tg_rp(new.jumlah) || ' (' || public._tg_jam(new.waktu) || ', ' || public._tg_nama(new.dicatat_oleh) || ')' || e'\n'
          || 'Diterima ' || public._tg_rp(new.jumlah_diterima) || ' → <b>'
          || case when new.jumlah_diterima > new.jumlah then 'lebih ' else 'kurang ' end || public._tg_rp(abs(new.jumlah_diterima - new.jumlah)) || '</b>'
          || coalesce(e'\n' || public._tg_esc(new.catatan_terima), ''));
      end if;
    end if;
  exception when others then
    raise warning 'telegram setoran: %', sqlerrm;
  end;
  return null;
end
$$;
create trigger setoran_tg_catat after insert on public.setoran
  for each row execute function public._tg_setoran();
create trigger setoran_tg_terima after update of diterima_at on public.setoran
  for each row when (old.diterima_at is null and new.diterima_at is not null)
  execute function public._tg_setoran();

-- ---------- Kasbon & pengeluaran laci besar ----------
create function public._tg_pengeluaran() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k public.kategori_pengeluaran;
  v_batas integer;
begin
  begin
    select * into k from public.kategori_pengeluaran where id = new.kategori_id;
    if k.kode = 'kasbon' then
      perform public._tg_antre('kasbon', 'kasbon:' || new.id,
        '💰 <b>Kasbon</b> · ' || public._tg_outlet(new.outlet_id) || e'\n'
        || public._tg_esc((select nama from public.karyawan where id = new.karyawan_id)) || ' · <b>' || public._tg_rp(new.jumlah) || '</b>'
        || ' · ' || case when new.sumber = 'laci' then 'dari laci' else 'dari owner' end || e'\n'
        || public._tg_jam(new.waktu) || ' · dicatat ' || public._tg_nama(new.dicatat_oleh)
        || coalesce(e'\n' || public._tg_esc(new.keterangan), ''));
    elsif new.sumber = 'laci' and k.kode is distinct from 'gaji' then
      select batas_pengeluaran into v_batas from public.telegram_pengaturan where id;
      if new.jumlah >= v_batas then
        perform public._tg_antre('pengeluaran', 'pengeluaran:' || new.id,
          '💰 <b>Pengeluaran laci</b> · ' || public._tg_outlet(new.outlet_id) || e'\n'
          || public._tg_esc(k.nama) || ' · <b>' || public._tg_rp(new.jumlah) || '</b>' || e'\n'
          || public._tg_jam(new.waktu) || ' · ' || public._tg_nama(new.dicatat_oleh)
          || coalesce(e'\n' || public._tg_esc(new.keterangan), ''));
      end if;
    end if;
  exception when others then
    raise warning 'telegram pengeluaran: %', sqlerrm;
  end;
  return null;
end
$$;
create trigger pengeluaran_tg after insert on public.pengeluaran
  for each row execute function public._tg_pengeluaran();

-- ---------- Opname & stok awal menunggu persetujuan ----------
create function public._tg_opname() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  begin
    if tg_table_name = 'opname' then
      select count(*) into v_n from public.opname_item where opname_id = new.id;
      perform public._tg_antre('opname', 'opname:' || new.id,
        '⚠️ <b>Opname menunggu persetujuan</b> · ' || public._tg_outlet(new.outlet_id) || e'\n'
        || 'Dihitung ' || public._tg_jam(new.dihitung_at) || ' oleh ' || public._tg_nama(new.diajukan_oleh) || ' · ' || v_n || ' bahan' || e'\n'
        || 'Setujui di Admin → Stok → Opname.');
    else
      perform public._tg_antre('opname', 'stok_awal:' || new.id,
        '⚠️ <b>Stok awal menunggu persetujuan</b> · ' || public._tg_outlet(new.outlet_id) || e'\n'
        || 'Dihitung ' || public._tg_jam(new.dihitung_at) || ' oleh ' || public._tg_nama(new.diajukan_oleh) || e'\n'
        || 'Setujui di Admin → Stok.');
    end if;
  exception when others then
    raise warning 'telegram opname: %', sqlerrm;
  end;
  return null;
end
$$;
create constraint trigger opname_tg after insert on public.opname
  deferrable initially deferred for each row when (new.status = 'diajukan') execute function public._tg_opname();
create constraint trigger stok_awal_tg after insert on public.stok_awal
  deferrable initially deferred for each row when (new.status = 'diajukan') execute function public._tg_opname();

-- ---------- Data diabaikan kasir & data ditolak server ----------
create function public._tg_label_kejadian(j text) returns text
language sql immutable set search_path = '' as $$
  select case j
    when 'buka_shift' then 'Buka toko' when 'jual' then 'Jualan' when 'tutup_shift' then 'Tutup toko'
    when 'rusak' then 'Rusak/sisa' when 'batal_jual' then 'Batal transaksi' when 'kirim_transfer' then 'Kirim ke outlet lain'
    when 'ubah_transfer' then 'Ubah kiriman' when 'batal_transfer' then 'Batal kiriman' when 'terima_transfer' then 'Terima kiriman'
    when 'opname' then 'Opname' when 'stok_awal' then 'Stok awal' when 'pengeluaran' then 'Pengeluaran'
    when 'setoran' then 'Setoran' when 'kasbon' then 'Kasbon' else j end
$$;

create function public._tg_diabaikan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public._tg_antre('diabaikan', 'diabaikan:' || new.id,
      '⚠️ <b>Data diabaikan kasir</b> · ' || public._tg_outlet(new.outlet_id) || e'\n'
      || public._tg_esc(public._tg_label_kejadian(new.jenis)) || ' · oleh ' || public._tg_nama(new.oleh) || e'\n'
      || 'Ditolak server: ' || public._tg_esc(coalesce(new.alasan_tolak, '-')) || e'\n'
      || 'Alasan kasir: ' || public._tg_esc(new.alasan));
  exception when others then
    raise warning 'telegram diabaikan: %', sqlerrm;
  end;
  return null;
end
$$;
create trigger kejadian_diabaikan_tg after insert on public.kejadian_diabaikan
  for each row execute function public._tg_diabaikan();

-- Perangkat kasir melapor data antrean yang ditolak server (mis. terima kiriman beda jumlah).
-- Sekali per kejadian (kunci); tidak pernah menolak supaya tidak menghambat sinkron.
create function public.lapor_ditolak(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_outlet uuid;
begin
  begin
    v_outlet := (p ->> 'outlet_id')::uuid;
    if auth.uid() is null or not (public.is_admin() or v_outlet = public.my_outlet_id()) then
      return;
    end if;
    -- Paling banyak 10 laporan per jam: klien yang berulang tidak membanjiri grup.
    if (select count(*) from public.telegram_antrean where jenis = 'ditolak' and dibuat_at > now() - interval '1 hour') >= 10 then
      return;
    end if;
    perform public._tg_antre('ditolak', 'ditolak:' || ((p ->> 'id')::uuid)::text,
      '⚠️ <b>Data kasir ditolak server</b> · ' || public._tg_outlet(v_outlet) || e'\n'
      || public._tg_esc(public._tg_label_kejadian(left(p ->> 'jenis', 30))) || ' · ' || public._tg_nama(auth.uid()) || e'\n'
      || public._tg_esc(left(coalesce(p ->> 'alasan', '-'), 300)) || e'\n'
      || 'Kasir perlu memeriksa di menu Antrean.');
  exception when others then
    raise warning 'telegram ditolak: %', sqlerrm;
  end;
end
$$;

-- ---------- Status stok (sama dengan src/lib/stok/tampil.ts) ----------
-- Baris tampilan stok: satuan beli berisi >1 bahan = satu baris kelompok; selain itu satu baris per bahan
-- dengan satuan beli satu-bahan ber-isi terkecil sebagai acuan ambang.
-- p_bahan: hanya baris yang memuat bahan ini (beserta anggota pack-nya); null = semua.
create function public._tg_status_stok(p_outlet uuid, p_bahan uuid[] default null)
returns table (kunci text, label text, status text, teks text)
language sql stable security definer set search_path = '' as $$
  with relevan as (
    select unnest(p_bahan) as id
    union
    select i2.bahan_id from public.satuan_beli_isi i1
    join public.satuan_beli_isi i2 on i2.satuan_beli_id = i1.satuan_beli_id
    where i1.bahan_id = any (p_bahan)
  ),
  q as (
    select b.id, b.nama, b.satuan, b.urutan, coalesce(sum(g.qty), 0)::numeric as n
    from public.bahan b
    left join public.gerakan_stok g on g.bahan_id = b.id and g.outlet_id = p_outlet
    where b.aktif and (p_bahan is null or b.id in (select id from relevan))
    group by b.id
  ),
  isi as (
    select i.satuan_beli_id as sid, i.bahan_id, i.qty
    from public.satuan_beli_isi i
    join public.satuan_beli s on s.id = i.satuan_beli_id and s.aktif
    join public.bahan b on b.id = i.bahan_id and b.aktif
  ),
  grup as (select sid from isi group by sid having count(*) > 1),
  anggota as (
    select distinct on (i.bahan_id) i.bahan_id, i.sid from isi i join grup g using (sid) order by i.bahan_id, i.sid
  ),
  baris_grup as (
    select s.id::text as kunci,
           trim(regexp_replace(regexp_replace(s.nama, '^(pack|karung)\s+', '', 'i'), '\s*\(.*\)\s*$', '')) as label,
           case when bool_or(q.n < -0.001) then 'minus'
                when s.ambang is not null and sum(q.n) / sum(i.qty) <= s.ambang + 1e-9 then 'menipis'
                else 'aman' end as status,
           '≈ ' || replace(trim_scale(round(sum(q.n) / sum(i.qty), 1))::text, '.', ',') || ' pack' as teks,
           min(q.urutan) as urutan
    from public.satuan_beli s
    join isi i on i.sid = s.id
    join q on q.id = i.bahan_id
    where s.id in (select sid from anggota)
    group by s.id
  ),
  acuan as (
    select distinct on (i.bahan_id) i.bahan_id, i.qty as isi, s.ambang
    from isi i join public.satuan_beli s on s.id = i.sid
    where i.sid not in (select sid from grup)
    order by i.bahan_id, i.qty
  ),
  baris_tunggal as (
    select q.id::text, q.nama,
           case when q.n < -0.001 then 'minus'
                when a.ambang is not null and q.n / a.isi <= a.ambang + 1e-9 then 'menipis'
                else 'aman' end,
           replace(trim_scale(round(q.n, 2))::text, '.', ',') || ' ' || q.satuan,
           q.urutan
    from q left join acuan a on a.bahan_id = q.id
    where q.id not in (select bahan_id from anggota)
  )
  select kunci, label, status, teks from (
    select * from baris_grup union all select * from baris_tunggal
  ) x order by urutan, label
$$;

create function public._tg_cek_stok(p_outlet uuid, p_bahan uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_baris text := '';
begin
  if not public._tg_aktif('stok') then
    return;
  end if;
  for r in
    select s.kunci, s.label, s.status, s.teks
    from public._tg_status_stok(p_outlet, p_bahan) s
    left join public.telegram_status_stok t on t.outlet_id = p_outlet and t.kunci = s.kunci
    where s.status <> coalesce(t.status, 'aman')
  loop
    if r.status <> 'aman' then
      v_baris := v_baris || e'\n' || case when r.status = 'minus' then '🔴 ' else '🟡 ' end
        || public._tg_esc(r.label) || ': ' || case when r.status = 'minus' then '<b>minus</b>' else 'menipis' end
        || ' (' || public._tg_esc(r.teks) || ')';
    end if;
    insert into public.telegram_status_stok (outlet_id, kunci, status) values (p_outlet, r.kunci, r.status)
    on conflict (outlet_id, kunci) do update set status = excluded.status;
  end loop;
  if v_baris <> '' then
    perform public._tg_antre('stok', 'stok:' || gen_random_uuid(), '⚠️ <b>Stok</b> · ' || public._tg_outlet(p_outlet) || v_baris);
  end if;
end
$$;

create function public._tg_stok() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  begin
    for r in select outlet_id, array_agg(distinct bahan_id) as bahan from baru group by outlet_id loop
      perform public._tg_cek_stok(r.outlet_id, r.bahan);
    end loop;
  exception when others then
    raise warning 'telegram stok: %', sqlerrm;
  end;
  return null;
end
$$;
create trigger gerakan_stok_tg after insert on public.gerakan_stok
  referencing new table as baru for each statement execute function public._tg_stok();

-- Semua fungsi di atas hanya dipanggil trigger/fungsi lain, kecuali lapor_ditolak.
revoke execute on function public._tg_esc(text), public._tg_rp(bigint), public._tg_jam(timestamptz), public._tg_metode(text),
  public._tg_outlet(uuid), public._tg_nama(uuid), public._tg_topik(text), public._tg_antre(text, text, text), public._tg_aktif(text),
  public._tg_struk(), public._tg_batal(), public._tg_tutup(), public._tg_setoran(), public._tg_pengeluaran(), public._tg_opname(),
  public._tg_label_kejadian(text), public._tg_diabaikan(), public._tg_status_stok(uuid, uuid[]), public._tg_cek_stok(uuid, uuid[]), public._tg_stok(),
  public._tg_potong(text), public._ringkasan_shift(uuid), public._tg_koreksi_tutup(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.lapor_ditolak(jsonb) from public, anon;
grant execute on function public.lapor_ditolak(jsonb) to authenticated;
