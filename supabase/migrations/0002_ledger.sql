-- Phase A — tamper-evident ledger via SHA-256 hash chaining.
-- Every insert into collection_events / processing_events / quality_tests
-- gets an append-only ledger_entries row whose chain_hash incorporates the
-- previous entry's hash. Editing or deleting a past row breaks the chain
-- from that point forward, which /api/ledger/verify can detect.

create table ledger_entries (
  id            bigint generated always as identity primary key,
  entity_table  text not null check (entity_table in
    ('collection_events', 'processing_events', 'quality_tests')),
  entity_id     uuid not null,
  payload_hash  text not null,
  prev_hash     text not null,
  chain_hash    text not null,
  created_at    timestamptz not null default now()
);

create unique index ledger_entries_chain_hash_idx on ledger_entries (chain_hash);
create index ledger_entries_entity_idx on ledger_entries (entity_table, entity_id);
create index ledger_entries_id_idx on ledger_entries (id);

-- ── Chain-building trigger ──────────────────────────────────────
-- Runs as SECURITY DEFINER so it works regardless of which role performs
-- the triggering insert; ledger_entries itself has no direct insert grant
-- for anyone, so the only way to add an entry is through this trigger.
create or replace function append_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_payload_hash text;
  v_prev_hash    text;
  v_chain_hash   text;
  v_genesis      constant text := repeat('0', 64);
begin
  v_payload_hash := encode(extensions.digest(row_to_json(NEW)::text, 'sha256'), 'hex');

  select chain_hash into v_prev_hash
  from ledger_entries
  order by id desc
  limit 1;

  if v_prev_hash is null then
    v_prev_hash := v_genesis;
  end if;

  v_chain_hash := encode(
    extensions.digest(v_prev_hash || v_payload_hash || now()::text, 'sha256'),
    'hex'
  );

  insert into ledger_entries (entity_table, entity_id, payload_hash, prev_hash, chain_hash)
  values (TG_TABLE_NAME, NEW.id, v_payload_hash, v_prev_hash, v_chain_hash);

  return NEW;
end;
$$;

create trigger collection_events_ledger_trigger
  after insert on collection_events
  for each row execute function append_ledger_entry();

create trigger processing_events_ledger_trigger
  after insert on processing_events
  for each row execute function append_ledger_entry();

create trigger quality_tests_ledger_trigger
  after insert on quality_tests
  for each row execute function append_ledger_entry();

-- ── Backfill existing seed rows into the chain ──────────────────
-- Walks the three source tables in created/tested order so the seed data
-- (inserted before this migration existed) is also covered by the chain.
do $$
declare
  r record;
  v_prev_hash    text := repeat('0', 64);
  v_payload_hash text;
  v_chain_hash   text;
begin
  for r in (
    select 'collection_events' as tbl, ce.id, ce.collected_at as ordering_key, row_to_json(ce) as payload
    from collection_events ce
    union all
    select 'processing_events', pe.id, pe.start_time, row_to_json(pe)
    from processing_events pe
    union all
    select 'quality_tests', qt.id, qt.tested_at, row_to_json(qt)
    from quality_tests qt
    order by ordering_key
  ) loop
    v_payload_hash := encode(extensions.digest(r.payload::text, 'sha256'), 'hex');
    v_chain_hash := encode(extensions.digest(v_prev_hash || v_payload_hash || now()::text, 'sha256'), 'hex');

    insert into ledger_entries (entity_table, entity_id, payload_hash, prev_hash, chain_hash)
    values (r.tbl, r.id, v_payload_hash, v_prev_hash, v_chain_hash);

    v_prev_hash := v_chain_hash;
  end loop;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────
alter table ledger_entries enable row level security;

create policy "authenticated read ledger_entries" on ledger_entries
  for select to authenticated using (true);

revoke all on ledger_entries from anon;
-- No insert/update/delete policy for anyone — the SECURITY DEFINER trigger
-- is the only writer, which is the point.
