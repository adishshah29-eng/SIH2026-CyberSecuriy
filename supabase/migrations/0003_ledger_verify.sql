-- Phase A (cont.) — chain verification RPC.
-- Recomputes each entry's chain linkage and re-hashes the *current* source
-- row to detect both ledger tampering (edited hash/prev_hash) and source
-- tampering (edited collection_events/processing_events/quality_tests row
-- after the fact, which changes row_to_json() without touching the ledger).

create or replace function verify_ledger_chain()
returns table (
  entry_id      bigint,
  entity_table  text,
  entity_id     uuid,
  chain_ok      boolean,
  payload_ok    boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_prev_hash             text := repeat('0', 64);
  v_expected_chain_hash   text;
  v_current_payload       text;
  v_expected_payload_hash text;
begin
  for r in (select * from ledger_entries order by id asc) loop
    v_current_payload := case r.entity_table
      when 'collection_events' then (select row_to_json(ce)::text from collection_events ce where ce.id = r.entity_id)
      when 'processing_events' then (select row_to_json(pe)::text from processing_events pe where pe.id = r.entity_id)
      when 'quality_tests'     then (select row_to_json(qt)::text from quality_tests qt where qt.id = r.entity_id)
    end;

    v_expected_chain_hash := encode(
      extensions.digest(r.prev_hash || r.payload_hash || r.created_at::text, 'sha256'),
      'hex'
    );

    entry_id := r.id;
    entity_table := r.entity_table;
    entity_id := r.entity_id;
    chain_ok := (r.prev_hash = v_prev_hash) and (r.chain_hash = v_expected_chain_hash);

    if v_current_payload is null then
      payload_ok := false; -- source row was deleted
    else
      v_expected_payload_hash := encode(extensions.digest(v_current_payload, 'sha256'), 'hex');
      payload_ok := (v_expected_payload_hash = r.payload_hash);
    end if;

    return next;
    v_prev_hash := r.chain_hash;
  end loop;
end;
$$;

grant execute on function verify_ledger_chain() to authenticated;
