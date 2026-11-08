Built feature by feature with AI assistance; design decisions and assumptions are in docs/decisions.md.

# ImportDesk

AI document extraction and cross-check tool for import shipments.

A customs documentation team drops in a shipment's invoice, packing list and bill of lading. ImportDesk extracts the fields with a vision model, shows each value beside its source with a confidence score, cross-checks totals, packages and weights across all three documents, and blocks export until every uncertain or mismatched field has been confirmed by a person.

## What works

- Sign-in with two roles: documentation executive and documentation manager
- Shipment list with status filters, search and review counts
- Upload of invoice, packing list and bill of lading (PDF or image), checked by file signature
- AI field extraction (Google Gemini) with confidence and the source text for every value
- Deterministic checks on every value: ISO 6346 container check digits, 8-digit HSN, Incoterms 2020, ISO currencies, dates, weights in kg, English vs European number formats
- Side-by-side review: confirm in one click, correct inline, add or remove line items and containers
- Seven cross-checks across the three documents with exact decimal arithmetic
- Unreadable or failed documents go to manual entry
- Manager approval, accepting a genuine difference with a written reason, and a server-enforced export gate
- CSV export for the filing software, stored per export, with history
- Edit history per field and an audit log of every action

## Tech stack

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL on Supabase (Mumbai region) |
| ORM | Prisma 6 |
| AI | Vision model with structured JSON output (server-side only) |

Deployment, environment variables and demo logins: see [docs/deployment.md](docs/deployment.md).

## Run locally

Requirements: Node.js 20+, a Supabase project in the Mumbai region.

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Create your env file and fill in the values
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env

# 3. Create the database tables and load demo data
npm run db:migrate
npm run db:seed

# 4. Start the app
npm run dev
```

Open http://localhost:3000.

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run db:migrate` | Create and apply a new migration in development |
| `npm run db:deploy` | Apply existing migrations (used in production) |
| `npm run db:seed` | Load demo users and sample shipments |
| `npm run db:studio` | Browse the database in the browser |
| `npm run samples` | Regenerate the sample PDFs in `samples/` |
| `npm test` | Run unit tests |

## Environment variables

Names only — values live in `.env`, which is never committed.

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Postgres connection used by the app |
| `DIRECT_URL` | Direct Postgres connection used by migrations |
| `SESSION_SECRET` | Signs the login cookie (32+ random characters) |
| `GEMINI_API_KEY` | AI extraction (server-side only) |
| `GEMINI_MODEL` | Optional model override |

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Documentation executive | executive@importdesk.demo | Demo@1234 |
| Documentation manager | manager@importdesk.demo | Demo@1234 |

## Project structure

```
prisma/
  schema.prisma         Data model
  seed.ts               Demo users and sample shipments
  samples/              Synthetic document data and PDF renderer
src/
  app/
    login/              Sign-in
    (app)/              Signed-in screens: shipment list, workspace, export, activity
    api/                Upload, extraction, file download, export routes
  components/           UI: review panel, cross-checks, uploader, viewer
  lib/
    auth/               Sessions, password hashing, role permissions
    extraction/         AI call, output schema, validation and normalisation
    checks/             Cross-check engine (pure) and persistence
    export/             Export gate (pure) and CSV layout
    fields.ts           What is extracted from each document
    review.ts           When a field needs a person
    audit.ts            Audit log
  proxy.ts              Redirects signed-out visitors to /login
docs/
  decisions.md          Design decisions and labelled assumptions
  deployment.md         How to run and deploy, env vars, demo logins
samples/                Synthetic PDFs for trying live upload
```

## Tests

`npm test` runs the unit tests for the parts that decide outcomes: cross-check rules, the export gate, AI output validation and normalisation, CSV escaping, file-type detection, permissions and the review rule.
