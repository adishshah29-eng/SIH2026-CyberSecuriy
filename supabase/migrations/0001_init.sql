-- AyurTrace prototype schema
-- Six core tables + one public read view for the consumer portal.

create extension if not exists "pgcrypto";

-- ── Reference table ─────────────────────────────────────────────
create table stakeholders (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  role          text not null check (role in ('collector', 'processor', 'lab', 'manufacturer')),
  name          text not null,
  location      text,
  verified      boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── Core ledger tables ──────────────────────────────────────────
create table batches (
  id                uuid primary key default gen_random_uuid(),
  batch_code        text unique not null,
  herb_name         text not null default 'Ashwagandha',
  quantity_kg       numeric not null check (quantity_kg > 0),
  collection_date   date not null,
  current_stage     text not null check (current_stage in
    ('Collected', 'Processing', 'Lab Testing', 'Manufacturing', 'Verified', 'Failed')),
  status            text not null check (status in
    ('Pending', 'Passed', 'Failed', 'Verified')),
  collector_id      uuid references stakeholders(id),
  origin_location   text not null,
  created_at        timestamptz not null default now()
);

create index batches_current_stage_idx on batches (current_stage);
create index batches_status_idx on batches (status);
create index batches_collection_date_idx on batches (collection_date desc);

create table collection_events (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references batches(id) on delete cascade,
  collector_id   uuid not null references stakeholders(id),
  latitude       double precision not null,
  longitude      double precision not null,
  location_name  text not null,
  quantity_kg    numeric not null check (quantity_kg > 0),
  collected_at   timestamptz not null,
  harvest_zone   text not null,
  season_valid   boolean not null default true
);

create index collection_events_batch_id_idx on collection_events (batch_id);

create table processing_events (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references batches(id) on delete cascade,
  processor_id    uuid references stakeholders(id),
  process_type    text not null,
  start_time      timestamptz not null,
  end_time        timestamptz,
  notes           text
);

create index processing_events_batch_id_idx on processing_events (batch_id);

create table quality_tests (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references batches(id) on delete cascade,
  lab_id            uuid references stakeholders(id),
  test_type         text not null,
  value             text not null,
  threshold         text not null,
  status            text not null check (status in ('Passed', 'Failed')),
  tested_at         timestamptz not null,
  certificate_url   text
);

create index quality_tests_batch_id_idx on quality_tests (batch_id);

create table anomalies (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid references batches(id) on delete cascade,
  stakeholder_id uuid references stakeholders(id),
  anomaly_type   text not null,
  severity       text not null check (severity in ('low', 'medium', 'high')),
  description    text not null,
  score          numeric not null check (score between 0 and 100),
  status         text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  detected_at    timestamptz not null default now()
);

create index anomalies_severity_status_idx on anomalies (severity, status);

create table products (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references batches(id) on delete cascade,
  product_name      text not null,
  manufacturer_id   uuid references stakeholders(id),
  manufactured_at   timestamptz not null,
  qr_token          text unique not null,
  qr_url            text not null,
  status            text not null default 'active' check (status in ('active', 'recalled'))
);

create index products_batch_id_idx on products (batch_id);

-- ── Public provenance view (consumer portal read surface) ──────
-- Coordinates are rounded to 2dp so exact farm locations aren't published.
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
     from quality_tests qt where qt.batch_id = b.id)   as tests
from batches b
join products p           on p.batch_id  = b.id
join collection_events ce on ce.batch_id = b.id
left join stakeholders s_col on s_col.id  = b.collector_id
where p.status = 'active';

-- ── Row Level Security ──────────────────────────────────────────
alter table stakeholders       enable row level security;
alter table batches            enable row level security;
alter table collection_events  enable row level security;
alter table processing_events  enable row level security;
alter table quality_tests      enable row level security;
alter table anomalies          enable row level security;
alter table products           enable row level security;

-- authenticated (dashboard) users can read everything
create policy "authenticated read stakeholders" on stakeholders
  for select to authenticated using (true);
create policy "authenticated read batches" on batches
  for select to authenticated using (true);
create policy "authenticated read collection_events" on collection_events
  for select to authenticated using (true);
create policy "authenticated read processing_events" on processing_events
  for select to authenticated using (true);
create policy "authenticated read quality_tests" on quality_tests
  for select to authenticated using (true);
create policy "authenticated read anomalies" on anomalies
  for select to authenticated using (true);
create policy "authenticated read products" on products
  for select to authenticated using (true);

-- authenticated users can update anomaly status (review/dismiss) from the dashboard
create policy "authenticated update anomalies" on anomalies
  for update to authenticated using (true) with check (true);

-- anon (public) gets nothing on the base tables — only the view below
grant select on product_provenance to anon;
grant select on product_provenance to authenticated;

-- base tables: revoke default anon select (view runs with definer-ish access via grant above)
revoke all on stakeholders, batches, collection_events, processing_events,
  quality_tests, anomalies, products from anon;
