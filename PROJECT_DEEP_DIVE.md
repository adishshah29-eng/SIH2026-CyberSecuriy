# AyurTrace — Project Deep Dive

Full internals, A to Z, at the level of "which file does this, which table does that write to."
Written so a fresh LLM (or engineer) with zero prior context on this repo can reconstruct a
complete mental model from this document alone. Pairs with `ARCHITECTURE_AND_FLOWS.md` (diagrams)
and `DEMO_GUIDE.md` (how to present it). `SECURITY.md` covers the threat model and access-control
reasoning in more depth than the summary here.

---

## 1. What this project is

A prototype supply-chain traceability system for Ayurvedic herbs, scoped to one herb
(Ashwagandha) for v1. It has three faces:

1. **Stakeholder Dashboard** (`/overview`, `/batches`, `/traceability`, `/quality`, `/anomalies`,
   `/stakeholders`) — internal, authenticated, one shared role in v1 (no per-role dashboards).
2. **Consumer Portal** (`/trace/[qrToken]`) — public, no auth, reached by scanning a QR code on a
   physical product.
3. **Collector Portal** (`/submit`) — authenticated but scoped to one specific collector identity;
   a mobile-first form for submitting a real field collection event with device GPS.

Underneath: Supabase (Postgres + Auth) as the entire backend. No separate API server — Next.js
Route Handlers talk to Supabase directly, either via a cookie-bound client (respects RLS as the
signed-in user) or a service-role client (bypasses RLS, used only inside routes that have already
authorized the caller some other way).

## 2. Tech stack, precisely

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| DB / Auth | Supabase (Postgres 17 + Supabase Auth), accessed via `@supabase/ssr` and `@supabase/supabase-js` |
| QR generation | `qrcode` npm package, server-rendered PNG |
| Map | `react-leaflet` + OpenStreetMap tiles (no API key) |
| Package manager | npm (switched from an earlier pnpm setup — see `package-lock.json`) |
| Deployment target | Vercel (app) + Supabase (hosted project); `vercel.json` configures a cron job |

Node ≥ 20. There is no ORM — all queries go through the generated-by-hand Supabase JS client with
hand-written types in `lib/supabase/types.ts` (a real `supabase gen types typescript` run was used
during development to cross-check these, but the file is maintained by hand for the friendly type
aliases like `BatchStage`).

## 3. Repo layout, annotated

```
app/
  (dashboard)/            route group, authenticated, shared sidebar layout
    layout.tsx            auth guard: redirect to /login if no session
    overview/page.tsx      KPIs + ledger integrity badge + realtime subscription
    batches/page.tsx       batch table, stage filter, realtime subscription
    batches/[batchCode]/page.tsx   single batch: timeline, quality, QR, processing log
    traceability/page.tsx  batch selector -> fan-out chain-of-custody view
    quality/page.tsx       batch selector -> lab test results table
    anomalies/             AI Risk Monitoring page + actions.ts (server actions for review/dismiss)
    stakeholders/page.tsx  roster of collectors/processors/labs/manufacturers
  (consumer)/
    layout.tsx             minimal, no nav chrome, mobile-first
    trace/[qrToken]/       public product verification page (was [batchCode] until Phase B)
  (collector)/              NEW in Phase C — real field-submission portal
    layout.tsx              auth guard + "does this account map to a collector" guard
    submit/page.tsx          the submission form itself (client component)
  api/
    qr/[batchCode]/route.ts               GET -> PNG of the batch's QR code
    batches/[batchCode]/generate-qr/route.ts  POST -> creates the products row + qr_token
    collection-events/route.ts             NEW — POST -> real collector field submissions
    cron/score-anomalies/route.ts          NEW — GET, CRON_SECRET-gated -> statistical scoring
  login/page.tsx            shared login for both dashboard and collector accounts
  page.tsx                  root: redirects based on session + role lookup
  layout.tsx, globals.css   app shell

components/
  ui/                      shadcn-style primitives (button, card, table, input, badge)
  dashboard/               kpi-card, batch-timeline, traceability-graph, anomaly-card,
                           status-badge, sidebar, logout-button,
                           ledger-integrity-badge.tsx   NEW (Phase A)
                           realtime-refresher.tsx        NEW (Phase D)
  consumer/                verified-banner-equivalent sections live inline in the page;
                           origin-map.tsx (client, Leaflet) + origin-map-loader.tsx NEW (Phase B fix)

lib/
  supabase/
    client.ts              browser client (createBrowserClient)
    server.ts               cookie-bound server client (createServerClient) — respects RLS
    service.ts              service-role client — bypasses RLS, server-only
    types.ts                hand-maintained Database type (tables, views, functions)
  qr.ts                     generateQrToken(), buildQrUrl(token)
  format.ts                 formatDate/formatDateTime/formatKg, isValidBatchCode, isValidQrToken
  rate-limit.ts              in-memory per-key rate limiter
  geo.ts                    NEW (Phase C/E) — isWithinIndia(), haversineKm()
  utils.ts                  cn() class-merge helper

proxy.ts                    Next "proxy" (this fork's name for middleware — see AGENTS.md):
                            refreshes the Supabase auth cookie on every request, and applies
                            rate limiting to /trace/, /api/qr/, /api/collection-events

supabase/
  migrations/               0001 through 0006, applied in order (see § 5)
  seed.sql                  deterministic seed data (fixed UUIDs) — 15 batches, 18 stakeholders,
                            ~40 events/tests, 8 anomalies, 7 QR-generated products

vercel.json                 NEW (Phase E) — cron config for /api/cron/score-anomalies
SECURITY.md                  NEW — access-control model, written for an auditor
REALTIME_IMPLEMENTATION_PLAN.md   the plan this deep-dive is the "what actually happened" record of
IMPLEMENTATION_PLAN.md       the original v1 prototype plan (still accurate for what it covers)
```

## 4. Database schema, table by table

All tables live in the `public` schema of one Supabase Postgres project. RLS is **on** for every
table (see `SECURITY.md` for the full grant matrix). Six original tables + two added in this
phase of work.

### `stakeholders`
People/orgs in the network. `role` is one of `collector | processor | lab | manufacturer`.
**Added in Phase C**: `auth_user_id uuid references auth.users(id) unique` — links a real Supabase
Auth account to exactly one stakeholder row. Only populated for collectors who have a real login;
`null` for everyone else (they exist as data, not as accounts).

### `batches`
One row per herb batch. `current_stage` walks
`Collected → Processing → Lab Testing → Manufacturing → Verified → Failed`. `status` is
`Pending | Passed | Failed | Verified`. `batch_code` is the human-readable `ASH-###` label — no
longer used as a lookup key for public URLs (see Phase B below), but still shown in the UI and
used as the dashboard's internal reference.

### `collection_events`
One row per collection — GPS lat/lng, quantity, harvest zone, timestamp, which collector. In the
original seed data this is 1:1 with `batches` (one collection kicks off one batch). Real live
submissions (Phase C) follow the same shape.

### `processing_events`, `quality_tests`
Processing steps (drying, grinding, packaging) and lab test results (DNA authentication, moisture,
pesticide residue, foreign material) per batch. Straightforward child tables.

### `anomalies`
Risk flags. `anomaly_type` is a free-text label (`quantity_spike`, `gps_movement`,
`quantity_stat_outlier`, etc. — see § 8 for which mechanism writes which type).
`severity: low|medium|high`, `status: open|reviewed|dismissed`, `score: 0-100`.

### `products`
One row per QR-generated product. `qr_token` is the opaque public identifier (Phase B);
`qr_url` is the full public URL, e.g. `https://.../trace/qrt_ab12cd34...`.

### `ledger_entries` — **new, Phase A**
The tamper-evident ledger. See § 7 — this is the most important addition in this phase of work
and deserves its own section.

```sql
create table ledger_entries (
  id            bigint generated always as identity primary key,
  entity_table  text not null check (entity_table in
    ('collection_events', 'processing_events', 'quality_tests')),
  entity_id     uuid not null,
  payload_hash  text not null,   -- sha256 of the source row at insert time
  prev_hash     text not null,   -- previous entry's chain_hash (or 64 zeros for the first entry)
  chain_hash    text not null,   -- sha256(prev_hash || payload_hash || created_at)
  created_at    timestamptz not null default now()
);
```

### `product_provenance` (view, not a table)
The **only** thing `anon` can read. Joins `batches` + `products` + `collection_events` +
`stakeholders`, rounds GPS to 2 decimal places, and — as of Phase B — exposes `qr_token` so the
consumer page can be looked up by token instead of batch code.

## 5. Migrations, in order

| File | What it does |
|---|---|
| `0001_init.sql` | Original schema: 6 tables, `product_provenance` view, all RLS policies |
| `0002_ledger.sql` | `ledger_entries` table, the `append_ledger_entry()` `SECURITY DEFINER` trigger function, triggers on the three event tables, and a `do $$ ... $$` block that backfills the pre-existing seed rows into the chain |
| `0003_ledger_verify.sql` | `verify_ledger_chain()` — a `plpgsql` function that recomputes both chain linkage and source-row hashes and returns a per-entry pass/fail table |
| `0004_provenance_qr_token.sql` | Adds `qr_token` to the `product_provenance` view (appended at the end — Postgres won't let `CREATE OR REPLACE VIEW` reorder or insert columns before existing ones) and repoints any already-generated `qr_url` values at the token-based path |
| `0005_collector_auth.sql` | `stakeholders.auth_user_id`, unique, FK to `auth.users(id)` |
| `0006_realtime.sql` | Adds `batches`, `collection_events`, `anomalies` to the `supabase_realtime` publication |

Applied via `supabase db push` (the Supabase CLI run through `npx`, linked to the live project with
a personal access token — there's no local Postgres in this dev setup, everything happens against
the real hosted database, including seed data). `supabase migration list` confirms all six are in
sync between local files and the remote migration history table.

## 6. Auth model

Three kinds of identity share one underlying mechanism — Supabase Auth email+password:

1. **Dashboard user** — any Supabase Auth account not linked to a collector stakeholder. Lands on
   `/overview` after login. Full read access to everything, can write `anomalies.status`
   (review/dismiss) and trigger QR generation.
2. **Collector** — a Supabase Auth account where `stakeholders.auth_user_id` matches, and that
   stakeholder's `role = 'collector'`. Lands on `/submit` instead. The `(collector)` layout enforces
   this with a server-side lookup; if you're logged in but not mapped to a collector, you're bounced
   to `/overview`.
3. **Consumer** — no identity at all. `/trace/[qrToken]` and `/api/qr/[batchCode]` are public.

The root page (`app/page.tsx`) and the login page both do the same "does this user map to a
collector?" lookup after establishing a session, and redirect accordingly. This is a plain
`select` against `stakeholders` (allowed for any `authenticated` user per RLS), not a special
claim baked into the JWT — kept simple on purpose, no custom auth hooks.

## 7. The tamper-evident ledger, mechanically

This is the "makes it actually a security project" piece, so it gets a full walkthrough.

**Write path**: any `insert` into `collection_events`, `processing_events`, or `quality_tests`
fires `append_ledger_entry()` as an `AFTER INSERT` trigger. That function:

1. Computes `payload_hash = sha256(row_to_json(NEW))` — a hash of the exact row just inserted.
2. Looks up the most recent `ledger_entries.chain_hash` (or a 64-zero genesis hash if this is the
   very first entry).
3. Computes `chain_hash = sha256(prev_hash || payload_hash || now())`.
4. Inserts the new `ledger_entries` row.

No role has a direct `insert` grant on `ledger_entries` — the trigger function is
`SECURITY DEFINER`, so it's the *only* writer. You cannot add a ledger entry except by inserting a
real row into one of the three source tables.

**Verify path**: `verify_ledger_chain()` walks every `ledger_entries` row in `id` order and checks
two independent things per entry:

- **`chain_ok`**: does `prev_hash` actually match the previous entry's `chain_hash`, and does
  recomputing `sha256(prev_hash || payload_hash || created_at)` match the stored `chain_hash`?
  This catches anyone editing the ledger table itself.
- **`payload_ok`**: re-fetch the *current* live row from the source table (`collection_events` etc.
  by `entity_id`) and re-hash it. Does it match the `payload_hash` stored at insert time? This
  catches anyone editing the source table *without* touching the ledger at all — the more
  realistic attack, since the ledger table has no direct write grant but the source tables are
  written by the app's service-role key, which technically could edit anything if compromised.

If the source row was deleted entirely, `payload_ok` is `false` (there's nothing to re-hash
against).

**Verified by direct testing during development**: editing `collection_events.quantity_kg`
directly via the service-role key (bypassing the app entirely) and re-running
`verify_ledger_chain()` correctly returned `payload_ok: false` for exactly that entry, and nothing
else. Reverting the edit and re-running showed a fully clean chain again.

**UI surface**: `components/dashboard/ledger-integrity-badge.tsx` calls this RPC from the Overview
page on every load and renders a pass/fail badge with the count of entries and, if broken, which
entry broke first.

## 8. Anomaly detection — three independent mechanisms

It's worth being precise that there are **three separate places** anomalies get created, each
writing to the same `anomalies` table:

1. **Seed data** (`supabase/seed.sql`) — 8 hand-written anomalies for demo purposes, covering the
   full severity range including one dismissed and one normal/no-anomaly example.
2. **Inline submission-time check** (`app/api/collection-events/route.ts`) — when a collector
   submits a new event, the route compares the submitted quantity against that collector's own
   historical average (from their past `collection_events`). If it's more than 2.5x their average
   (and they have ≥3 prior events), it immediately writes an `anomaly_type: quantity_spike` row.
   This is a cheap first-line check at write time, not a statistical model.
3. **Scheduled scoring job** (`app/api/cron/score-anomalies/route.ts`) — the more rigorous pass,
   intended to run on a schedule (Vercel Cron, see `vercel.json`, every 15 minutes):
   - **`quantity_stat_outlier`**: for each collector with ≥3 events, computes the population mean
     and standard deviation of their quantities, and flags their *most recent* event if its
     z-score exceeds 2 (severity `high` above z=3).
   - **`gps_movement`**: for each collector's events sorted by time, computes the great-circle
     distance (`lib/geo.ts` `haversineKm`) and implied speed between consecutive submissions; flags
     anything implying >120 km/h (severity `high` above 300 km/h) as physically implausible.
   - Both checks are idempotent — before inserting, the route checks whether an anomaly with that
     exact `(batch_id, anomaly_type)` pair already exists, so re-running the cron doesn't create
     duplicates.
   - Guarded by `Authorization: Bearer $CRON_SECRET` so it can't be triggered by an arbitrary
     public request; Vercel Cron sends this header automatically when `CRON_SECRET` is set in the
     deployment environment.

**Verified during development**: two synthetic events for the same collector, 10 minutes apart but
~650km apart, correctly produced a `high`-severity, score-95 `gps_movement` anomaly with the
description dynamically describing the actual distance/time/speed computed.

No machine-learning model runs anywhere in this system — the original plan documented
`IsolationForest` as a v3 upgrade path once there's a Python-capable runtime and enough real data
to train on; the deterministic z-score/haversine rules here are explainable and require no extra
infrastructure, which was judged the right tradeoff for this stage.

## 9. QR codes and public URLs

- **Generation**: `POST /api/batches/[batchCode]/generate-qr` (dashboard-only, requires a session)
  — only works once a batch's `status = 'Verified'`, and only once per batch (checked before
  insert). Generates a random `qr_token` (`qrt_` + 12 random bytes, base64url), builds
  `qr_url = ${BASE_URL}/trace/${qr_token}`, and inserts the `products` row via the service-role
  client (the caller's session was already checked; `products` has no direct `authenticated`
  insert grant by design).
- **Image**: `GET /api/qr/[batchCode]` — still keyed by batch code (not token) because it's only
  ever fetched by the dashboard's `<img>` tag, which already knows the batch code from an
  authenticated context. Renders a 320×320 PNG server-side with the `qrcode` package, encoding the
  product's `qr_url` (the token-based public link).
- **Resolution**: `/trace/[qrToken]` — public, validates the token shape
  (`^qrt_[A-Za-z0-9_-]{10,32}$`), looks it up against `product_provenance.qr_token`, 404s via a
  custom not-found page on no match. Originally this route was `/trace/[batchCode]` — changed in
  Phase B specifically because sequential batch codes (`ASH-001`, `ASH-002`, ...) are trivially
  enumerable, letting anyone scrape every product in the system by guessing URLs. The map component
  (`origin-map.tsx`, a `"use client"` Leaflet component) is loaded via
  `origin-map-loader.tsx`'s `next/dynamic(..., { ssr: false })` wrapper — a fix discovered during
  this work: Leaflet's `L.divIcon()` touches `window`/`document` at module scope, which crashed
  server-side rendering and silently forced the whole page into client-only rendering before the
  fix.

## 10. Rate limiting

`lib/rate-limit.ts` is a tiny in-memory, single-process, per-key token-bucket limiter. Applied
centrally in `proxy.ts` (this fork's middleware) rather than scattered per-route:

| Path prefix | Limit |
|---|---|
| `/trace/` | 30 req/min per IP |
| `/api/qr/` | 30 req/min per IP |
| `/api/collection-events` | 20 req/min per IP |

Explicitly documented as not surviving multi-instance scale-out — fine for the current
single-server deployment shape, flagged in `SECURITY.md` as needing a shared store (e.g. Upstash
Redis) before that changes.

## 11. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=              # public, browser-safe
NEXT_PUBLIC_SUPABASE_ANON_KEY=         # public, browser-safe — RLS is what actually protects data
SUPABASE_SERVICE_ROLE_KEY=             # server-only, bypasses RLS — never bundled to the client
NEXT_PUBLIC_BASE_URL=                  # used to build QR URLs — must match how consumers reach the app
CRON_SECRET=                           # bearer token required by /api/cron/score-anomalies
```

## 12. What's still simulated vs. what's real (as of this phase of work)

| Capability | Status |
|---|---|
| Dashboard reads real live Supabase data | ✅ real |
| Consumer portal reads real live Supabase data | ✅ real |
| QR generation | ✅ real |
| Tamper-evident ledger | ✅ real, tested |
| Collector field submission (GPS, quantity, etc.) | ✅ real, tested end-to-end |
| Realtime dashboard updates on new submissions | ✅ implemented, correct per server logs/direct DB checks; not visually confirmed in one constrained test environment (see `REALTIME_IMPLEMENTATION_PLAN.md`) |
| Anomaly detection (statistical + GPS) | ✅ real, tested (not ML — deterministic rules, documented as intentional) |
| Immutable ledger via a real blockchain (Hyperledger Fabric etc.) | ❌ still simulated — the hash chain is a *strict subset* of what a real chain provides (tamper-evidence without distributed consensus); the original plan explicitly preserved the event shape so a chaincode layer could be dropped in later without changing the app |
| Per-role dashboards, regulator flow, SMS ingestion, IoT sensors, multi-herb support | ❌ out of scope, documented as such since the original plan |

## 13. How to run this from scratch

```bash
npm install
cp .env.local.example .env.local     # fill in real Supabase project values

# Link the Supabase CLI to your project (needs a personal access token from
# supabase.com/dashboard/account/tokens) and push all migrations:
npx supabase login --token <your-pat>
npx supabase link --project-ref <your-project-ref>
npx supabase db push

# Seed data (via Supabase SQL editor, or):
psql "$SUPABASE_DB_URL" -f supabase/seed.sql

npm run dev   # http://localhost:3000
```

To create a test collector account (there's no self-serve signup flow — collectors are provisioned
by whoever runs the backend):

```bash
# Create the auth user via the Supabase Admin API, then:
update stakeholders set auth_user_id = '<the new user id>'
where code = 'COL-001';   -- or whichever collector this account represents
```
