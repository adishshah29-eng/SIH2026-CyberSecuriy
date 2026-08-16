# AyurTrace — Implementation Plan (Prototype v1)

**One herb: Ashwagandha. Supabase as pseudo-blockchain. Web-only.**
Tagline: *"From source to shelf, every step verified."*

The prototype demonstrates one vertical slice end-to-end:

```
Collection → Validation → Processing → Lab Testing → Manufacturing → QR → Consumer
```

---

## 1. Scope (what we ARE building)

- **Stakeholder Dashboard** (internal web app) with 6 sections.
- **Consumer Portal** (public web page opened by scanning a QR).
- **Supabase** (Postgres) as the ledger stand-in, prepopulated with 10–15 Ashwagandha batches and supporting rows.
- **QR generation** for each batch, resolving to `/trace/<batch_code>`.
- **Simulated AI anomalies** (rows in Supabase, no ML in v1).
- **Simple auth** — one login for the dashboard; consumer portal is public.

## 2. Non-goals (explicitly OUT of v1)

- Real Hyperledger Fabric / chaincode
- Real SMS fallback (Twilio)
- Multiple herbs
- Collector mobile app (React Native)
- IoT / ERP integration
- Real regulator integration
- Production-grade ML (Isolation Forest deferred)
- Per-role dashboards (one dashboard, role shown as metadata)

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | Single codebase serves both dashboard and consumer portal via route groups |
| UI | Tailwind CSS + shadcn/ui + lucide-react | Fast, consistent, demo-ready |
| DB / Auth | Supabase (Postgres + Auth) | Ships fastest; RLS available if needed later |
| QR | `qrcode` (server-side PNG generation) | Simple |
| Map | `react-leaflet` + OpenStreetMap tiles | No API key needed |
| Charts (optional) | `recharts` | Only for KPI trendlines |
| Package manager | `pnpm` | |

**Node** ≥ 20. **Deployment target:** Vercel (dashboard + consumer) + Supabase hosted project.

## 4. Repo structure

```
/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx              # sidebar + header
│   │   ├── login/page.tsx
│   │   ├── overview/page.tsx       # KPI command center
│   │   ├── batches/
│   │   │   ├── page.tsx            # table
│   │   │   └── [batchCode]/page.tsx # details + timeline + QR
│   │   ├── traceability/page.tsx   # visual chain-of-custody
│   │   ├── quality/page.tsx        # lab results
│   │   ├── anomalies/page.tsx      # AI risk monitoring
│   │   └── stakeholders/page.tsx
│   ├── (consumer)/
│   │   ├── layout.tsx              # minimal, mobile-first
│   │   └── trace/[batchCode]/page.tsx
│   ├── api/
│   │   ├── qr/[batchCode]/route.ts # returns PNG
│   │   └── batches/[batchCode]/generate-qr/route.ts
│   ├── layout.tsx                  # root
│   └── globals.css
├── components/
│   ├── ui/                         # shadcn primitives
│   ├── dashboard/
│   │   ├── kpi-card.tsx
│   │   ├── batch-table.tsx
│   │   ├── batch-timeline.tsx
│   │   ├── traceability-graph.tsx
│   │   ├── quality-table.tsx
│   │   ├── anomaly-card.tsx
│   │   └── stakeholder-summary.tsx
│   └── consumer/
│       ├── verified-banner.tsx
│       ├── journey-steps.tsx
│       ├── quality-checks.tsx
│       └── sustainability-checks.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # browser client
│   │   ├── server.ts               # server client (RSC)
│   │   └── types.ts                # generated types
│   ├── qr.ts                       # QR helpers
│   └── format.ts
├── supabase/
│   ├── migrations/
│   │   └── 0001_init.sql
│   └── seed.sql                    # prepopulated data
├── public/
├── .env.local.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
├── README.md
└── IMPLEMENTATION_PLAN.md          # this file
```

## 5. Supabase schema

Six tables, matching the ChatGPT plan. Kept simple; no over-modeling.

```sql
-- supabase/migrations/0001_init.sql

create extension if not exists "pgcrypto";

-- Reference / actor tables kept minimal — for the dashboard "Stakeholders" tile.
create table stakeholders (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,         -- COL-004, PROC-01, LAB-02, MFG-03
  role          text not null check (role in ('collector','processor','lab','manufacturer')),
  name          text not null,
  location      text,
  verified      boolean not null default true,
  created_at    timestamptz not null default now()
);

create table batches (
  id                uuid primary key default gen_random_uuid(),
  batch_code        text unique not null,      -- ASH-001
  herb_name         text not null default 'Ashwagandha',
  quantity_kg       numeric not null,
  collection_date   date not null,
  current_stage     text not null check (current_stage in
    ('Collected','Processing','Lab Testing','Manufacturing','Verified','Failed')),
  status            text not null check (status in
    ('Pending','Passed','Failed','Verified')),
  collector_id      uuid references stakeholders(id),
  origin_location   text not null,             -- "Nashik, Maharashtra"
  created_at        timestamptz not null default now()
);

create index on batches (current_stage);
create index on batches (status);
create index on batches (collection_date desc);

create table collection_events (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references batches(id) on delete cascade,
  collector_id   uuid not null references stakeholders(id),
  latitude       double precision not null,
  longitude      double precision not null,
  location_name  text not null,
  quantity_kg    numeric not null,
  collected_at   timestamptz not null,
  harvest_zone   text not null,
  season_valid   boolean not null default true
);

create index on collection_events (batch_id);

create table processing_events (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references batches(id) on delete cascade,
  processor_id    uuid references stakeholders(id),
  process_type    text not null,               -- Drying / Grinding / Packaging
  start_time      timestamptz not null,
  end_time        timestamptz,
  notes           text
);

create index on processing_events (batch_id);

create table quality_tests (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references batches(id) on delete cascade,
  lab_id            uuid references stakeholders(id),
  test_type         text not null,             -- Moisture / Pesticide / DNA / Foreign Material
  value             text not null,             -- "8.2%", "0.03 ppm", "Match", "0.4%"
  threshold         text not null,             -- "< 12%", ...
  status            text not null check (status in ('Passed','Failed')),
  tested_at         timestamptz not null,
  certificate_url   text
);

create index on quality_tests (batch_id);

create table anomalies (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid references batches(id) on delete cascade,
  stakeholder_id uuid references stakeholders(id),
  anomaly_type   text not null,               -- quantity_spike / gps_movement / timing / quality
  severity       text not null check (severity in ('low','medium','high')),
  description    text not null,
  score          numeric not null check (score between 0 and 100),
  status         text not null default 'open' check (status in ('open','reviewed','dismissed')),
  detected_at    timestamptz not null default now()
);

create index on anomalies (severity, status);

create table products (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references batches(id) on delete cascade,
  product_name      text not null,            -- "Ashwagandha Root Powder 250g"
  manufacturer_id   uuid references stakeholders(id),
  manufactured_at   timestamptz not null,
  qr_token          text unique not null,     -- opaque token used in /trace/<code>
  qr_url            text not null,            -- full public URL
  status            text not null default 'active' check (status in ('active','recalled'))
);

create index on products (batch_id);
```

### RLS strategy (v1, deliberately light)

- `anon` role: `select` allowed on the join needed for the consumer portal — read-only view of a single batch by `batch_code`. No other tables exposed.
- `authenticated` role: full `select` on everything, `insert/update` on `batches`, `anomalies.status`, `products`.

For v1 we'll implement this as **one Postgres view** the consumer route reads from, and keep RLS `on` with a single `select` policy on that view.

## 6. Seed data plan

`supabase/seed.sql` populates:

- **10 collectors** (`COL-001` .. `COL-010`), across Nashik / Satara / Pune / Nagpur / Aurangabad.
- **3 processors** (`PROC-01..03`).
- **2 labs** (`LAB-01..02`).
- **3 manufacturers** (`MFG-01..03`).
- **15 batches** (`ASH-001` .. `ASH-015`) spread across statuses:
  - 7 × Verified (full chain, product + QR generated)
  - 3 × Manufacturing
  - 2 × Lab Testing
  - 2 × Processing
  - 1 × Failed QA (the star of the anomaly page)
- **~40 collection_events / processing_events / quality_tests** with realistic values (moisture 6–10%, pesticide 0.02–0.09 ppm, DNA Match, etc.).
- **~8 anomalies** including:
  - HIGH: `ASH-009` quantity spike (normal 80–120 kg, recorded 260 kg, score 91)
  - MEDIUM: `COL-007` GPS anomaly (312 km in 18 min)
  - MEDIUM: `ASH-004` failed pesticide threshold
  - a few LOW / dismissed to show variety
- **7 products** (one per Verified batch), each with a `qr_token` and `qr_url`.

Seed script is deterministic (fixed UUIDs) so screenshots and the demo stay stable.

## 7. Routes & pages

| Route | Purpose | Auth |
|---|---|---|
| `/login` | Dashboard sign-in | public |
| `/overview` | KPI command center | dashboard |
| `/batches` | Sortable/filterable table | dashboard |
| `/batches/[batchCode]` | Batch details + timeline + Generate QR | dashboard |
| `/traceability` | Selectable batch → visual chain-of-custody graph | dashboard |
| `/quality` | Lab results table across batches | dashboard |
| `/anomalies` | AI risk monitoring cards | dashboard |
| `/stakeholders` | Suppliers / processors / labs / manufacturers roster | dashboard |
| `/trace/[batchCode]` | **Public** consumer verification page | public |
| `/api/qr/[batchCode]` | Returns PNG of the QR | public |
| `/api/batches/[batchCode]/generate-qr` | Creates `products` row + returns QR URL | dashboard |

Root `/` redirects: → `/overview` if logged in, else `/login`.

## 8. Dashboard sections (detail)

### 8.1 Overview / Command Center
- 4 KPI cards: Active Batches, Passed QA, In Processing, Risk Alerts.
- Below: Total Ashwagandha collected (kg), Batches this month, Failed quality tests, Verified suppliers.
- Optional small trendline for "batches per week" using `recharts`.
- All counts computed from Supabase in a single RSC.

### 8.2 Batch Management
- Table: `Batch ID | Collection Date | Source | Quantity | Stage | Quality | Status`
- Status uses emoji + colored badge (✅ / 🟡 / 🔴).
- Row click → `/batches/[batchCode]`.
- Detail page shows:
  - Header (batch code, herb, origin, date, quantity, current stage, status badge).
  - **Vertical timeline**: Collected → GPS Verified → Processed → Lab Tested → Manufactured → QR Generated. Each step shows completed/pending state and the source row it was derived from.
  - **Generate QR** button (disabled unless `status = 'Verified'` and no `products` row exists yet).

### 8.3 Traceability
- Batch selector (dropdown of Verified/Manufacturing batches).
- Renders a fan-out diagram: batch → Collection / Processing / Quality branches → Manufacturing → Final Product → QR.
- SVG-based, not a library — keeps the page fast and demo-crisp.

### 8.4 Quality & Compliance
- Batch selector.
- Table: `Test | Result | Threshold | Status` (Moisture / Pesticide / DNA / Foreign Material).
- Big overall banner: ✅ PASSED / 🔴 FAILED.
- Certificate download link if `certificate_url` present.

### 8.5 AI Risk Monitoring (Anomalies)
- List of anomaly cards, grouped by severity (HIGH → MEDIUM → LOW).
- Each card: title, batch/stakeholder, description, anomaly score bar, "Mark Reviewed" / "Dismiss" actions.
- One "NORMAL" example card at the bottom so the empty-good-state is visible.

### 8.6 Stakeholders
- 4 role summary tiles (Collectors 12 · Processors 3 · Labs 2 · Manufacturers 4).
- Table below with each stakeholder, code, location, verified badge, batches touched.

## 9. Consumer Portal (`/trace/[batchCode]`)

Distinct visual identity from the dashboard — full-width, minimal, mobile-first, no navigation chrome.

```
🌿 Ashwagandha
✅ Verified Product

Batch ASH-001 · Manufactured 18 Aug 2026 · Origin: Nashik, Maharashtra

── 🌱 Source ─────────────────────────
Nashik, Maharashtra   [ view on map ]   collected 12 Aug 2026 by Verified Supplier

── 🔄 Journey ───────────────────────
🌿 Collected  ✓
📍 Origin Verified  ✓
🏭 Processed  ✓
🧪 Lab Tested  ✓
💊 Manufactured  ✓

── 🧪 Quality ────────────────────────
DNA Authentication  ✅
Moisture Test        ✅
Pesticide Test       ✅

── 🌱 Sustainability ────────────────
Sustainable Source     ✅
Approved Harvest Zone  ✅
Seasonal Compliance    ✅

Product successfully verified through the traceability network.
```

Reads from a single Postgres view `product_provenance` that joins the six tables by `batch_code`. Server-rendered. Unknown code → 404 page with a "This product could not be verified" message.

## 10. QR flow

1. On `/batches/[batchCode]`, click **Generate QR** (only when batch is Verified).
2. `POST /api/batches/[batchCode]/generate-qr`:
   - Insert `products` row with `qr_token = base32(random(16 bytes))` and `qr_url = ${PUBLIC_BASE_URL}/trace/${batchCode}`.
3. Dashboard shows the generated QR (via `<img src="/api/qr/[batchCode]">`).
4. `GET /api/qr/[batchCode]` server-renders a PNG with the `qrcode` package.
5. Scan on phone → `/trace/[batchCode]` → consumer portal.

**Note on tokens (v1):** the URL uses `batchCode` for demo clarity; `qr_token` is stored but not required in the URL. Post-prototype we swap the URL to `/trace/<qr_token>` so batch codes aren't guessable.

## 11. AI anomalies (simulated in v1)

- No model. `anomalies` rows are seeded.
- The Anomalies page reads them as-is.
- Card copy is generated deterministically from `anomaly_type` + fields (e.g. `quantity_spike` → "Unusual quantity increase. Normal: 80–120 kg. Recorded: 260 kg.").
- "Mark reviewed" / "Dismiss" writes back to `anomalies.status`.
- Anomaly *count* on the Overview KPI = `count(*) where status = 'open'`.

Post-v1 (documented, not built): replace the seed script with a nightly job that scores batches with `sklearn.ensemble.IsolationForest` on `[quantity_kg, collection_lat, collection_lng, hours_between_events]` and writes rows to the same table. Zero UI change required.

## 12. Auth & roles

- Supabase Auth, email + password.
- One demo user for the pitch: `demo@ayurtrace.local` / `AyurTrace!2026`.
- All `(dashboard)` routes wrapped in a server-side auth check via a `layout.tsx` guard that redirects to `/login` when no session.
- `(consumer)` and `/api/qr/*` are public.
- Role column exists on `stakeholders` but is used for display only in v1 (no per-role gating).

## 13. Environment variables

`.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-only, used for seed + qr generation
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only, never bundled to the client.

## 14. Bootstrap (fresh clone → running app)

```bash
pnpm install
cp .env.local.example .env.local     # fill in Supabase project values

# apply schema + seed to your Supabase project
supabase db push                      # or run supabase/migrations/0001_init.sql via SQL editor
psql "$SUPABASE_DB_URL" -f supabase/seed.sql

pnpm dev                              # http://localhost:3000
```

## 15. Implementation phases

Each phase is a merge-ready increment. Ship in order.

**Phase 0 — Repo + toolchain (day 1)**
- `pnpm create next-app`, TS + App Router + Tailwind.
- Install shadcn/ui, lucide-react, `@supabase/ssr`, `@supabase/supabase-js`, `qrcode`, `react-leaflet`, `leaflet`.
- Commit `.env.local.example`, README.md, this plan.

**Phase 1 — Supabase schema + seed (day 1)**
- Author `0001_init.sql`, apply.
- Author `seed.sql` for 15 batches / 18 stakeholders / events / tests / anomalies / 7 products.
- Generate typed client with `supabase gen types typescript`.

**Phase 2 — Auth + dashboard shell (day 2)**
- `/login` with Supabase Auth.
- `(dashboard)/layout.tsx` with sidebar, header, auth guard.
- Placeholder pages for all 6 sections.

**Phase 3 — Overview + Batches (day 2)**
- KPI cards + counts.
- Batch table + row navigation.
- Batch detail page with header + timeline.

**Phase 4 — Traceability + Quality + Anomalies + Stakeholders (day 3)**
- SVG traceability graph.
- Quality table + banner.
- Anomaly cards + review/dismiss actions.
- Stakeholders roster.

**Phase 5 — QR + Consumer portal (day 4)**
- `POST /api/batches/[code]/generate-qr`.
- `GET /api/qr/[code]` PNG.
- `product_provenance` view.
- `/trace/[code]` public page (Source / Journey / Quality / Sustainability sections).
- Leaflet map preview for origin coords.

**Phase 6 — Polish + demo prep (day 5)**
- Loading + empty states.
- Small trendline on Overview.
- Deploy to Vercel; verify a real phone scan of a printed QR opens the consumer page.
- Freeze seed data.

## 16. Demo script (memorize this)

1. Open dashboard → `/overview`. Point to KPIs: **15 Active Batches, 12 QA Passed, 2 AI Alerts**.
2. Click **ASH-001**. Walk the timeline.
3. Say the line: *"Collection → Processing → Laboratory → Manufacturing — every step captured as an event."*
4. Go to **Anomalies**. Click the HIGH alert on `ASH-009`. Read the description. Say: *"The system detected an unusual harvesting quantity compared to historical collection behavior."*
5. Back to `ASH-001`. Click **Generate QR**. QR appears.
6. Scan with a phone. Opens `/trace/ASH-001`.
7. Show consumer view: Origin ✅ · Processing ✅ · Lab Tests ✅ · Authenticity ✅ · Sustainability ✅.
8. Close with: *"The same batch our stakeholder monitors internally can be independently verified by any consumer."*

## 17. Security notes (kept in mind while building)

Not shipping a security product, but the prototype touches enough real surfaces to warrant these:

- **Supabase keys.** Never bundle the service-role key. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` reach the browser.
- **RLS on.** Even for the prototype, leave RLS enabled and add explicit `select` policies. A "just for demo" open table has a habit of surviving to production.
- **QR URLs are unauthenticated but not unbounded.** Rate-limit `/api/qr/*` and `/trace/*` with a tiny in-memory limiter (fine for demo scale). Post-v1: replace `batchCode` in the URL with `qr_token` so codes aren't enumerable.
- **Anomaly write actions** on the dashboard are protected by the auth guard — no unauthenticated `POST`.
- **Consumer portal shows no PII.** Collector's name shows as "Verified Supplier" on the public page; the internal code stays server-side.
- **Coords rounded** on the public page (2 decimals) so we don't publish exact farm locations.
- **No user input reflected raw.** All batch codes go through a `^[A-Z]{3}-\d{3}$` validator on both route handlers and pages.

---

## Appendix A — Postgres view for the consumer portal

```sql
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
  (select bool_and(status = 'Passed')
     from quality_tests where batch_id = b.id)   as all_tests_passed,
  (select json_agg(json_build_object(
       'test_type', test_type,
       'status',    status))
     from quality_tests where batch_id = b.id)   as tests
from batches b
join products p          on p.batch_id     = b.id
join collection_events ce on ce.batch_id   = b.id
left join stakeholders s_col on s_col.id   = b.collector_id
where p.status = 'active';

grant select on product_provenance to anon;
```

## Appendix B — Realistic seed values (Ashwagandha)

| Field | Realistic range |
|---|---|
| Quantity per batch | 60–160 kg (spike case 260 kg) |
| Moisture | 6–10 % (threshold < 12 %) |
| Pesticide residue | 0.01–0.09 ppm (threshold < 0.1 ppm) |
| DNA authentication | Match / No match |
| Foreign material | 0.1–0.9 % (threshold < 1 %) |
| Harvest zones | "Approved Zone A/B/C" in Nashik / Satara / Pune / Nagpur / Aurangabad |
| Processing types | Drying (24–48 h) → Grinding (2–4 h) → Packaging (1–2 h) |

## Appendix C — What we deliberately did NOT design

- No offline sync layer — no collector app in v1.
- No SMS ingestion — same reason.
- No smart-contract layer — the "immutable ledger" is a Postgres table for v1; the plan preserves the *event shape* so a Fabric chaincode can be dropped in later without changing the dashboard.
- No per-role dashboards — one dashboard for all roles.
- No regulator flow — Verified badge on the batch stands in.
