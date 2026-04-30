# Casa Real Analytics — MVP Design Document

> **Status:** Locked (brainstorming complete)
> **Date:** 2026-04-30
> **Scope:** MVP — single report type (RDS) → consolidated multi-month Excel + analytics-ready DB

---

## 1. Understanding Summary

- **What:** A web-based analytics platform for **Casa Real Salta** (a hotel in Salta, Argentina) that ingests **PDFs exported from the hotel's PMS** (which has no API), parses them into structured data, stores it in Postgres, and produces both an **Excel report** and (short-term) **analytics dashboards**.
- **MVP scope:** A single report type — the **RDS (Resumen Diario de Situación - Modelo II)**. User uploads one PDF per month (the latest day of that month), the system extracts only the **Valor Acumulado** (cumulative) values, and outputs a multi-month consolidated `.xlsx` matching the provided example layout.
- **Why:** The PMS only exports PDFs; without this, monthly consolidation is manual. The platform unlocks downstream analytics (dashboards) on top of the same DB.
- **Who uses it:** The owner/operator + 1–3 hotel staff (GM, accountant). Spanish UI. Simple shared-access auth (magic link via Resend, email allowlist).
- **Key constraints:** Argentine number format (`1.293.462,42`), Spanish concept names (some Portuguese-localized), text-based PDFs (no OCR), schema **auto-discovers** new line items, re-uploading the same month **replaces** that month's data.
- **Tech stack:** Next.js 15 (TypeScript) on Vercel + Vercel Postgres (Neon) + Vercel Blob + Auth.js v5 + Resend + OpenRouter (LLM fallback).
- **Parsing strategy:** Deterministic primary (`unpdf` text extraction + regex/heuristics) with **OpenRouter LLM fallback chain** (`nvidia/nemotron-3-super:free` → `openai/gpt-oss-120b:free`) for unknown rows, normalization, and QA repair.
- **Operating cost (MVP):** $0 — all components on free tiers, sized for ~12 PDFs/year and 3 users.
- **Explicit non-goals (MVP):** Other report types beyond RDS, multi-hotel/tenancy, role-based permissions, OCR for scanned PDFs, mobile app, real-time ingestion, the analytics dashboard itself (next iteration), forecast/Previsión section processing, user-management UI.

---

## 2. Assumptions

1. **One PDF per month** is the operating cadence. Users won't upload daily PDFs in the MVP.
2. **The "Mes" key** is derived from the PDF's `Fecha` header (e.g., `31/01/2026` → period `2026-01-01`, header label `"Enero (al 31/01)"`).
3. **Concept normalization** uses an alias lookup against `concepts.raw_aliases`. Unknowns are passed to the LLM (OpenRouter) for normalization + group classification, then stored with `needs_review = true`.
4. **Excel output** = computed values (no live formulas), but **layout matches the provided example exactly** (title rows, group headers in caps, subtotals as rows, blank-row separators).
5. **Original PDFs are retained in Vercel Blob** (one bucket, organized by `period`, e.g., `rds/2026-01.pdf`). Enables reprocessing if parsing logic improves.
6. **Default NFRs:**
   - Performance: single PDF processed end-to-end in <10s.
   - Scale: ~12 PDFs/year per hotel, 1 hotel, 3 users (tiny).
   - Reliability: best-effort; clear error UI when parsing fails or returns partial data.
   - Security: Auth.js + Resend magic links + env allowlist; Vercel Postgres RLS not needed at this scale (single-tenant).
7. **All dates/times** in **America/Argentina/Salta** (UTC-3, no DST).
8. **The future dashboard** will read from the same Postgres tables — schema designed long-format, normalized concepts, indexed by period.
9. **Auto-accept LLM normalizations** with a `/conceptos` review page for human override (vs. blocking ingestion until reviewed).
10. **Excel generated on-demand** at click time (re-query DB, rebuild xlsx). Build time is <100ms at MVP scale.
11. **Schema is report-type-aware from day one** — adding a future report type requires only seed data + a new parser, no migration.

---

## 3. Decision Log

| # | Decision | Alternatives | Why this |
|---|---|---|---|
| 1 | MVP scope: 1 report type (RDS) | 2-3, 4-6 reports | Prove pipeline end-to-end before generalizing |
| 2 | PDF parsing: deterministic primary + LLM fallback | Pure deterministic / pure LLM | Cheap+reliable for fixed template, LLM for resilience & future report types |
| 3 | LLM provider: OpenRouter with `nvidia/nemotron-3-super:free` → `openai/gpt-oss-120b:free` | Groq (initially proposed) | Per-model provider failover built-in; both free tier |
| 4 | Stack: Next.js + Vercel-native everything | Python FastAPI / hybrid | Single language, all-free hosting, fastest path to dashboards |
| 5 | DB: Vercel Postgres (Neon) | Supabase Postgres | Stay Vercel-native per user constraint |
| 6 | Storage: Vercel Blob (PDFs retained) | Discard after parse | Reprocessing capability; ~free at this scale |
| 7 | Auth: Auth.js v5 + Resend magic links + env allowlist | Supabase Auth, Clerk | No passwords to manage, free, 3 users — env allowlist > admin UI |
| 8 | ORM: Drizzle | Prisma | Lighter, native Vercel Postgres support, type-safe |
| 9 | Schema: long format + report-type-aware | Wide / RDS-specific | Analytics-friendly; future report types need no migration |
| 10 | Concept handling: auto-discover + LLM classify + UI review | Predefined catalog only | Per Q6b-B; new concepts surface in `/conceptos` |
| 11 | Cadence: 1 PDF/month, unique key replaces | Daily ingestion | Per Q6a-A; matches operator workflow |
| 12 | Excel: computed values, no live formulas, layout matches example | Live formulas, simpler layout | Per Q11a-B + Q11b-A |
| 13 | Excel generation: on-demand | Pre-cached after each upload | Trivial cost (<100ms build) at this scale |
| 14 | Architecture: synchronous API route | Async queues, browser→Blob | YAGNI — 250 KB files, monthly cadence |
| 15 | Forecast section excluded from MVP | Include forecast tables/Excel rows | YAGNI — re-parseable from retained PDFs |
| 16 | Single role for 3 users | Role separation | YAGNI — defer until pain is real |
| 17 | Testing: Vitest + golden PDF fixture, LLM gated behind flag | E2E with Playwright, mock-everything | Golden fixture is the regression net; LLM kept out of CI for cost/flakiness |

---

## 4. Architecture & Module Layout

### High-level architecture

```
┌────────────────────────────────────────────────────────────────┐
│                       Next.js 15 (App Router)                  │
│                          Vercel Hobby                          │
│                                                                │
│  ┌───────────┐   ┌───────────────┐   ┌────────────────────┐    │
│  │   /(app)  │   │ /api/ingest   │   │ /api/excel         │    │
│  │  upload UI│   │  POST: parse  │   │  GET: build xlsx   │    │
│  │  reportes │   │       persist │   │                    │    │
│  └───────────┘   └───────┬───────┘   └─────────┬──────────┘    │
│                          │                     │               │
│                          ▼                     ▼               │
│                ┌───────────────────────────────────────────┐   │
│                │           lib/ (domain core)              │   │
│                │  parser/   normalizer/   llm/   excel/    │   │
│                └───────────────────────────────────────────┘   │
└─────────────────────────┬─────────────────────┬────────────────┘
                          │                     │
                  ┌───────▼─────┐       ┌───────▼───────┐
                  │   Vercel    │       │  OpenRouter   │
                  │  Postgres   │       │  (fallback)   │
                  │ Vercel Blob │       └───────────────┘
                  │ Auth.js +   │
                  │   Resend    │
                  └─────────────┘
```

### Project structure

```
casa-real-analytics/
├── app/
│   ├── (auth)/login/page.tsx          # magic-link sign-in
│   ├── (app)/                         # protected layout
│   │   ├── layout.tsx                 # auth guard + nav
│   │   ├── page.tsx                   # dashboard home (post-MVP)
│   │   ├── reportes/                  # uploaded periods table + actions
│   │   └── conceptos/                 # review/normalize unmapped
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── ingest/route.ts            # POST: PDF → DB
│       ├── excel/route.ts             # GET: build .xlsx
│       └── periods/[id]/route.ts      # DELETE / re-process
├── lib/
│   ├── db/                            # drizzle schema + queries
│   ├── parser/                        # PDF text extraction + heuristics
│   ├── normalizer/                    # concept canonicalization
│   ├── llm/                           # OpenRouter client + fallback chain
│   ├── excel/                         # xlsx builder
│   └── domain/                        # types: Period, Concept, Group, etc.
├── drizzle/                           # migrations
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/                      # real PDF + expected outputs
└── docs/
    └── design/mvp.md                  # this document
```

### Deliberate choices

- **Drizzle ORM** (not Prisma) — works seamlessly with Vercel Postgres, lighter, type-safe.
- **`lib/` is framework-agnostic domain code** — parser/normalizer/llm/excel know nothing about Next.js. Easy to test and reuse for the future dashboard.
- **One route per verb** — minimal API surface.
- **Spanish UI**, all internal identifiers in English.

---

## 5. Data Model (Postgres / Drizzle)

```sql
-- Auth.js standard tables: users, accounts, sessions, verification_tokens

-- Catalog of report types (extensible from day one)
report_types(
  id text PK,                         -- 'RDS'
  name text,                          -- 'Resumen Diario de Situación - Modelo II'
  hotel text                          -- 'Casa Real Salta'
)

-- Canonical sections within a report type
report_groups(
  id uuid PK,
  report_type_id text FK,
  name text,                          -- 'HOSPEDAJE', 'ESTADÍSTICAS', 'INDICADORES FINANCIEROS'
  display_name text,                  -- 'GRUPO HOSPEDAJE'
  kind text,                          -- 'revenue' | 'totals' | 'stats' | 'kpi'
  sort_order int,
  UNIQUE(report_type_id, name)
)

-- Auto-discovered canonical concepts
concepts(
  id uuid PK,
  report_type_id text FK,
  group_id uuid FK NULL,              -- NULL if LLM couldn't classify
  canonical_name text,                -- 'Alojamiento'
  raw_aliases text[],                 -- ['ALOJAMIENTO'] (raw forms ever seen)
  sort_order int,                     -- order within group
  is_subtotal bool,                   -- subtotal row vs line item
  metric_kind text,                   -- 'currency' | 'count' | 'pct' | 'ratio'
  needs_review bool,                  -- true if LLM-classified, awaiting human OK
  UNIQUE(report_type_id, canonical_name)
)

-- One row per uploaded month (UNIQUE per report_type+period → upload replaces)
periods(
  id uuid PK,
  report_type_id text FK,
  period date,                        -- 2026-01-01 (first of month)
  reference_date date,                -- 2026-01-31 (PDF's Fecha; → "al 31/01")
  pdf_blob_url text,                  -- Vercel Blob URL
  pdf_filename text,
  uploaded_by text FK users,
  uploaded_at timestamptz,
  parser_version text,
  status text,                        -- 'success' | 'partial' | 'failed'
  UNIQUE(report_type_id, period)
)

-- The actual values (long format — analytics friendly)
period_values(
  period_id uuid FK,
  concept_id uuid FK,
  valor_acumulado numeric,
  pct_acumulado numeric NULL,
  valor_hoy numeric NULL,             -- captured for completeness, not in Excel
  pct_hoy numeric NULL,
  source text,                        -- 'deterministic' | 'llm-fallback'
  PRIMARY KEY(period_id, concept_id)
)

-- Lightweight audit
ingestion_events(
  id uuid PK,
  period_id uuid FK,
  step text,                          -- 'parse' | 'normalize' | 'llm-fallback'
  model text NULL,                    -- e.g., 'nvidia/nemotron-3-super:free'
  input jsonb, output jsonb,
  status text, duration_ms int,
  created_at timestamptz
)
```

### Key choices recap

- **Long format** for analytics; pivot to wide at Excel-build time.
- **Auto-discovery**: unknown raw concept names trigger LLM classification, stored with `needs_review = true`.
- **`raw_aliases text[]`** absorbs multiple raw spellings into one canonical concept.
- **Re-upload semantics**: `UNIQUE(report_type_id, period)` + transactional delete-then-insert.
- **Forecast (Previsión de Ocupación) NOT modeled in MVP** — re-parseable from retained PDF when needed.

---

## 6. Ingestion Pipeline (`POST /api/ingest`)

```
1. Receive multipart PDF (Next.js Route Handler, runtime: nodejs)
2. Validate: mime=application/pdf, size < 5MB
3. Upload to Vercel Blob → blobUrl
4. Extract text   ← unpdf (pages[] of strings)
5. Parse (deterministic)
   ├─ Header:  Fecha → reference_date → period (YYYY-MM-01)
   │           Hotel name (sanity check)
   ├─ Group sections (Hospedaje, A&B, Spa, ...): regex per row
   │   ↳ {raw_name, valor_hoy, pct_hoy, valor_acumulado, pct_acumulado}
   ├─ Statistics block: keyed parser (label → value pairs)
   └─ KPIs / totals: keyed parser
6. Normalize raw concepts
   For each raw_name not in concepts.raw_aliases:
     ├─ try fuzzy match (Levenshtein ≤ 2 against canonical_name)
     └─ if no match → LLM normalize (OpenRouter fallback chain)
        returns {canonical_name, group_name, metric_kind}
        insert concept with needs_review=true
7. Sanity checks (deterministic)
   ├─ Each group's line items sum ≈ stated subtotal (±0.05)
   ├─ All numeric values parse cleanly (Argentine format)
   └─ Reference_date present and parseable
   ↳ Any failure → invoke LLM repair on just that block
8. Persist (single transaction)
   ├─ DELETE FROM period_values WHERE period_id = (existing for same period)
   ├─ DELETE FROM periods WHERE report_type_id='RDS' AND period=:period
   ├─ INSERT periods (status: 'success'|'partial')
   └─ INSERT period_values (bulk, source='deterministic'|'llm-fallback')
9. Log to ingestion_events; respond { period, status, conceptsAdded, warnings[] }
```

### Argentine number parser

Single utility: `parseARNumber("1.293.462,42") → 1293462.42`. Handles negatives, `(-)` prefix annotations, percentages, `0,00`. **Tested with the actual values from the January PDF.**

### LLM layer (`lib/llm/openrouter.ts`)

```ts
// OpenRouter is OpenAI-compatible — use the openai SDK with custom baseURL
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL,
    'X-Title': 'Casa Real Analytics',
  },
});

const MODELS = [
  'nvidia/nemotron-3-super:free',     // primary (verify exact slug at impl time)
  'openai/gpt-oss-120b:free',         // fallback
] as const;

// Per call: try each model in order.
// OpenRouter's `provider.allow_fallbacks` handles provider routing within each model.
callOpenRouterWithFallback({
  prompt, schema, models: MODELS,
  body: { provider: { allow_fallbacks: true } },
})
```

**Two-layer resilience:**

| Layer | Failure | Recovery |
|---|---|---|
| Provider (within one model) | A specific provider hosting Nemotron is down | OpenRouter routes to next provider hosting same model |
| Model (our code) | Model unavailable / invalid JSON / rate limit | Fall back to `gpt-oss-120b:free` |
| All-fail | Both models fail | Period marked `partial`, surfaced in UI |

**Two distinct LLM uses:**

- `normalizeConcept(rawName, surroundingGroup)` → `{canonical_name, group_name, metric_kind}`. Per unknown raw name. Cached in `raw_aliases`.
- `repairBlock(rawText, expectedShape)` → structured rows. Only when deterministic sanity checks fail for a section.

### Idempotency & safety

- Same PDF re-uploaded for same period → previous rows fully replaced (atomic transaction).
- Failure mid-pipeline → transaction rollback; PDF stays in Blob (orphan cleanup is a cron, post-MVP).
- `parser_version` stored per period → enables future re-parsing campaigns.

---

## 7. Excel Generation (`GET /api/excel`)

### Endpoint behavior

```
GET /api/excel?reportType=RDS
  → buf = buildAcumuladosXlsx({ reportType: 'RDS' })
  → Response with:
      Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
      Content-Disposition: attachment; filename="RDS_Casa_Real_Salta_Acumulados_<YYYY-MM-DD>.xlsx"
```

On-demand: each click rebuilds from DB. At ~12 columns × ~60 rows, build is <100ms.

### Library: `exceljs`

Pure Node, supports number formats, column widths, cell styles, no native deps — works on Vercel runtime.

### Build flow (`lib/excel/buildAcumulados.ts`)

```
1. Load all periods for reportType, sorted by period ASC
   → columns = [{period: 2026-01-01, refDate: 2026-01-31}, ...]
2. Load all concepts joined with groups, ordered by:
   group.sort_order, concept.sort_order
3. Load all period_values (one query, joined) → Map<(periodId, conceptId), value>
4. Compose rows:
   ┌─ Row 1: "CASA REAL SALTA - Valores Acumulados RDS" (bold, merged)
   ├─ Row 2: "Períodos acumulados al cierre de cada reporte" (italic)
   ├─ Row 3: blank
   ├─ Row 4 (header): "Concepto" | "Enero (al 31/01)" | "Febrero (al 28/02)" | ...
   │         ↑ Spanish month label from refDate via Intl.DateTimeFormat('es-AR')
   │
   ├─ For each group ordered by sort_order:
   │   ├─ Group header row: "GRUPO HOSPEDAJE" (bold caps) — if kind='revenue'
   │   │                    "ESTADÍSTICAS" / "INDICADORES FINANCIEROS" — if kind='stats'/'kpi'
   │   ├─ Line item rows (canonical_name | values per column)
   │   ├─ If kind='revenue': "Subtotal Hospedaje" row (bold) — computed sum
   │   └─ Blank separator row
   │
   ├─ TOTALES Y SALDOS group:
   │   ├─ "Total de los Grupos" — computed: sum of all revenue subtotals per column
   │   ├─ "Saldo Anterior Huésp." — from period_values
   │   └─ "Saldo Actual Huésp." — from period_values
   │
   └─ ESTADÍSTICAS includes "% Ocupación" — computed: ocupadas / disponibles per column
5. Apply formats:
   - Currency cells: '#,##0.00;-#,##0.00' (Excel renders with user locale)
   - Percentage cells (% Ocupación, %Rec): '0.00%' applied to ratio (0.7134, not 71.34)
   - Integer cells (habs): '#,##0'
6. Auto-size column A; fixed width for value columns
7. Return workbook.xlsx.writeBuffer()
```

### Computed-at-build-time (no live formulas)

- `Subtotal <Group>` = sum of line items in group (per column)
- `Total de los Grupos` = sum of all revenue group subtotals (per column)
- `% Ocupación` = `habs_ocupadas / habs_disponibles` (per column)
- All written as plain numbers.

### Edge cases handled

- **Concept missing for a column** → blank cell (not zero). Distinguishes "didn't exist" from "was zero".
- **No periods uploaded yet** → 400: "Sin reportes cargados".
- **Concepts with `needs_review=true`** → still rendered, with a warning banner in UI: "N conceptos pendientes de revisión".

---

## 8. Auth + UI

### Auth (Auth.js v5)

```ts
// auth.config.ts
providers: [
  Resend({ from: 'noreply@casarealanalytics.com' }),  // magic link
],
adapter: DrizzleAdapter(db),
session: { strategy: 'database' },
callbacks: {
  signIn: ({ user }) => ALLOWLIST.includes(user.email),  // env: ALLOWED_EMAILS
}
```

- Magic-link only (no passwords). Resend free tier = 3k emails/mo.
- Allowlist via `ALLOWED_EMAILS=email1@x.com,email2@x.com`.
- Single role: any signed-in user can do everything.
- Middleware (`middleware.ts`) protects `(app)/`; unauth → `/login`.

### Pages

#### `/login`
Email input → "Enviar enlace" → click email link → `(app)/reportes`.

#### `/reportes` — main page

```
┌─────────────────────────────────────────────────────────────┐
│  Reportes RDS                       [⬇ Descargar Excel]     │
├─────────────────────────────────────────────────────────────┤
│  [📤 Cargar PDF]  drop zone — accepts .pdf                  │
├─────────────────────────────────────────────────────────────┤
│  Período          Cargado          Estado      Acciones    │
│  Enero 2026       30/04 14:22      ✓ OK        Eliminar    │
│  Febrero 2026     30/04 14:23      ⚠ Parcial   Re-procesar │
│  Marzo 2026       30/04 14:24      ✓ OK        Eliminar    │
│  Abril 2026       30/04 14:25      ✓ OK        Eliminar    │
└─────────────────────────────────────────────────────────────┘
```

- Drop zone POSTs to `/api/ingest`. While processing: spinner with "Procesando…".
- On success: row updates inline; warnings → toast "Cargado con observaciones — revisar conceptos".
- "Descargar Excel" → `GET /api/excel`.
- "Eliminar" → `DELETE /api/periods/:id` (cascades to period_values; PDF stays in Blob).
- "Re-procesar" → re-runs ingestion from kept Blob URL.

#### `/conceptos` — unmapped concept review

```
Conceptos pendientes de revisión (3)

┌──────────────────────────────────────────────────────────────┐
│ Nombre detectado     │ Sugerido por LLM   │ Grupo  │ Acción │
│ TARJETA CABAL        │ Tarjeta Cabal      │ Cobro  │ ✓  ✎  │
│ COBRO DE OBJETOS     │ Cobro de Objetos   │ Varios │ ✓  ✎  │
│ ALQUILER DE SALON    │ Alquiler de Salón  │ Eventos│ ✓  ✎  │
└──────────────────────────────────────────────────────────────┘
```

- ✓ approves the LLM suggestion (`needs_review = false`).
- ✎ opens edit modal: rename canonical, change group, set sort order, set metric_kind.
- Bulk approve button.

### UI stack

- **shadcn/ui** (Tailwind + Radix) — fast, accessible, Spanish-friendly.
- **Hardcoded Spanish strings** in `messages/es.ts` (no `next-intl` for MVP).
- **No charts in MVP** — that's the post-MVP analytics dashboard.

### Intentionally NOT built (MVP)

- User management UI (allowlist via env)
- Roles/permissions
- Audit trail UI (data is in `ingestion_events`, queryable later)
- Multi-hotel selector
- Dashboards / charts

---

## 9. Errors, Edge Cases & Testing

### Failure matrix

| Stage | Failure | System reaction | User-visible |
|---|---|---|---|
| Upload | File > 5 MB / not PDF | reject before parsing | Toast: "Archivo inválido" |
| Blob upload | Vercel Blob 5xx | retry x2 (exponential), then fail | Toast: "Error al guardar PDF, reintenta" |
| Text extract | `unpdf` returns empty / scanned PDF | fail early; no LLM (would hallucinate) | "PDF no contiene texto seleccionable. ¿Es un escaneo?" |
| Header parse | `Fecha` missing/unparseable | fail | "No se pudo identificar la fecha del reporte" |
| Row parse | Group section can't be located | LLM `repairBlock` for that section only | warning logged; rows tagged `'llm-fallback'` |
| Sanity check | Subtotal mismatch (Σ items ≠ stated subtotal, ±0.05) | LLM `repairBlock` on that group; if still off → `partial` | warning + `⚠ Parcial` badge |
| Concept normalize | LLM all-models-fail | concept stored with `canonical_name=raw_name`, `needs_review=true`, `group_id=NULL` | warning + appears in `/conceptos` "Sin grupo" |
| DB transaction | Postgres error mid-insert | full rollback; PDF stays in Blob | Toast: "Error al guardar, reintenta" |
| Excel build | Zero periods loaded | 400 with message | "Sin reportes cargados" |

### Edge cases (concrete, from the real January PDF)

- **Negative-as-prefix**: `-3.016,53`, `(-)` markers in headers (`DESAYUNO (-)`). Parser strips `(-)` annotation from labels.
- **Argentine number format**: `1.293.462,42` → `1293462.42`. Single tested utility.
- **Mixed Portuguese tokens**: `Diária Média por Pernoites`. Normalizer canonicalizes.
- **Encoding artifacts**: `Hu�sped` / `Huésped` / `Huesped` → `Huésped`.
- **Repeated forecast section** in PDF (15 days appear twice). MVP ignores forecast entirely; parser must not confuse forecast numbers with the stats block above.
- **Same period re-uploaded with different reference_date** (uploaded mid-month then again at month-end): replace cleanly. Header label updates.
- **Concept disappears in a future month** (e.g., `NC Mastercard` in Jan, absent in Feb): row exists in Excel; Feb cell is **blank**, not zero.
- **Zero values**: stored as `0`, rendered as `0,00` — distinguishable from blank by formatting.

### Testing strategy

```
tests/
├── unit/
│   ├── parser/parseARNumber.test.ts      ← 30+ cases incl. negatives, "(-)", "0,00"
│   ├── parser/parseHeader.test.ts        ← Fecha extraction
│   ├── parser/parseGroup.test.ts         ← per-group regex
│   ├── normalizer/canonicalize.test.ts   ← fuzzy match, alias lookup
│   └── excel/buildAcumulados.test.ts     ← snapshot vs example .xlsx
├── integration/
│   └── ingest.test.ts                    ← mock Blob, real DB (test schema), full flow
└── fixtures/
    ├── rds-2026-01.pdf                   ← real January PDF
    ├── rds-2026-01.expected.json         ← extracted structured form (golden)
    └── RDS_Casa_Real_Salta_Acumulados.xlsx ← reference output
```

- **Vitest** for unit + integration.
- **Golden fixture**: parse `rds-2026-01.pdf`, assert extracted JSON matches `rds-2026-01.expected.json` exactly. Regression net for parser changes.
- **Excel snapshot**: build with 4 fixture periods, assert cell-equal to reference xlsx.
- **No LLM in tests by default**: `OPENROUTER_API_KEY` absent → normalizer falls back to `needs_review=true` placeholder. Optional `--llm` tag runs real OpenRouter calls (CI off; local manual on).

### Observability

- Every ingestion logs to `ingestion_events`: step, model, duration, status. Queryable.
- Vercel logs surface uncaught errors automatically.
- No Sentry/Datadog for MVP — `ingestion_events` is enough.

---

## 10. Glossary (Spanish PDF/UI ↔ canonical schema)

| PDF / UI (Spanish) | Schema (English) | Notes |
|---|---|---|
| Resumen Diario de Situación - Modelo II | RDS report type | `report_types.id = 'RDS'` |
| Fecha | reference_date | The day the report was generated |
| Período / Mes | period | First day of month, used as primary key |
| Valor Acumulado | valor_acumulado | Cumulative monthly value (the one we use) |
| Valor Hoy | valor_hoy | Daily value (captured but not in Excel) |
| Grupo Hospedaje | report_group (kind='revenue') | Lodging revenue group |
| Alimentos y Bebidas | report_group (kind='revenue') | F&B group |
| Spa Club | report_group (kind='revenue') | Spa group |
| Lavandería / Tintorería | report_group (kind='revenue') | Laundry group |
| Comunicaciones | report_group (kind='revenue') | Communications group |
| Cargos Varios | report_group (kind='revenue') | Misc charges group |
| Eventos | report_group (kind='revenue') | Events group (rentals) |
| Formas de Cobro | report_group (kind='revenue') | Payment methods (negative cash flows) |
| Impuestos | report_group (kind='revenue') | Taxes group |
| Subtotal | concept (is_subtotal=true) | Per-group subtotal row |
| Total de los Grupos | computed at Excel build | Sum of all group subtotals |
| Tasa de Servicio | concept | Service charge — currently always 0 in observed data |
| Saldo Anterior Huésp. | concept (group=totals) | Prior guest balance |
| Saldo Actual Huésp. | concept (group=totals) | Current guest balance |
| Habitaciones del Hotel | concept (group=stats, metric_kind=count) | Total rooms × days |
| Habitaciones Disponibles | concept (group=stats) | Available rooms |
| Habitaciones Ocupadas | concept (group=stats) | Occupied rooms |
| % Ocupación | computed at Excel build | ocupadas / disponibles |
| Diaria Media | concept (group=kpi, metric_kind=currency) | ADR (Average Daily Rate) |
| Diaria Media Huésped | concept (group=kpi) | ADR per guest |
| REVPAR | concept (group=kpi) | Revenue Per Available Room |
| % Rec Huésp s/Rec TT | concept (group=kpi, metric_kind=ratio) | Lodging recipe / Total recipe |
| % Rec A&B s/Huésped | concept (group=kpi, metric_kind=ratio) | F&B recipe / Lodging recipe |
| Previsión de Ocupación | NOT in MVP | Re-parseable from retained PDF |

---

## 11. Open questions resolved during brainstorming

1. **Unknown concept review UI?** → Auto-accept LLM classification, surface in `/conceptos` for human review/override.
2. **Excel generation: on-demand or pre-cached?** → On-demand at click time (rebuild <100ms).
3. **Report-type-aware schema from day one?** → Yes. `report_types` and `report_groups` tables exist even though only RDS is seeded.

---

## 12. Implementation prerequisites

Before starting to build, prepare:

1. **Vercel project** created (linked to a GitHub repo).
2. **Vercel Postgres** database provisioned and `POSTGRES_URL` set.
3. **Vercel Blob** store provisioned and `BLOB_READ_WRITE_TOKEN` set.
4. **Resend** account + verified sender domain; `RESEND_API_KEY` set.
5. **OpenRouter** account; `OPENROUTER_API_KEY` set.
6. **Auth secrets**: `AUTH_SECRET` (random 32 bytes), `AUTH_URL`.
7. **App env**: `ALLOWED_EMAILS=...` (comma-separated allowlist).

### Suggested build order

1. Scaffold Next.js + Tailwind + shadcn + Drizzle + Auth.js + tests.
2. Define DB schema; run first migration; seed `report_types` + `report_groups` for RDS.
3. Build deterministic parser against the real January PDF fixture (TDD with golden output).
4. Build Excel generator against the reference xlsx (snapshot test).
5. Build OpenRouter LLM wrapper + normalizer (gated by env var).
6. Wire `/api/ingest` end-to-end; integration test.
7. Build `/login`, `/reportes`, `/conceptos` UI.
8. Deploy to Vercel; smoke-test with real PDFs.

---

*End of design document.*
