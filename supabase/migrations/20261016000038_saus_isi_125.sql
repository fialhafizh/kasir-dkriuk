-- Ralat owner 11 Okt 2026: saus sambal & saus tomat D'Kriuk isi 125 sachet per pack (bukan 150).
update public.satuan_beli_isi i set qty = 125 from public.satuan_beli s
where s.id = i.satuan_beli_id and s.kode in ('pack_saus_sambal', 'pack_saus_tomat');
