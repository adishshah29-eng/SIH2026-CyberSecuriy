# Security notes

How AyurTrace enforces the guarantees in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) §17
and [`REALTIME_IMPLEMENTATION_PLAN.md`](./REALTIME_IMPLEMENTATION_PLAN.md). Written for whoever
audits this next — an engineer picking the project back up, or a reviewer.

## Threat model

See `REALTIME_IMPLEMENTATION_PLAN.md` §1 for the full STRIDE table. Summary: once field data
flows in from real collectors, the trust boundary that matters is **untrusted collector device →
API → DB**. Everything below is built around that boundary.

## Identity & access

- **Dashboard**: single Supabase Auth "authenticated" role, no per-row RLS distinctions between
  stakeholder types (a deliberate v1 scope decision — see `IMPLEMENTATION_PLAN.md` §12). Anyone
  with dashboard credentials can read everything and update `anomalies.status`.
- **Collectors**: a `stakeholders.auth_user_id` column links a specific Supabase Auth account to
  one collector record. Field submissions never trust a client-supplied `collector_id` — every
  write route (`/api/collection-events`) re-derives the caller's identity server-side from
  `auth.getUser()` before touching the database.
- **Consumers**: fully anonymous. `anon` has zero grants on base tables — only on the
  `product_provenance` view, which itself hides PII (collector name is not exposed; the API
  returns a static "Verified Supplier" label) and rounds GPS coordinates to 2dp so exact farm
  locations aren't published.
- **Service role key** (`SUPABASE_SERVICE_ROLE_KEY`) is server-only, never bundled to the client,
  and only used inside route handlers that have already verified a session — see
  `/api/batches/[batchCode]/generate-qr` and `/api/collection-events` for the pattern.

## Writes are routed, not RLS-open

None of `batches`, `collection_events`, `processing_events`, `quality_tests`, or `products` grant
`insert`/`update` to the `authenticated` role directly. Every write goes through a specific route
handler that validates the request and then uses the service-role client. This means the actual
write surface is exactly the set of routes in this repo — not "anything a valid session can do to
these tables."

## Tamper-evident ledger

`collection_events`, `processing_events`, and `quality_tests` inserts are hash-chained into
`ledger_entries` by a `SECURITY DEFINER` trigger (`supabase/migrations/0002_ledger.sql`) — no role
has a direct insert grant on `ledger_entries`, so the trigger is the only writer.

- `payload_hash` = SHA-256 of the inserted row at insert time.
- `chain_hash` = SHA-256(`prev_hash` + `payload_hash` + `created_at`), linking each entry to the
  one before it.
- `verify_ledger_chain()` (migration `0003`) recomputes both the chain linkage *and* re-hashes the
  **current** source row, so it catches both: someone editing `ledger_entries` directly, and
  someone editing `collection_events` etc. after the fact without touching the ledger at all.
- The Overview page calls this on every load and shows a pass/fail badge. A `service_role` key
  leak that edits history is provably detectable, not just prevented-in-theory.
- **Verified by direct test**: editing a live row via the service-role key and re-running
  `verify_ledger_chain()` correctly flags `payload_ok: false` on the affected entry (see commit
  history / session notes for the exact repro).

## Rate limiting

`proxy.ts` applies an in-memory, per-IP rate limit to every request under `/trace/`, `/api/qr/`,
and `/api/collection-events` (see `RATE_LIMITED_PREFIXES` in that file). This is a single-process
limiter (`lib/rate-limit.ts`) — fine for the current deployment shape, but swap for a shared store
(e.g. Upstash Redis) before running multiple server instances, since each instance would otherwise
track its own counters.

## QR / consumer URLs

`/trace/[qrToken]` and QR codes resolve by an opaque `qr_token` (`qrt_...`, 12 random bytes),
**not** by batch code — batch codes are sequential (`ASH-001`, `ASH-002`, ...) and would otherwise
let anyone enumerate the entire product catalog by guessing URLs.

## Scoring job

`/api/cron/score-anomalies` requires `Authorization: Bearer $CRON_SECRET` — set `CRON_SECRET` in
the deployment environment and Vercel Cron (see `vercel.json`) sends it automatically. It runs
with the service-role client but only ever `select`s events/anomalies and `insert`s into
`anomalies` — it doesn't need, and doesn't have, broader access than that in practice (the service
role key is project-wide, so this is enforced by code discipline here, not a scoped DB role; a
follow-up would be a dedicated Postgres role with `select`-only + `insert`-on-`anomalies` grants).

## Known gaps (not fixed, documented on purpose)

- Rate limiter is in-memory — see above.
- Service-role key is used broadly rather than issuing narrowly-scoped Postgres roles per job
  (scoring job, QR generation, collector submissions all share one key). Fine for a prototype;
  a real deployment should split these.
- No per-role dashboard gating (a collector account can view the full dashboard) — deliberate v1
  scope decision inherited from the original plan, not an oversight.
