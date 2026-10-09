-- Tahap 7a: katalog dasbor & penghitung panel. SQL hanya disusun dari potongan tetap di bawah;
-- nilai dari pengguna (rentang, outlet, saringan, batas) selalu lewat parameter.

-- Katalog: sumber → ukuran & kolom pengelompokan yang boleh dipakai. Sama dengan src/lib/dasbor/katalog.ts.
create function public._dasbor_katalog() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "penjualan":    {"ukuran": ["omzet", "transaksi", "rata_rata"], "kelompok": ["waktu", "outlet", "kanal", "kasir", "jam", "hari"]},
    "item":         {"ukuran": ["jumlah", "rupiah"], "kelompok": ["waktu", "outlet", "menu", "kategori", "varian", "kanal"]},
    "pemakaian":    {"ukuran": ["jumlah"], "kelompok": ["waktu", "outlet", "bahan"]},
    "terbuang":     {"ukuran": ["jumlah"], "kelompok": ["waktu", "outlet", "bahan", "alasan"]},
    "barang_masuk": {"ukuran": ["rupiah", "jumlah"], "kelompok": ["waktu", "outlet", "barang"]},
    "pengeluaran":  {"ukuran": ["rupiah"], "kelompok": ["waktu", "outlet", "kategori", "sumber"]},
    "setoran":      {"ukuran": ["dicatat", "diterima", "selisih"], "kelompok": ["waktu", "outlet"]},
    "tutup_toko":   {"ukuran": ["selisih", "banyak"], "kelompok": ["waktu", "outlet", "kasir"]},
    "batal":        {"ukuran": ["banyak", "rupiah"], "kelompok": ["waktu", "outlet", "kasir", "kanal"]}
  }'::jsonb
$$;

create function public._dasbor_cek_saringan(s jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_periode text := coalesce(s ->> 'periode', 'hari_ini');
  v_outlet uuid;
begin
  if v_periode not in ('hari_ini', 'kemarin', '7_hari', '30_hari', 'bulan_ini', 'bulan_lalu', 'kustom') then
    raise exception 'Periode dasbor tidak dikenal' using errcode = '22023';
  end if;
  begin
    v_outlet := (s ->> 'outlet_id')::uuid;
    if v_periode = 'kustom' and ((s ->> 'dari')::date is null or (s ->> 'sampai')::date is null or (s ->> 'dari')::date > (s ->> 'sampai')::date) then
      raise exception 'Rentang tanggal tidak sah' using errcode = '22023';
    end if;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    raise exception 'Saringan dasbor tidak sah' using errcode = '22023';
  end;
  if v_outlet is not null and not exists (select 1 from public.outlets where id = v_outlet) then
    raise exception 'Outlet tidak ditemukan' using errcode = '22023';
  end if;
  return jsonb_build_object('outlet_id', v_outlet, 'periode', v_periode)
    || case when v_periode = 'kustom' then jsonb_build_object('dari', s ->> 'dari', 'sampai', s ->> 'sampai') else '{}'::jsonb end;
end
$$;

-- Validasi spek panel terhadap katalog & aturan tiap jenis tampilan.
create function public._dasbor_cek_spek(p_jenis text, s jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  k jsonb := public._dasbor_katalog() -> (s ->> 'sumber');
  v_ukuran jsonb := s -> 'ukuran';
  v_kel jsonb := coalesce(s -> 'kelompok', '[]'::jsonb);
  v_n integer;
  x jsonb;
  kunci text;
begin
  if jsonb_typeof(s) <> 'object' then
    raise exception 'Spek panel tidak sah' using errcode = '22023';
  end if;
  if s ? 'periode_kunci' and jsonb_typeof(s -> 'periode_kunci') <> 'null'
     and s ->> 'periode_kunci' not in ('hari_ini', 'kemarin', '7_hari', '30_hari', 'bulan_ini', 'bulan_lalu') then
    raise exception 'Periode panel tidak dikenal' using errcode = '22023';
  end if;
  if s ? 'outlet_kunci' and jsonb_typeof(s -> 'outlet_kunci') <> 'null'
     and not exists (select 1 from public.outlets o where o.id::text = s ->> 'outlet_kunci') then
    raise exception 'Outlet tidak ditemukan' using errcode = '22023';
  end if;
  if p_jenis in ('status_stok', 'uang_laci') then
    return;
  elsif p_jenis = 'siklus_stok' then
    if s ? 'kunci' and jsonb_typeof(s -> 'kunci') not in ('string', 'null') then
      raise exception 'Spek panel tidak sah' using errcode = '22023';
    end if;
    return;
  elsif p_jenis = 'riwayat' then
    if s ? 'jenis' and (jsonb_typeof(s -> 'jenis') <> 'array' or exists (
      select 1 from jsonb_array_elements_text(s -> 'jenis') j
      where j not in ('jual', 'batal', 'sisa', 'barang_masuk', 'transfer', 'opname', 'toko', 'pengeluaran', 'kasbon', 'setoran', 'diabaikan'))) then
      raise exception 'Jenis kejadian tidak dikenal' using errcode = '22023';
    end if;
    return;
  elsif p_jenis not in ('angka', 'batang', 'garis', 'lingkaran', 'tabel', 'peta_panas') then
    raise exception 'Jenis panel tidak dikenal' using errcode = '22023';
  end if;

  if k is null then
    raise exception 'Sumber data tidak dikenal' using errcode = '22023';
  end if;
  if jsonb_typeof(v_ukuran) <> 'array' or jsonb_array_length(v_ukuran) not between 1 and 4
     or exists (select 1 from jsonb_array_elements(v_ukuran) u where jsonb_typeof(u) <> 'string' or not (k -> 'ukuran' ? (u #>> '{}'))) then
    raise exception 'Ukuran tidak dikenal untuk sumber ini' using errcode = '22023';
  end if;
  if jsonb_typeof(v_kel) <> 'array' or jsonb_array_length(v_kel) > 2 then
    raise exception 'Pengelompokan paling banyak 2' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(v_kel) loop
    if jsonb_typeof(x) <> 'object' or not (k -> 'kelompok' ? coalesce(x ->> 'kolom', '')) then
      raise exception 'Pengelompokan tidak dikenal untuk sumber ini' using errcode = '22023';
    end if;
    if x ->> 'kolom' = 'waktu' and coalesce(x ->> 'satuan', '') not in ('jam', 'hari', 'minggu', 'bulan') then
      raise exception 'Satuan waktu tidak dikenal' using errcode = '22023';
    end if;
  end loop;
  v_n := jsonb_array_length(v_kel);
  if (p_jenis = 'angka' and v_n <> 0)
     or (p_jenis = 'garis' and (v_n = 0 or v_kel -> 0 ->> 'kolom' <> 'waktu'))
     or (p_jenis = 'peta_panas' and v_n <> 2)
     or (p_jenis = 'lingkaran' and (v_n <> 1 or jsonb_array_length(v_ukuran) <> 1))
     or (p_jenis = 'batang' and v_n = 0) then
    raise exception 'Pengelompokan tidak cocok dengan jenis tampilan' using errcode = '22023';
  end if;
  if s ? 'saringan' then
    if jsonb_typeof(s -> 'saringan') <> 'object' then
      raise exception 'Saringan panel tidak sah' using errcode = '22023';
    end if;
    for kunci in select jsonb_object_keys(s -> 'saringan') loop
      if kunci = 'waktu' or not (k -> 'kelompok' ? kunci) or jsonb_typeof(s -> 'saringan' -> kunci) <> 'array'
         or jsonb_array_length(s -> 'saringan' -> kunci) > 100
         or exists (select 1 from jsonb_array_elements(s -> 'saringan' -> kunci) v where jsonb_typeof(v) <> 'string') then
        raise exception 'Saringan panel tidak sah' using errcode = '22023';
      end if;
    end loop;
  end if;
  if s ? 'urutan' and (coalesce(s -> 'urutan' ->> 'oleh', '') not in ('ukuran', 'kelompok')
                       or coalesce(s -> 'urutan' ->> 'arah', '') not in ('naik', 'turun')) then
    raise exception 'Urutan panel tidak sah' using errcode = '22023';
  end if;
  if s ? 'batas' and (jsonb_typeof(s -> 'batas') <> 'number' or (s ->> 'batas')::numeric not between 1 and 500) then
    raise exception 'Batas baris 1–500' using errcode = '22023';
  end if;
end
$$;

-- Potongan SQL tetap per sumber.
create function public._dasbor_dari(p_sumber text, out dari text, out syarat text, out waktu text, out outlet text)
language plpgsql immutable set search_path = '' as $$
begin
  case p_sumber
    when 'penjualan' then dari := 'public.penjualan p'; syarat := 'p.void_at is null'; waktu := 'p.waktu'; outlet := 'p.outlet_id';
    when 'item' then
      dari := 'public.penjualan_item i join public.penjualan p on p.id = i.penjualan_id join public.menu m on m.id = i.menu_id';
      syarat := 'p.void_at is null'; waktu := 'p.waktu'; outlet := 'p.outlet_id';
    when 'pemakaian' then dari := 'public.gerakan_stok g'; syarat := 'g.jenis in (''jual'', ''jual_batal'')'; waktu := 'g.waktu'; outlet := 'g.outlet_id';
    when 'terbuang' then
      dari := 'public.rusak r join public.rusak_item ri on ri.rusak_id = r.id'; syarat := 'r.batal_at is null'; waktu := 'r.waktu'; outlet := 'r.outlet_id';
    when 'barang_masuk' then
      dari := 'public.barang_masuk b join public.barang_masuk_item bi on bi.barang_masuk_id = b.id'; syarat := 'b.batal_at is null';
      waktu := 'b.waktu'; outlet := 'b.outlet_id';
    when 'pengeluaran' then dari := 'public.pengeluaran e'; syarat := 'e.batal_at is null'; waktu := 'e.waktu'; outlet := 'e.outlet_id';
    when 'setoran' then dari := 'public.setoran s'; syarat := 's.batal_at is null'; waktu := 's.waktu'; outlet := 's.outlet_id';
    when 'tutup_toko' then
      dari := 'public.shift t'; syarat := 't.ditutup_at is not null and not t.tutup_tertunda'; waktu := 't.ditutup_at'; outlet := 't.outlet_id';
    when 'batal' then dari := 'public.penjualan p'; syarat := 'p.void_at is not null'; waktu := 'p.void_at'; outlet := 'p.outlet_id';
  end case;
end
$$;

create function public._dasbor_ukuran(p_sumber text, p_ukuran text) returns text
language sql immutable set search_path = '' as $$
  select case p_sumber || '.' || p_ukuran
    when 'penjualan.omzet' then 'coalesce(sum(p.total), 0)'
    when 'penjualan.transaksi' then 'count(*)'
    when 'penjualan.rata_rata' then 'coalesce(round(avg(p.total)), 0)'
    when 'item.jumlah' then 'coalesce(sum(i.qty), 0)'
    when 'item.rupiah' then 'coalesce(sum(i.subtotal), 0)'
    when 'pemakaian.jumlah' then 'coalesce(round(-sum(g.qty), 3), 0)'
    when 'terbuang.jumlah' then 'coalesce(round(sum(ri.qty), 3), 0)'
    when 'barang_masuk.rupiah' then 'coalesce(sum(bi.subtotal), 0)'
    when 'barang_masuk.jumlah' then 'coalesce(sum(bi.qty), 0)'
    when 'pengeluaran.rupiah' then 'coalesce(sum(e.jumlah), 0)'
    when 'setoran.dicatat' then 'coalesce(sum(s.jumlah), 0)'
    when 'setoran.diterima' then 'coalesce(sum(s.jumlah_diterima), 0)'
    when 'setoran.selisih' then 'coalesce(sum(s.jumlah_diterima - s.jumlah), 0)'
    when 'tutup_toko.selisih' then 'coalesce(sum((public._ringkasan_shift(t.id) ->> ''selisih'')::bigint), 0)'
    when 'tutup_toko.banyak' then 'count(*)'
    when 'batal.banyak' then 'count(*)'
    when 'batal.rupiah' then 'coalesce(sum(p.total), 0)'
  end
$$;

-- Kunci kelompok (teks, terurut alami: jam & hari diberi nol di depan, waktu ISO).
create function public._dasbor_kunci(p_sumber text, p_kolom text, p_satuan text, p_waktu text, p_outlet text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_kolom = 'waktu' then format('to_char(date_trunc(%L, %s at time zone ''Asia/Jakarta''), ''YYYY-MM-DD HH24:MI'')',
                                       case p_satuan when 'minggu' then 'week' when 'bulan' then 'month' when 'jam' then 'hour' else 'day' end, p_waktu)
    when p_kolom = 'outlet' then p_outlet || '::text'
    when p_kolom = 'jam' then format('lpad(extract(hour from %s at time zone ''Asia/Jakarta'')::int::text, 2, ''0'')', p_waktu)
    when p_kolom = 'hari' then format('extract(isodow from %s at time zone ''Asia/Jakarta'')::int::text', p_waktu)
    else case p_sumber || '.' || p_kolom
      when 'penjualan.kanal' then 'p.metode::text'
      when 'penjualan.kasir' then 'p.kasir_id::text'
      when 'item.menu' then 'i.menu_id::text'
      when 'item.kategori' then 'm.kategori::text'
      when 'item.varian' then 'coalesce(m.varian::text, ''-'')'
      when 'item.kanal' then 'p.metode::text'
      when 'pemakaian.bahan' then 'g.bahan_id::text'
      when 'terbuang.bahan' then 'ri.bahan_id::text'
      when 'terbuang.alasan' then 'r.alasan::text'
      when 'barang_masuk.barang' then 'bi.satuan_beli_id::text'
      when 'pengeluaran.kategori' then 'e.kategori_id::text'
      when 'pengeluaran.sumber' then 'e.sumber::text'
      when 'tutup_toko.kasir' then 'coalesce(t.ditutup_oleh, t.dibuka_oleh)::text'
      when 'batal.kasir' then 'p.void_oleh::text'
      when 'batal.kanal' then 'p.metode::text'
    end
  end
$$;

-- Label yang dibaca manusia untuk satu kunci kelompok.
create function public._dasbor_label(p_sumber text, p_kolom text, p_satuan text, k text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  t timestamp;
  bulan text[] := array['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
begin
  if k is null then
    return '-';
  end if;
  case p_kolom
    when 'waktu' then
      t := k::timestamp;
      return case p_satuan
        when 'jam' then to_char(t, 'DD/MM HH24.00')
        when 'minggu' then 'Mg ' || to_char(t, 'DD/MM')
        when 'bulan' then bulan[extract(month from t)::int] || ' ' || extract(year from t)::int
        else to_char(t, 'DD/MM') end;
    when 'jam' then return k || '.00';
    when 'hari' then return (array['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'])[k::int];
    when 'outlet' then return coalesce((select nama from public.outlets where id::text = k), '-');
    when 'kasir' then return coalesce((select nama_tampilan from public.profiles where id::text = k), '-');
    when 'kanal' then return public._tg_metode(k);
    when 'menu' then return coalesce((select nama from public.menu where id::text = k), '-');
    when 'varian' then return case k when 'ori' then 'Ori' when 'hot' then 'Hot' else 'Tanpa varian' end;
    when 'bahan' then return coalesce((select nama || ' (' || satuan || ')' from public.bahan where id::text = k), '-');
    when 'barang' then return coalesce((select nama from public.satuan_beli where id::text = k), '-');
    when 'alasan' then return case k
      when 'sisa_tidak_laku' then 'Sisa tidak laku' when 'dimakan_karyawan' then 'Dimakan/dibawa karyawan' when 'gosong' then 'Gosong'
      when 'basi' then 'Basi' when 'jatuh_rusak' then 'Jatuh/rusak' else 'Lainnya' end;
    when 'sumber' then return case k when 'laci' then 'Laci' else 'Luar laci' end;
    when 'kategori' then
      if p_sumber = 'pengeluaran' then
        return coalesce((select nama from public.kategori_pengeluaran where id::text = k), '-');
      end if;
      return case k when 'ayam' then 'Ayam' when 'kulit' then 'Kulit' when 'nasi' then 'Nasi' when 'box' then 'Box' else 'Pelengkap' end;
    else return k;
  end case;
end
$$;

-- Hitung satu panel: {"kolom": [...], "ukuran": [...], "baris": [{"k": [...], "l": [...], "n": [...]}], "terpotong": bool}
create function public.agregasi_dasbor(p_spek jsonb, p_outlet uuid, p_dari timestamptz, p_sampai timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_jenis text := coalesce(p_spek ->> 'jenis', 'tabel');
  v_sumber text := p_spek ->> 'sumber';
  d record;
  v_kel jsonb := coalesce(p_spek -> 'kelompok', '[]'::jsonb);
  v_ukuran jsonb := p_spek -> 'ukuran';
  v_batas integer := coalesce((p_spek ->> 'batas')::integer, 500);
  v_kunci text[] := '{}';
  v_pilih text[] := '{}';
  v_luar text[] := '{}';
  v_syarat text := '';
  v_urut text;
  kolom text;
  i integer;
  v_sql text;
  v_hasil jsonb;
begin
  perform public._wajib_admin_dasbor();
  perform public._dasbor_cek_spek(v_jenis, p_spek);
  if p_dari is null or p_sampai is null or p_dari >= p_sampai or p_sampai - p_dari > interval '400 days' then
    raise exception 'Rentang tanggal tidak sah' using errcode = '22023';
  end if;
  d := public._dasbor_dari(v_sumber);

  for i in 0 .. jsonb_array_length(v_kel) - 1 loop
    v_kunci := v_kunci || public._dasbor_kunci(v_sumber, v_kel -> i ->> 'kolom', v_kel -> i ->> 'satuan', d.waktu, d.outlet);
    v_pilih := v_pilih || format('%s as k%s', v_kunci[i + 1], i);
    v_luar := v_luar || format('public._dasbor_label(%L, %L, %L, x.k%s)', v_sumber, v_kel -> i ->> 'kolom', v_kel -> i ->> 'satuan', i);
  end loop;
  for i in 0 .. jsonb_array_length(v_ukuran) - 1 loop
    v_pilih := v_pilih || format('%s as n%s', public._dasbor_ukuran(v_sumber, v_ukuran ->> i), i);
  end loop;
  for kolom in select jsonb_object_keys(coalesce(p_spek -> 'saringan', '{}'::jsonb)) loop
    v_syarat := v_syarat || format(' and (%s) in (select jsonb_array_elements_text($4 -> %L))',
                                   public._dasbor_kunci(v_sumber, kolom, null, d.waktu, d.outlet), kolom);
  end loop;
  v_urut := case
    when coalesce(p_spek -> 'urutan' ->> 'oleh', case when jsonb_array_length(v_kel) > 0 then 'kelompok' else 'ukuran' end) = 'ukuran'
      then 'x.n0 ' || case when p_spek -> 'urutan' ->> 'arah' = 'naik' then 'asc' else 'desc' end
    else (select string_agg(format('x.k%s %s', g, case when p_spek -> 'urutan' ->> 'arah' = 'turun' then 'desc' else 'asc' end), ', ')
          from generate_series(0, jsonb_array_length(v_kel) - 1) g)
  end;

  v_sql := format(
    'select coalesce(jsonb_agg(jsonb_build_object(''k'', jsonb_build_array(%s), ''l'', jsonb_build_array(%s), ''n'', jsonb_build_array(%s)) order by %s), ''[]''::jsonb)
     from (select * from (select %s from %s where %s and %s >= $1 and %s < $2 and ($3::uuid is null or %s = $3)%s %s) x order by %s limit $5) x',
    (select coalesce(string_agg(format('x.k%s', g), ', '), '') from generate_series(0, jsonb_array_length(v_kel) - 1) g),
    coalesce(array_to_string(v_luar, ', '), ''),
    (select string_agg(format('x.n%s', g), ', ') from generate_series(0, jsonb_array_length(v_ukuran) - 1) g),
    v_urut,
    array_to_string(v_pilih, ', '), d.dari, d.syarat, d.waktu, d.waktu, d.outlet, v_syarat,
    case when jsonb_array_length(v_kel) > 0
         then 'group by ' || (select string_agg(format('%s', g + 1), ', ') from generate_series(0, jsonb_array_length(v_kel) - 1) g)
         else '' end,
    v_urut);
  execute v_sql into v_hasil using p_dari, p_sampai, p_outlet, coalesce(p_spek -> 'saringan', '{}'::jsonb), v_batas + 1;
  return jsonb_build_object(
    'kolom', v_kel, 'ukuran', v_ukuran,
    'baris', case when jsonb_array_length(v_hasil) > v_batas then v_hasil - v_batas else v_hasil end,
    'terpotong', jsonb_array_length(v_hasil) > v_batas);
end
$$;

-- ---------- Dasbor bawaan "Ringkasan" ----------
create function public._dasbor_panel_bawaan() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(
    jsonb_build_object('judul', 'Omzet', 'jenis', 'angka', 'x', 0, 'y', 0, 'w', 2, 'h', 2,
      'spek', jsonb_build_object('sumber', 'penjualan', 'ukuran', jsonb_build_array('omzet'), 'bandingkan', true)),
    jsonb_build_object('judul', 'Transaksi', 'jenis', 'angka', 'x', 2, 'y', 0, 'w', 2, 'h', 2,
      'spek', jsonb_build_object('sumber', 'penjualan', 'ukuran', jsonb_build_array('transaksi'), 'bandingkan', true)),
    jsonb_build_object('judul', 'Rata-rata per transaksi', 'jenis', 'angka', 'x', 4, 'y', 0, 'w', 2, 'h', 2,
      'spek', jsonb_build_object('sumber', 'penjualan', 'ukuran', jsonb_build_array('rata_rata'), 'bandingkan', true)),
    jsonb_build_object('judul', 'Potong ayam terjual', 'jenis', 'angka', 'x', 6, 'y', 0, 'w', 2, 'h', 2,
      'spek', jsonb_build_object('sumber', 'item', 'ukuran', jsonb_build_array('jumlah'), 'bandingkan', true,
                                 'saringan', jsonb_build_object('kategori', jsonb_build_array('ayam')))),
    jsonb_build_object('judul', 'Ayam terbuang (potong)', 'jenis', 'angka', 'x', 8, 'y', 0, 'w', 2, 'h', 2,
      'spek', jsonb_build_object('sumber', 'terbuang', 'ukuran', jsonb_build_array('jumlah'), 'bandingkan', true,
                                 'saringan', jsonb_build_object('bahan', (
                                   select coalesce(jsonb_agg(id::text order by urutan), '[]'::jsonb) from public.bahan
                                   where kode in ('ori_dada', 'ori_paha_atas', 'ori_paha_bawah', 'ori_sayap',
                                                  'hot_dada', 'hot_paha_atas', 'hot_paha_bawah', 'hot_sayap'))))),
    jsonb_build_object('judul', 'Uang di laci', 'jenis', 'uang_laci', 'x', 10, 'y', 0, 'w', 2, 'h', 2, 'spek', '{}'::jsonb),
    jsonb_build_object('judul', 'Omzet per hari', 'jenis', 'garis', 'x', 0, 'y', 2, 'w', 8, 'h', 4,
      'spek', jsonb_build_object('sumber', 'penjualan', 'ukuran', jsonb_build_array('omzet'), 'periode_kunci', '30_hari',
                                 'kelompok', jsonb_build_array(jsonb_build_object('kolom', 'waktu', 'satuan', 'hari'), jsonb_build_object('kolom', 'outlet')))),
    jsonb_build_object('judul', 'Kanal penjualan', 'jenis', 'batang', 'x', 8, 'y', 2, 'w', 4, 'h', 4,
      'spek', jsonb_build_object('sumber', 'penjualan', 'ukuran', jsonb_build_array('omzet', 'transaksi'),
                                 'kelompok', jsonb_build_array(jsonb_build_object('kolom', 'kanal')), 'urutan', jsonb_build_object('oleh', 'ukuran', 'arah', 'turun'))),
    jsonb_build_object('judul', 'Menu terlaris', 'jenis', 'batang', 'x', 0, 'y', 6, 'w', 6, 'h', 5,
      'spek', jsonb_build_object('sumber', 'item', 'ukuran', jsonb_build_array('jumlah'), 'batas', 10,
                                 'kelompok', jsonb_build_array(jsonb_build_object('kolom', 'menu')), 'urutan', jsonb_build_object('oleh', 'ukuran', 'arah', 'turun'))),
    jsonb_build_object('judul', 'Bahan paling banyak terpakai', 'jenis', 'batang', 'x', 6, 'y', 6, 'w', 6, 'h', 5,
      'spek', jsonb_build_object('sumber', 'pemakaian', 'ukuran', jsonb_build_array('jumlah'), 'batas', 10,
                                 'kelompok', jsonb_build_array(jsonb_build_object('kolom', 'bahan')), 'urutan', jsonb_build_object('oleh', 'ukuran', 'arah', 'turun'))),
    jsonb_build_object('judul', 'Terbuang per hari', 'jenis', 'batang', 'x', 0, 'y', 11, 'w', 6, 'h', 4,
      'spek', jsonb_build_object('sumber', 'terbuang', 'ukuran', jsonb_build_array('jumlah'), 'periode_kunci', '30_hari',
                                 'kelompok', jsonb_build_array(jsonb_build_object('kolom', 'waktu', 'satuan', 'hari'), jsonb_build_object('kolom', 'alasan')))),
    jsonb_build_object('judul', 'Jam ramai (transaksi)', 'jenis', 'peta_panas', 'x', 6, 'y', 11, 'w', 6, 'h', 4,
      'spek', jsonb_build_object('sumber', 'penjualan', 'ukuran', jsonb_build_array('transaksi'), 'periode_kunci', '30_hari',
                                 'kelompok', jsonb_build_array(jsonb_build_object('kolom', 'hari'), jsonb_build_object('kolom', 'jam')))),
    jsonb_build_object('judul', 'Perbandingan outlet', 'jenis', 'tabel', 'x', 0, 'y', 15, 'w', 8, 'h', 3,
      'spek', jsonb_build_object('sumber', 'penjualan', 'ukuran', jsonb_build_array('omzet', 'transaksi', 'rata_rata'), 'bandingkan', true,
                                 'kelompok', jsonb_build_array(jsonb_build_object('kolom', 'outlet')))),
    jsonb_build_object('judul', 'Ori vs Hot', 'jenis', 'lingkaran', 'x', 8, 'y', 15, 'w', 4, 'h', 3,
      'spek', jsonb_build_object('sumber', 'item', 'ukuran', jsonb_build_array('jumlah'),
                                 'kelompok', jsonb_build_array(jsonb_build_object('kolom', 'varian')),
                                 'saringan', jsonb_build_object('kategori', jsonb_build_array('ayam')))),
    jsonb_build_object('judul', 'Status stok', 'jenis', 'status_stok', 'x', 0, 'y', 18, 'w', 6, 'h', 6, 'spek', '{}'::jsonb),
    jsonb_build_object('judul', 'Riwayat kejadian', 'jenis', 'riwayat', 'x', 6, 'y', 18, 'w', 6, 'h', 6, 'spek', '{}'::jsonb)
  )
$$;

-- Buat ulang dasbor bawaan (isi awal). Dipanggil migrasi & tombol "Kembalikan bawaan".
create function public._dasbor_isi_bawaan() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  x jsonb;
begin
  select id into v_id from public.dasbor where bawaan;
  if v_id is null then
    insert into public.dasbor (nama, urutan, utama, bawaan, saringan)
    values ('Ringkasan', 0, not exists (select 1 from public.dasbor where utama), true, '{"outlet_id": null, "periode": "hari_ini"}')
    returning id into v_id;
  else
    delete from public.dasbor_panel where dasbor_id = v_id;
    update public.dasbor set nama = 'Ringkasan', saringan = '{"outlet_id": null, "periode": "hari_ini"}', diubah_at = now(), diubah_oleh = auth.uid()
    where id = v_id;
  end if;
  for x in select * from jsonb_array_elements(public._dasbor_panel_bawaan()) loop
    perform public._dasbor_cek_spek(x ->> 'jenis', x -> 'spek');
    insert into public.dasbor_panel (dasbor_id, judul, jenis, spek, x, y, w, h)
    values (v_id, x ->> 'judul', x ->> 'jenis', x -> 'spek', (x ->> 'x')::int, (x ->> 'y')::int, (x ->> 'w')::int, (x ->> 'h')::int);
  end loop;
  return v_id;
end
$$;

create function public.kembalikan_bawaan_dasbor() returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform public._wajib_admin_dasbor();
  return public._dasbor_isi_bawaan();
end
$$;

select public._dasbor_isi_bawaan();

revoke execute on function public._dasbor_katalog(), public._dasbor_cek_saringan(jsonb), public._dasbor_cek_spek(text, jsonb),
  public._dasbor_dari(text), public._dasbor_ukuran(text, text), public._dasbor_kunci(text, text, text, text, text),
  public._dasbor_label(text, text, text, text), public._dasbor_panel_bawaan(), public._dasbor_isi_bawaan()
  from public, anon, authenticated;
revoke execute on function public.agregasi_dasbor(jsonb, uuid, timestamptz, timestamptz), public.kembalikan_bawaan_dasbor() from public, anon;
grant execute on function public.agregasi_dasbor(jsonb, uuid, timestamptz, timestamptz), public.kembalikan_bawaan_dasbor() to authenticated;
