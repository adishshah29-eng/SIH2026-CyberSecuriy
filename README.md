# AyurTrace

End-to-end traceability prototype for Ayurvedic herbs — Ashwagandha only, Supabase as the pseudo-blockchain.

*"From source to shelf, every step verified."*

See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for the full design: schema, routes, phases, and demo script.

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
- `app/(consumer)` — public consumer verification portal (`/trace/[batchCode]`)
- `app/api` — QR generation + PNG rendering endpoints
- `lib/supabase` — browser / server / service-role Supabase clients
- `supabase/migrations`, `supabase/seed.sql` — schema and seed data
