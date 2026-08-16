-- Phase C — link a real Supabase Auth account to a collector stakeholder so
-- field submissions can be attributed to a real person, not trusted from the
-- request body. Writes still go through the service-role-backed
-- /api/collection-events route (same pattern as /generate-qr), which looks
-- up the caller's stakeholder row by auth_user_id and ignores any
-- collector_id the client tries to send — no new insert RLS policy needed.

alter table stakeholders
  add column auth_user_id uuid references auth.users(id) unique;

create index stakeholders_auth_user_id_idx on stakeholders (auth_user_id);
