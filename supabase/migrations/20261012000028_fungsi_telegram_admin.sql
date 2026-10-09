-- Tahap 6: ringkasan harian, pengaturan admin, antrean kirim (Edge Function), jadwal pg_cron.

create function public._tg_hari(d date) returns text
language sql immutable set search_path = '' as $$
  select (array['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'])[extract(isodow from d)::integer]
    || ', ' || to_char(d, 'DD/MM/YYYY')
$$;

-- Ringkasan semua outlet aktif untuk satu tanggal WIB.
create function public._tg_harian(p_tanggal date) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  o record;
  r record;
  v_dari timestamptz := p_tanggal::timestamp at time zone 'Asia/Jakarta';
  v_sampai timestamptz := (p_tanggal + 1)::timestamp at time zone 'Asia/Jakarta';
  v_teks text;
  v_total bigint := 0;
  v_kanal text;
  v_baris text;
begin
  v_teks := '📊 <b>Ringkasan harian · ' || public._tg_hari(p_tanggal) || '</b>';
  for o in select id, nama from public.outlets where aktif order by kode loop
    select count(*) as n, coalesce(sum(total), 0)::bigint as total into r
    from public.penjualan
    where outlet_id = o.id and void_at is null and waktu >= v_dari and waktu < v_sampai;
    v_total := v_total + r.total;
    v_teks := v_teks || e'\n\n<b>' || public._tg_esc(o.nama) || '</b> — ' || public._tg_rp(r.total) || ' (' || r.n || ' transaksi)';
    select string_agg(public._tg_metode(x.metode::text) || ' ' || public._tg_rp(x.total), ' · ' order by x.metode) into v_kanal
    from (
      select metode, sum(total)::bigint as total from public.penjualan
      where outlet_id = o.id and void_at is null and waktu >= v_dari and waktu < v_sampai
      group by metode
    ) x;
    if v_kanal is not null then
      v_teks := v_teks || e'\n' || v_kanal;
    end if;
    select string_agg(case when s.status = 'minus' then '🔴 ' else '🟡 ' end || public._tg_esc(s.label) || ' (' || public._tg_esc(s.teks) || ')', ', ')
    into v_baris from public._tg_status_stok(o.id) s where s.status <> 'aman';
    if v_baris is not null then
      v_teks := v_teks || e'\nStok: ' || v_baris;
    end if;
    select count(*) as n, coalesce(sum(jumlah), 0)::bigint as jumlah into r
    from public.setoran where outlet_id = o.id and batal_at is null and diterima_at is null;
    if r.n > 0 then
      v_teks := v_teks || e'\nSetoran belum dikonfirmasi: ' || public._tg_rp(r.jumlah) || ' (' || r.n || ')';
    end if;
    if exists (select 1 from public.shift where outlet_id = o.id and ditutup_at is null) then
      v_teks := v_teks || e'\n🔓 Toko belum ditutup';
    end if;
  end loop;
  v_teks := v_teks || e'\n\n<b>Total semua outlet ' || public._tg_rp(v_total) || '</b>';
  select string_agg(x.no || '. ' || public._tg_esc(x.nama) || ' (' || x.qty || ')', e'\n' order by x.no) into v_baris
  from (
    select row_number() over (order by sum(i.qty) desc, i.nama) as no, i.nama, sum(i.qty) as qty
    from public.penjualan_item i
    join public.penjualan p on p.id = i.penjualan_id
    where p.void_at is null and p.waktu >= v_dari and p.waktu < v_sampai
    group by i.nama
    order by 1
    limit 5
  ) x;
  if v_baris is not null then
    v_teks := v_teks || e'\n\n<b>Menu terlaris</b>\n' || v_baris;
  end if;
  return v_teks;
end
$$;

-- Kunci rahasia pemanggil mode kirim; dibuat acak di Vault saat migrasi (server saja), tidak pernah di kode.
create function public._tg_kunci_cron() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
begin
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v using 'telegram_cron_kunci';
  return v;
end
$$;

-- Dipanggil pg_cron tiap menit: antre ringkasan harian (sekali per tanggal), lalu bangunkan Edge Function bila ada antrean.
create function public._tg_tiap_menit(p_sekarang timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.telegram_pengaturan;
  v_hari date := (p_sekarang at time zone 'Asia/Jakarta')::date;
begin
  select * into v from public.telegram_pengaturan where id for update;
  if v.chat_id is null then
    return;
  end if;
  -- Galat ringkasan tidak boleh menghentikan pengiriman pesan lain.
  begin
    if (p_sekarang at time zone 'Asia/Jakarta')::time >= v.jam_harian and coalesce(v.harian_terakhir < v_hari, true) then
      perform public._tg_antre('harian', 'harian:' || v_hari, public._tg_harian(v_hari));
      update public.telegram_pengaturan set harian_terakhir = v_hari where id;
    end if;
  exception when others then
    raise warning 'telegram harian: %', sqlerrm;
  end;
  if v.fungsi_url is not null and exists (select 1 from pg_extension where extname = 'pg_net') and exists (
    select 1 from public.telegram_antrean where terkirim_at is null and percobaan < 10 and kirim_lagi_at <= p_sekarang
  ) then
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 60000)'
    using v.fungsi_url, '{"aksi":"kirim"}'::jsonb,
      jsonb_build_object('Content-Type', 'application/json', 'x-kunci-cron', coalesce(public._tg_kunci_cron(), ''));
  end if;
end
$$;

-- ---------- Admin ----------
create function public._tg_wajib_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh mengatur Telegram' using errcode = '42501';
  end if;
end
$$;

create function public.telegram_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.telegram_pengaturan;
begin
  perform public._tg_wajib_admin();
  select * into v from public.telegram_pengaturan where id;
  return jsonb_build_object(
    'terhubung', v.chat_id is not null,
    'chat_judul', v.chat_judul,
    'topik_lengkap', v.topik ?& array['struk', 'harian', 'peringatan', 'kas'],
    'jam_harian', to_char(v.jam_harian, 'HH24:MI'),
    'batas_pengeluaran', v.batas_pengeluaran,
    'jenis_mati', to_jsonb(v.jenis_mati),
    'harian_terakhir', v.harian_terakhir,
    'menunggu', (select count(*) from public.telegram_antrean where terkirim_at is null and percobaan < 10),
    'terkirim_terakhir', (select max(terkirim_at) from public.telegram_antrean),
    'gagal', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'jenis', g.jenis, 'dibuat_at', g.dibuat_at, 'galat', g.galat, 'cuplikan', left(g.teks, 160)) order by g.id desc)
      from (select * from public.telegram_antrean where terkirim_at is null and percobaan >= 10 order by id desc limit 20) g
    ), '[]'::jsonb)
  );
end
$$;

create function public.simpan_telegram(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_jam text := p ->> 'jam_harian';
  v_batas integer;
  v_mati text[];
begin
  perform public._tg_wajib_admin();
  if v_jam is null or v_jam !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Jam ringkasan harian tidak valid' using errcode = '22023';
  end if;
  v_batas := (p ->> 'batas_pengeluaran')::integer;
  if v_batas is null or v_batas < 0 or v_batas > 100000000 then
    raise exception 'Batas pengeluaran tidak valid' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_mati from jsonb_array_elements_text(coalesce(p -> 'jenis_mati', '[]'::jsonb)) x;
  if not v_mati <@ array['struk', 'tutup', 'harian', 'batal', 'selisih_kas', 'selisih_setoran', 'stok', 'opname', 'diabaikan',
                         'ditolak', 'setoran', 'kasbon', 'pengeluaran'] then
    raise exception 'Jenis pesan tidak dikenal' using errcode = '22023';
  end if;
  update public.telegram_pengaturan
  set jam_harian = v_jam::time, batas_pengeluaran = v_batas, jenis_mati = v_mati, diubah_at = now()
  where id;
end
$$;

-- Pesan yang gagal 10 kali dicoba lagi (p_id null = semua).
create function public.kirim_ulang_telegram(p_id bigint default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  perform public._tg_wajib_admin();
  update public.telegram_antrean set percobaan = 0, galat = null, kirim_lagi_at = now()
  where terkirim_at is null and percobaan >= 10 and (p_id is null or id = p_id);
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- ---------- Antrean untuk Edge Function (service_role) ----------
-- Ambil pesan siap kirim & pinjam 2 menit, urut dibuat. Hanya satu pengirim (p_pengirim) dalam satu waktu;
-- selama jeda batas kecepatan Telegram tidak ada yang diambil.
create function public._tg_ambil(p_pengirim uuid, p_batas integer default 10)
returns table (id bigint, chat_id bigint, topik text, thread_id bigint, teks text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v public.telegram_pengaturan;
begin
  update public.telegram_pengaturan s
  set pengirim = p_pengirim, pengirim_sampai = now() + interval '90 seconds'
  where s.id and s.chat_id is not null and coalesce(s.jeda_sampai <= now(), true)
    and (s.pengirim = p_pengirim or coalesce(s.pengirim_sampai <= now(), true))
  returning * into v;
  if not found then
    return;
  end if;
  return query
  with c as (
    select a.id from public.telegram_antrean a
    where a.terkirim_at is null and a.percobaan < 10 and a.kirim_lagi_at <= now()
    order by a.id
    limit least(greatest(p_batas, 1), 50)
    for update skip locked
  ),
  u as (
    update public.telegram_antrean a set kirim_lagi_at = now() + interval '2 minutes'
    from c where a.id = c.id
    returning a.id, a.topik, a.teks
  )
  select u.id, v.chat_id, u.topik, (v.topik ->> u.topik)::bigint, u.teks from u order by u.id;
end
$$;

-- Pengirim selesai: lepaskan giliran.
create function public._tg_selesai(p_pengirim uuid) returns void
language sql security definer set search_path = '' as $$
  update public.telegram_pengaturan set pengirim = null, pengirim_sampai = null where id and pengirim = p_pengirim
$$;

-- Topik dihapus di grup: lupakan id-nya (pesan berikutnya ke General) sampai admin menekan Hubungkan ulang.
create function public._tg_topik_hilang(p_topik text) returns void
language sql security definer set search_path = '' as $$
  update public.telegram_pengaturan set topik = topik - p_topik where id
$$;

-- Hasil kirim. p_tunda_detik = retry_after dari Telegram (batas kecepatan): tidak dihitung sebagai percobaan gagal.
create function public._tg_hasil(p_id bigint, p_ok boolean, p_galat text default null, p_tunda_detik integer default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_ok then
    update public.telegram_antrean set terkirim_at = now(), galat = null where id = p_id;
  elsif p_tunda_detik is not null then
    update public.telegram_antrean set kirim_lagi_at = now() + make_interval(secs => greatest(p_tunda_detik, 1)), galat = left(p_galat, 300)
    where id = p_id;
    update public.telegram_pengaturan set jeda_sampai = now() + make_interval(secs => greatest(p_tunda_detik, 1)) where id;
  else
    update public.telegram_antrean
    set percobaan = percobaan + 1,
        galat = left(p_galat, 300),
        kirim_lagi_at = now() + make_interval(mins => (array[1, 2, 5, 15, 60])[least(percobaan + 1, 5)])
    where id = p_id;
  end if;
end
$$;

revoke execute on function public._tg_hari(date), public._tg_harian(date), public._tg_tiap_menit(timestamptz), public._tg_wajib_admin(),
  public._tg_ambil(uuid, integer), public._tg_hasil(bigint, boolean, text, integer), public._tg_selesai(uuid),
  public._tg_topik_hilang(text), public._tg_kunci_cron() from public, anon, authenticated;
grant execute on function public._tg_ambil(uuid, integer), public._tg_hasil(bigint, boolean, text, integer), public._tg_selesai(uuid),
  public._tg_topik_hilang(text), public._tg_kunci_cron() to service_role;
revoke execute on function public.telegram_status(), public.simpan_telegram(jsonb), public.kirim_ulang_telegram(bigint) from public, anon;
grant execute on function public.telegram_status(), public.simpan_telegram(jsonb), public.kirim_ulang_telegram(bigint) to authenticated;

-- Jadwal tiap menit (hanya di server Supabase; database uji tidak punya pg_cron/pg_net).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    if exists (select 1 from pg_extension where extname = 'supabase_vault')
       and not exists (select 1 from vault.secrets where name = 'telegram_cron_kunci') then
      perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'telegram_cron_kunci');
    end if;
    perform cron.schedule('telegram-tiap-menit', '* * * * *', 'select public._tg_tiap_menit()');
  end if;
end
$$;
