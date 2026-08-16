# AyurTrace

End-to-end traceability prototype for Ayurvedic herbs — Ashwagandha only, Supabase as the pseudo-blockchain.

*"From source to shelf, every step verified."*

See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for the original v1 design and
[`REALTIME_IMPLEMENTATION_PLAN.md`](./REALTIME_IMPLEMENTATION_PLAN.md) for what turned it into a
live system (real collector submissions, a tamper-evident ledger, real anomaly scoring).

**Full documentation set:**

- [`DEMO_GUIDE.md`](./DEMO_GUIDE.md) — how to present this project, script included
- [`PROJECT_DEEP_DIVE.md`](./PROJECT_DEEP_DIVE.md) — everything, at file/table-level detail
- [`ARCHITECTURE_AND_FLOWS.md`](./ARCHITECTURE_AND_FLOWS.md) — diagrams: architecture, ER, user/data flows
- [`SECURITY.md`](./SECURITY.md) — access-control model, threat model, known gaps

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Auth) · `qrcode` · `react-leaflet`

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase project values
```

Apply the schema and seed data to your Supabase project:

```bash
# via the Supabase SQL editor, or:
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

Run the app:

```bash
npm run dev   # http://localhost:3000
```

## Structure

- `app/(dashboard)` — internal stakeholder dashboard (auth required)
- `app/(consumer)` — public consumer verification portal (`/trace/[qrToken]`)
- `app/(collector)` — real field collector submission portal (auth required, collector accounts only)
- `app/api` — QR generation, collection-event submission, and anomaly-scoring endpoints
- `lib/supabase` — browser / server / service-role Supabase clients
- `supabase/migrations`, `supabase/seed.sql` — schema and seed data
