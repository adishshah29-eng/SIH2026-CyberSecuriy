-- Phase B — expose qr_token on the public provenance view so /trace/[qrToken]
-- can resolve a product by its opaque token instead of the guessable batch
-- code. batch_code stays out of the anon-readable surface beyond display text
-- already shown on the page (it was already visible there; the *lookup key*
-- is what changes).

create or replace view product_provenance as
select
  b.batch_code,
  b.herb_name,
  b.origin_location,
  b.quantity_kg,
  b.collection_date,
  b.status                                       as batch_status,
  p.product_name,
  p.manufactured_at,
  p.qr_url,
  s_col.name                                     as collector_display,
  ce.location_name                               as collection_location,
  round(ce.latitude::numeric, 2)                 as lat,
  round(ce.longitude::numeric, 2)                as lng,
  ce.harvest_zone,
  ce.season_valid,
  (select bool_and(qt.status = 'Passed')
     from quality_tests qt where qt.batch_id = b.id)   as all_tests_passed,
  (select json_agg(json_build_object(
       'test_type', qt.test_type,
       'status',    qt.status)
       order by qt.test_type)
     from quality_tests qt where qt.batch_id = b.id)   as tests,
  p.qr_token                                     as qr_token
from batches b
join products p           on p.batch_id  = b.id
join collection_events ce on ce.batch_id = b.id
left join stakeholders s_col on s_col.id  = b.collector_id
where p.status = 'active';

grant select on product_provenance to anon;
grant select on product_provenance to authenticated;

-- Existing products (generated before this migration) still have
-- qr_url = .../trace/<batch_code>. Repoint them at the token-based path so
-- QR codes already printed for the demo keep resolving.
update products
set qr_url = regexp_replace(qr_url, '/[^/]*$', '/' || qr_token)
where status = 'active';
