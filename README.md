# Casa Real Analytics

Plataforma de analítica para el **Hotel Casa Real Salta** (Salta, Argentina).

El sistema PMS del hotel no expone API; los datos se exportan únicamente como PDFs.
Esta plataforma ingiere los PDFs, los parsea a una base de datos relacional y produce
reportes Excel consolidados — con el objetivo a corto plazo de habilitar dashboards
analíticos sobre la misma base.

## MVP

- **Alcance:** un único reporte — el RDS (Resumen Diario de Situación - Modelo II).
- **Flujo:** un PDF por mes → extracción cumulativa → Excel multi-mes consolidado.
- **Stack:** Next.js 16 (App Router) + Vercel Postgres + Vercel Blob + Auth.js v5 +
  Resend + OpenRouter (LLM fallback).

> 📄 **Diseño completo:** [`docs/design/mvp.md`](docs/design/mvp.md)

## Setup local

1. **Variables de entorno**

   Copiar `.env.example` a `.env.local` y completar:
   - `POSTGRES_URL` — Vercel Postgres connection string
   - `BLOB_READ_WRITE_TOKEN` — Vercel Blob token
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `RESEND_API_KEY`, `RESEND_FROM` — Resend (magic links)
   - `ALLOWED_EMAILS` — lista separada por comas de correos autorizados
   - `OPENROUTER_API_KEY` — OpenRouter

2. **Instalar y correr**

   ```bash
   npm install
   npm run db:generate   # primera vez: generar migración inicial
   npm run db:migrate    # aplicar migraciones a Postgres
   npm run dev
   ```

   Abrir [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Dev server (Next.js) |
| `npm run build` | Build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Tests (Vitest) |
| `npm run db:generate` | Generar migración a partir de `lib/db/schema.ts` |
| `npm run db:migrate` | Aplicar migraciones |
| `npm run db:studio` | Drizzle Studio (UI) |

## Estructura

```
app/                 # Next.js App Router (rutas + layouts + API)
lib/                 # Dominio puro (parser, normalizer, llm, excel, db)
components/ui/       # shadcn/ui primitives
drizzle/             # Migraciones generadas
tests/               # Vitest unit + integration + fixtures
docs/design/mvp.md   # Diseño locked
```

## Estado

🚧 **Esqueleto inicial** — endpoints y módulos de dominio devuelven `501 / not implemented`. Próximos pasos en `docs/design/mvp.md` §12.
