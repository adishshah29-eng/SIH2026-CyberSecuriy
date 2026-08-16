# AyurTrace — Real-Time & Security Hardening Plan (v2)

Builds on [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md), which is now fully implemented and tested (see test notes at bottom). This plan closes the three gaps that make the current build a **demo** rather than a **working system**:

1. Data is hand-seeded, not submitted live from the field.
2. Anomalies are pre-seeded rows, not computed from real behavior.
3. The "ledger" is a plain Postgres table — nothing stops a `service_role` key holder (or a compromised admin session) from silently editing history.

Threat model and security controls below come from three skills in the `Anthropic-Cybersecurity-Skills` repo: **OWASP Threat Dragon threat modeling** (STRIDE), **log integrity via hash chaining**, and **OWASP API Security Top 10**. This project is a supply-chain-integrity system, so tamper-evidence and API abuse resistance are the actual product, not an afterthought.

---

## 1. Threat model (STRIDE, condensed)

New trust boundary once field submission exists: **untrusted collector device → API → DB**. That boundary is where nearly every new risk lives.

| # | Element | Threat (STRIDE) | Scenario | Mitigation |
|---|---|---|---|---|
| 1 | Collector submission API | Spoofing | Anyone with the URL posts fake batches as a real collector | Collector auth (short-lived signed link or Supabase Auth account per collector), not an open POST |
| 2 | Collector submission API | Tampering | Client sends fabricated GPS/quantity to hide a real anomaly | Server-side plausibility checks (§3) run before insert, independent of client-reported values |
| 3 | `batches`/`collection_events` tables | Tampering | `service_role` key leak → silent row edit, no trace | Hash-chained ledger (§4) — any edit breaks the chain and is detectable |
| 4 | Anomaly write actions | Repudiation | Dashboard user dismisses a real anomaly, no record of who/why | Already logged via `auth.uid()`; add `reviewed_by`, `review_reason` columns (§5) |
| 5 | `/api/qr/*`, `/trace/*` | Information Disclosure | Enumerating batch codes (`ASH-001..999`) scrapes the whole ledger | Already rate-limited (`lib/rate-limit.ts`); switch URL to opaque `qr_token` (already flagged as post-v1 in original plan — do it now) |
| 6 | Collector submission API | Denial of Service | Scripted flood of fake submissions | Rate limit per collector identity + per IP, Supabase Auth required (removes anonymous flood vector) |
| 7 | Anomaly scoring job | Elevation of Privilege | Scoring job runs with `service_role` and also serves user requests if merged into a web route | Run scoring as an isolated cron/edge function with only the DB grants it needs, not the main app's service key |

---

## 2. Pillar 1 — Live collector submissions

**Goal:** a collector genuinely in the field can submit a real event and see it reflected on the dashboard within seconds.

- New route: `app/(collector)/submit/page.tsx` — mobile-first form (reuse consumer portal's minimal layout style), fields: batch selection/new-batch, quantity, harvest zone, photo (optional), and **browser Geolocation API** (`navigator.geolocation.getCurrentPosition`) for lat/lng — never manually typed, so it can't be trivially spoofed by a lazy client.
- New Supabase Auth role: `collector` accounts (one per `stakeholders.code`), separate from the dashboard `authenticated` demo user. RLS: a collector can only `insert` events tagged with their own `collector_id`.
- New API route: `app/api/collection-events/route.ts` (`POST`) — validates payload shape (zod schema), re-checks the caller's `collector_id` from their JWT (never trusts a client-supplied `collector_id`), runs the plausibility checks from §3, then inserts.
- **Live dashboard updates:** subscribe the Overview/Batches pages to Supabase Realtime (`supabase.channel('batches-changes').on('postgres_changes', ...)`) so KPIs update without a manual refresh when a new event lands. This is the actual "real-time" part — swap the current one-shot RSC fetch for an RSC initial load + client-side realtime patch, same pattern used for the anomaly "Mark Reviewed" button already.

## 3. Pillar 2 — Real anomaly detection

**Goal:** anomalies come from an actual model scoring real data, not seed rows.

- New table `collector_baselines` (materialized view is fine): rolling 90-day avg/stddev of `quantity_kg` and inter-event GPS distance per collector — this is the "normal" the model compares against.
- Scoring job (`supabase/functions/score-anomalies/index.ts`, a Supabase Edge Function on a 15-min cron):
  1. Pull events since last run.
  2. Compute z-score on quantity vs. that collector's baseline; compute haversine distance / time between consecutive GPS points for the same collector (flags impossible travel, same logic already described in the original seed's `ASH-013` GPS anomaly).
  3. `sklearn.ensemble.IsolationForest`-equivalent isn't available in Deno/Edge Functions — for v2, ship the z-score + haversine rules (deterministic, explainable, good enough for a supply-chain demo and actually correct); document `IsolationForest` as a v3 upgrade path once there's enough real data to train on (needs a Python service, out of scope for this phase).
  4. Insert into `anomalies` exactly like the seed data does today — **zero UI changes needed**, this was already true in the original plan and still holds.
- Runs with its own scoped Postgres role (`anomaly_scorer`) that can only `select` on events/baselines and `insert` on `anomalies` — not the app's `service_role` key (STRIDE #7).

## 4. Pillar 3 — Tamper-evident ledger

**Goal:** if anyone edits a `collection_events` or `batches` row outside the normal insert flow, that's provably detectable — the actual point of a "traceability" product.

Implement via **SHA-256 hash chaining** (the pattern from `implementing-log-integrity-with-blockchain`), applied at the application layer, no external blockchain needed for a prototype:

- New table `ledger_entries`:
  ```sql
  create table ledger_entries (
    id            bigint generated always as identity primary key,
    entity_table  text not null,        -- 'collection_events', 'quality_tests', ...
    entity_id     uuid not null,
    payload_hash  text not null,        -- sha256(canonical_json(row))
    prev_hash     text not null,        -- payload_hash of previous entry (or genesis '0'*64)
    chain_hash    text not null,        -- sha256(prev_hash || payload_hash || created_at)
    created_at    timestamptz not null default now()
  );
  create unique index on ledger_entries (chain_hash);
  ```
- A Postgres trigger (`AFTER INSERT` on `collection_events`, `processing_events`, `quality_tests`) writes the corresponding `ledger_entries` row automatically — the app code doesn't have to remember to do it, and a `service_role` write that skips the trigger path is itself a red flag to look for.
- Verification: `supabase/functions/verify-ledger` (or a `/api/ledger/verify` route, dashboard-only) recomputes the chain and flags the first broken link — surface this as a **"Chain Integrity: ✅ Verified" / "🔴 Tamper detected at entry #N"** badge on the Overview page. This is the single most demo-able "this is real" feature — it's the difference between "we store data" and "we can prove nobody touched it."
- This preserves the original plan's explicit design intent (Appendix C: *"the plan preserves the event shape so a Fabric chaincode can be dropped in later"*) — hash chaining is a strict subset of what a real chain does, so nothing here needs to be re-architected if Hyperledger is added later.

## 5. Supporting changes

- `anomalies` table: add `reviewed_by uuid references stakeholders(id)`, `review_reason text` — closes STRIDE #4.
- Switch `/trace/[batchCode]` and `/api/qr/[batchCode]` to accept `qr_token` instead of `batchCode` in the URL (already documented as the intended fix in the original plan §10 — do it now instead of deferring).
- Rate-limit the new collector submission route the same way `lib/rate-limit.ts` already limits `/api/qr/*`.
- Add a `SECURITY.md` documenting the RLS policies, service-role scoping, and the ledger verification process — useful both for a hackathon judge and for anyone auditing this later.

## 6. Phased roadmap

| Phase | Deliverable | Depends on |
|---|---|---|
| A | Hash-chained ledger + trigger + verify route + Overview badge | none — pure backend, no new UI surface beyond one badge |
| B | `qr_token`-based URLs (security fix, small, do early) | none |
| C | Collector auth + submission form + API route + plausibility checks | Supabase Auth roles |
| D | Realtime subscriptions on Overview/Batches | Phase C (something has to produce live events) |
| E | z-score/haversine anomaly scoring Edge Function | Phase C (needs real events to score) |
| F | `SECURITY.md` + rate limiting on new routes | Phases B–E |

Phase A ships independent value fastest and is the strongest "this is actually real" story for a demo — do it first.

---

## Appendix — routes/pages already verified working (2026-08-16)

Full manual pass against the live Supabase project (`adishshah299@gmail.com` account, seed data intact):

- Login, Overview KPIs, Batches list + filter, Batch detail (`ASH-001`), QR image endpoint, Traceability, Quality & Compliance, Stakeholders, Anomalies (including live "Mark Reviewed" write-back), Consumer portal (`/trace/ASH-001`, `/trace/ASH-002`), Generate-QR button gating (correctly disabled pre-Verified with the exact reason shown).
- **Bug found & fixed:** `components/consumer/origin-map.tsx` (a `"use client"` Leaflet map) was imported directly into the server-rendered `/trace/[batchCode]` page, so `L.divIcon()` executed during SSR and crashed with `window is not defined`, silently falling back to full client-side rendering on every trace-page load. Fixed by routing the import through a new `components/consumer/origin-map-loader.tsx` using `next/dynamic(..., { ssr: false })`. Verified clean (no console errors) on reload.
