# AyurTrace — Demo Guide

**Read this first if you're an LLM (or a human) being handed this repo cold and asked to help
demo it.** It tells you what to click, in what order, and what to say. For "what is this project
and how does it work internally," read `PROJECT_DEEP_DIVE.md`. For diagrams of data/user flow,
read `ARCHITECTURE_AND_FLOWS.md`.

## One-sentence pitch

AyurTrace is a supply-chain traceability system for Ayurvedic herbs (prototype scoped to one herb,
Ashwagandha) that lets a consumer scan a QR code on a product and see a cryptographically
tamper-evident record of exactly where it came from, who touched it, and what tests it passed —
while giving the supply chain's stakeholders a live dashboard with real-time anomaly detection.

## Why it's a *cybersecurity* project, not just a logistics app

The interesting problem here isn't "store some rows in a database" — it's "how do you prove to a
skeptical consumer, auditor, or regulator that this record hasn't been quietly edited?" That's
what makes the tamper-evident ledger (a hash chain, described below) the centerpiece of the demo,
not an afterthought.

## Two audiences, two apps, one system

| | Dashboard | Consumer Portal |
|---|---|---|
| Who | Collectors, and internal stakeholders (processors/labs/manufacturers, modeled as one role in v1) | Anyone who scans a product QR code |
| Auth | Required (Supabase Auth) | None — fully public |
| URL | `/overview`, `/batches`, `/submit`, etc. | `/trace/<qr_token>` |

## Pre-demo checklist

1. `npm install && npm run dev` — starts on `http://localhost:3000`.
2. Confirm `.env.local` has real Supabase project values (not placeholders) — the whole demo is
   against a live backend, not mocked data.
3. Open `/overview` and confirm the "Chain Integrity: Verified" badge is green. If it isn't,
   something has actually been tampered with — investigate before demoing (see
   `PROJECT_DEEP_DIVE.md` § Ledger).
4. Have a phone ready that can scan a QR code and reach the same network as the dev server (or
   just click the QR image link directly — the point being demonstrated doesn't require an actual
   phone).

## The demo script

Say the words in *italics* out loud. Everything else is what to click.

### 1. Open `/overview` (the command center)

*"This is what a supply-chain stakeholder sees — every batch of Ashwagandha moving through
collection, processing, lab testing, and manufacturing, in one place."*

Point at the KPI row (Active Batches, Passed QA, In Processing, Risk Alerts) and then at the
**Chain Integrity: Verified** badge.

*"That badge isn't decorative — it's live cryptographic proof. Every event in this system is
hash-chained, so if anyone — even someone with full database access — edited a past record, this
badge would flip red and tell you exactly which entry broke. I can prove that."*

**Optional live proof** (if you're comfortable improvising): open a second terminal, use the
Supabase service-role key to directly edit one field on a `collection_events` row, refresh
`/overview`. Badge turns red, names the broken entry. Then put the value back and refresh again —
green. This is the single most convincing 60 seconds of the demo.

### 2. Click into a batch — `/batches/ASH-001`

*"Every batch has a full chain of custody: collected here, on this date, by this verified
collector — processed here — lab tested here, with real pass/fail results — and manufactured into
a specific consumer product."*

Walk the vertical timeline. Point out the QR code already generated at the bottom.

### 3. `/anomalies` — AI Risk Monitoring

*"The system doesn't just record data, it watches it. This high-severity alert on ASH-009 flags a
quantity that's way outside this collector's normal range — 260kg against a usual 80–120kg. This
one on COL-007 flags GPS movement that's physically implausible — 312km in 18 minutes, which is a
faster-than-a-plane collection event, so either the GPS is broken or the record was faked."*

Click **Mark Reviewed** on an open alert — count at the top updates immediately, this is a real
write to the database, not a mock.

*(If you set up the anomaly scoring cron — see below — mention: "and these aren't hand-typed
either — a scoring job re-derives them statistically from real submitted data on a schedule.")*

### 4. Scan the QR / open `/trace/ASH-001`'s QR image

*"Now the same batch, from a completely different angle — no login, this is what any consumer
scans off a shelf."*

Show: Verified banner, map, journey checklist, quality test results, sustainability checks.

*"Notice the collector's name isn't shown — just 'Verified Supplier.' We deliberately don't expose
that stakeholder's identity or exact farm coordinates to the public; the map is intentionally
rounded to protect that."*

### 5. (If demoing the live collector flow) `/submit`

Log in as a collector account (not the dashboard admin — a separate account tied to one
`stakeholders` row).

*"This is what a real collector in the field uses — not a spreadsheet, not a phone call to head
office. The location is read directly from the device's GPS; it physically can't be typed in, so
you can't fake where you are."*

Submit a real entry. Flip back to `/overview` (or `/batches`) in another tab and point out the new
batch appearing without a manual refresh — that's the Supabase Realtime subscription.

### Closing line

*"Every piece of this — the dashboard, the public verification, the anomaly detection, the ledger
— reads and writes against the same live database. There's no mock data path; what you just saw
is what a pilot deployment would actually do."*

## If something breaks mid-demo

- **Chain Integrity badge is red and you didn't expect it**: don't panic-fix it live. Say *"that's
  actually the system working — something in the underlying data changed outside the normal
  write path, and it caught it,"* then investigate after.
- **A page shows stale/loading content**: hard-refresh. Next.js dev mode occasionally needs it
  after a lot of hot-reloading during development.
- **QR scan doesn't resolve**: the URL uses `NEXT_PUBLIC_BASE_URL` from `.env.local` — if you're
  demoing from a phone on a different device than the dev server, that env var needs to be the
  server's LAN IP, not `localhost`.
