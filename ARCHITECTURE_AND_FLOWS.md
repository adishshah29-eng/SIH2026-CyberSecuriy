# AyurTrace — Architecture & Flows

Diagrams and flow-level explanations, meant to be read alongside `PROJECT_DEEP_DIVE.md` (which has
the file-by-file and table-by-table detail) and `DEMO_GUIDE.md` (how to present it). All diagrams
are Mermaid — render them in any Markdown viewer that supports it (GitHub, VS Code, Claude
artifacts, etc.).

---

## 1. System architecture

```mermaid
flowchart TB
    subgraph clients["Clients"]
        consumer["Consumer<br/>(phone, scans QR)"]
        collector["Collector<br/>(field, mobile browser)"]
        staff["Dashboard user<br/>(desktop)"]
    end

    subgraph nextapp["Next.js app (Vercel)"]
        proxy["proxy.ts<br/>(cookie refresh + rate limiting)"]
        dashboard["(dashboard) routes<br/>/overview /batches /anomalies ..."]
        consumerRoute["(consumer) routes<br/>/trace/[qrToken]"]
        collectorRoute["(collector) routes<br/>/submit"]
        api["Route Handlers<br/>/api/qr, /api/*/generate-qr,<br/>/api/collection-events, /api/cron/*"]
    end

    subgraph supabase["Supabase project"]
        auth["Supabase Auth"]
        pg[("Postgres<br/>RLS-protected tables + views")]
        rt["Realtime<br/>(postgres_changes over websocket)"]
        trigger["append_ledger_entry()<br/>SECURITY DEFINER trigger"]
    end

    cron["Vercel Cron<br/>(daily — Hobby plan limit;<br/>Pro plan can run this more often)"]

    consumer -->|"GET /trace/qrt_..."| proxy
    collector -->|"login, GET/POST /submit"| proxy
    staff -->|"login, dashboard routes"| proxy

    proxy --> dashboard & consumerRoute & collectorRoute & api

    dashboard -- "cookie-bound client<br/>(RLS as signed-in user)" --> pg
    consumerRoute -- "cookie-bound client<br/>(RLS as anon)" --> pg
    api -- "service-role client<br/>(bypasses RLS, route already authorized caller)" --> pg
    dashboard -.->|subscribe| rt
    rt -.->|push on change| dashboard

    pg -- "AFTER INSERT" --> trigger
    trigger -- "writes" --> pg

    dashboard <--> auth
    collectorRoute <--> auth
    api <--> auth

    cron -->|"Bearer CRON_SECRET"| api
```

**Key architectural decision**: there is no separate backend service. Next.js Route Handlers *are*
the backend — they either use a cookie-bound Supabase client (so Postgres RLS enforces access as
the actual signed-in user) or a service-role client used only after the route has independently
verified who's calling. This keeps the entire write surface auditable as "the set of files under
`app/api/`" rather than "anything a valid session can send to the database."

---

## 2. Entity-relationship diagram

```mermaid
erDiagram
    stakeholders ||--o{ batches : "collects"
    stakeholders ||--o{ collection_events : "performs"
    stakeholders ||--o{ processing_events : "performs"
    stakeholders ||--o{ quality_tests : "performs"
    stakeholders ||--o{ products : "manufactures"
    stakeholders ||--o{ anomalies : "flagged for"
    stakeholders {
        uuid id PK
        text code UK "COL-001, LAB-02..."
        text role "collector|processor|lab|manufacturer"
        text name
        uuid auth_user_id FK "nullable, links to auth.users"
    }

    batches ||--|| collection_events : "originates from"
    batches ||--o{ processing_events : "has"
    batches ||--o{ quality_tests : "has"
    batches ||--o{ anomalies : "may have"
    batches ||--o| products : "becomes"
    batches {
        uuid id PK
        text batch_code UK "ASH-001..."
        text current_stage
        text status
        uuid collector_id FK
    }

    collection_events {
        uuid id PK
        uuid batch_id FK
        uuid collector_id FK
        double latitude
        double longitude
        numeric quantity_kg
        timestamptz collected_at
    }

    processing_events {
        uuid id PK
        uuid batch_id FK
        text process_type
    }

    quality_tests {
        uuid id PK
        uuid batch_id FK
        text test_type
        text status "Passed|Failed"
    }

    anomalies {
        uuid id PK
        uuid batch_id FK
        uuid stakeholder_id FK
        text anomaly_type
        text severity
        text status "open|reviewed|dismissed"
        numeric score
    }

    products {
        uuid id PK
        uuid batch_id FK
        text qr_token UK "public lookup key"
        text qr_url
    }

    ledger_entries {
        bigint id PK
        text entity_table "which of the 3 event tables"
        uuid entity_id "row in that table"
        text payload_hash "sha256 of the row"
        text prev_hash "previous entry's chain_hash"
        text chain_hash "sha256(prev+payload+created_at)"
    }

    collection_events ||--|| ledger_entries : "hash-chained by trigger"
    processing_events ||--|| ledger_entries : "hash-chained by trigger"
    quality_tests ||--|| ledger_entries : "hash-chained by trigger"

    product_provenance {
        text qr_token "public lookup key"
        text batch_code
        numeric lat "rounded to 2dp"
        numeric lng "rounded to 2dp"
        text collector_display "always 'Verified Supplier'"
    }
    products ||--|| product_provenance : "view joins through"
```

`product_provenance` is a **view**, not a table — it's the only thing the `anon` role can read at
all, and it deliberately omits/masks fields (`collector_display` is hardcoded to "Verified
Supplier" in the app layer even though the view exposes the real name — see `SECURITY.md`).

---

## 3. User flow — consumer scans a product

```mermaid
sequenceDiagram
    actor C as Consumer
    participant Phone
    participant Next as Next.js (/trace/[qrToken])
    participant PG as Postgres (product_provenance view)

    C->>Phone: scans QR code on product
    Phone->>Next: GET /trace/qrt_ab12cd34...
    Next->>Next: isValidQrToken() format check
    alt invalid format
        Next-->>Phone: 404 (custom not-found page)
    else valid format
        Next->>PG: select * from product_provenance where qr_token = ...
        alt no match
            PG-->>Next: no row
            Next-->>Phone: "This product could not be verified"
        else match found
            PG-->>Next: batch + journey + quality + sustainability data
            Next-->>Phone: rendered page (map, journey checklist,<br/>quality results, sustainability checks)
        end
    end
```

No login, no write, single read against a purpose-built view. This is the entire "outside world"
surface of the system.

---

## 4. User flow — collector submits a real field collection

```mermaid
sequenceDiagram
    actor Col as Collector
    participant Form as /submit (client component)
    participant GPS as Device Geolocation API
    participant API as POST /api/collection-events
    participant PG as Postgres
    participant Trig as append_ledger_entry() trigger

    Col->>Form: opens /submit (must be logged in as a collector account)
    Form->>GPS: navigator.geolocation.getCurrentPosition()
    GPS-->>Form: lat, lng (cannot be typed manually)
    Col->>Form: enters quantity, harvest zone, location name
    Col->>Form: taps Submit
    Form->>API: POST { quantity_kg, harvest_zone, location_name, latitude, longitude }
    API->>API: auth.getUser() -- who is actually calling?
    API->>PG: select stakeholders where auth_user_id = caller AND role = 'collector'
    alt not a collector account
        PG-->>API: no row
        API-->>Form: 403
    else is a collector
        API->>API: validate payload (bounds, required fields)
        API->>PG: select this collector's past collection_events
        API->>API: quantity > 2.5x their average? -- inline plausibility check
        API->>PG: insert batches (status=Pending, stage=Collected)
        API->>PG: insert collection_events
        PG->>Trig: AFTER INSERT fires
        Trig->>PG: insert ledger_entries (chained to previous entry)
        opt plausibility check failed
            API->>PG: insert anomalies (anomaly_type = quantity_spike)
        end
        API-->>Form: 201 { batch_code }
        Form-->>Col: "Submitted as batch ASH-016"
    end
```

Every write in this flow goes through the service-role client *inside the route*, after the route
has already independently verified the caller's identity via their session — the client never
sends a `collector_id`, it's derived server-side. This is the concrete implementation of the
"never trust the client" principle from the threat model.

---

## 5. Data flow — the tamper-evident ledger (write + verify)

```mermaid
flowchart LR
    subgraph write["Write path (automatic, every event insert)"]
        direction TB
        A["INSERT into collection_events<br/>/ processing_events / quality_tests"] --> B["AFTER INSERT trigger fires"]
        B --> C["payload_hash = sha256(row_to_json(NEW))"]
        C --> D["fetch previous chain_hash<br/>(or genesis: 64 zeros)"]
        D --> E["chain_hash = sha256(prev_hash + payload_hash + now())"]
        E --> F[("INSERT into ledger_entries")]
    end

    subgraph verify["Verify path (on-demand, e.g. every Overview page load)"]
        direction TB
        G["verify_ledger_chain() RPC"] --> H["walk ledger_entries in id order"]
        H --> I{"prev_hash matches<br/>previous chain_hash?<br/>chain_hash recomputes correctly?"}
        H --> J{"re-hash CURRENT source row --<br/>matches stored payload_hash?"}
        I -->|no| K["chain_ok = false<br/>(ledger itself was edited)"]
        J -->|no| L["payload_ok = false<br/>(source row edited after the fact,<br/>or deleted)"]
        I -->|yes| M["chain_ok = true"]
        J -->|yes| N["payload_ok = true"]
    end

    F -.->|"read by"| H
    K & L --> O["Overview badge: 🔴 Tamper detected at entry #N"]
    M & N --> P["Overview badge: ✅ Chain Integrity: Verified"]
```

The two checks (`chain_ok`, `payload_ok`) are independent on purpose — they catch two different
attacks. `chain_ok` alone would miss someone editing a source table without touching the ledger
(the more realistic risk, since the ledger table has zero direct-write grants but the source
tables are written through the app's service-role key). `payload_ok` is what actually closes that
gap.

---

## 6. Data flow — anomaly detection, three sources into one table

```mermaid
flowchart TB
    seed["supabase/seed.sql<br/>(8 hand-written demo anomalies)"]
    inline["Inline check in<br/>/api/collection-events<br/>(quantity vs. own history, at write time)"]
    cron["/api/cron/score-anomalies<br/>(scheduled daily via Vercel Cron —<br/>Hobby plan allows at most once/day)"]

    subgraph cronDetail["Inside the cron job"]
        z["z-score check:<br/>per-collector mean/stddev of quantity_kg,<br/>flag latest event if |z| > 2"]
        gps["haversine + time check:<br/>consecutive events per collector,<br/>flag if implied speed > 120 km/h"]
        dedupe["dedupe against existing<br/>(batch_id, anomaly_type) pairs"]
    end

    cron --> z --> dedupe
    cron --> gps --> dedupe

    seed --> anomalies[("anomalies table")]
    inline --> anomalies
    dedupe --> anomalies

    anomalies --> page["/anomalies page<br/>(grouped by severity, realtime-subscribed)"]
    anomalies --> kpi["Overview KPI:<br/>Risk Alerts = count where status='open'"]
```

No ML model runs anywhere — deliberately deterministic and explainable, chosen so the system needs
no extra ML runtime while still demonstrating real statistical reasoning over real submitted data.

---

## 7. User flow — dashboard operator reviews an anomaly (Realtime)

```mermaid
sequenceDiagram
    actor Staff as Dashboard user
    participant Page as /anomalies (Server Component)
    participant RT as RealtimeRefresher (Client Component)
    participant WS as Supabase Realtime (websocket)
    participant PG as Postgres

    Staff->>Page: opens /anomalies
    Page->>PG: select * from anomalies (server-rendered)
    PG-->>Page: current anomaly list
    Page-->>Staff: renders grouped by severity

    Note over RT,WS: on mount, independent of the page's own data fetch
    RT->>WS: subscribe to postgres_changes on anomalies table

    Note over PG: elsewhere -- a new collection event triggers<br/>the inline plausibility check, or the cron job runs
    PG->>PG: insert into anomalies
    PG->>WS: change notification (RLS-filtered to this session's grants)
    WS->>RT: postgres_changes event
    RT->>Page: router.refresh()
    Page->>PG: re-fetch (server-side, same query as initial load)
    PG-->>Page: updated anomaly list
    Page-->>Staff: new alert appears, no manual reload
```

`RealtimeRefresher` renders nothing — its only job is calling `router.refresh()` on any change,
which re-runs the Server Component's own data fetch. This keeps one source of truth for the query
logic (the page itself) instead of duplicating fetch logic in a client-side realtime handler.

---

## 8. Auth / identity resolution flow

```mermaid
flowchart TD
    start(["User submits login form"]) --> signin["supabase.auth.signInWithPassword()"]
    signin --> check{"session created?"}
    check -->|no| fail["show 'Invalid email or password'"]
    check -->|yes| lookup["select stakeholders<br/>where auth_user_id = user.id<br/>and role = 'collector'"]
    lookup --> isCollector{"row found?"}
    isCollector -->|yes| toSubmit["redirect to /submit"]
    isCollector -->|no| toOverview["redirect to /overview"]

    toSubmit --> collectorLayout["(collector)/layout.tsx guard:<br/>re-checks the same mapping server-side<br/>on every request"]
    toOverview --> dashboardLayout["(dashboard)/layout.tsx guard:<br/>only checks 'is there a session at all'"]
```

The same check ("does this auth user map to a collector stakeholder?") happens in three places —
`app/page.tsx` (root redirect), `app/login/page.tsx` (post-login redirect), and
`app/(collector)/layout.tsx` (server-side guard on every request to `/submit`) — intentionally
redundant so a collector can't reach the wrong surface by bookmarking a URL, and a dashboard user
can't be routed into `/submit` by mistake.
