-- Phase D — put the tables the dashboard should live-update from onto the
-- Realtime publication. RLS still applies to who receives change events, so
-- this only reaches the "authenticated" dashboard session, never anon.
alter publication supabase_realtime add table batches;
alter publication supabase_realtime add table collection_events;
alter publication supabase_realtime add table anomalies;
