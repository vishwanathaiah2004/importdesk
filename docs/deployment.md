# ImportDesk — deployment

- **Repository:** https://github.com/YOUR-USERNAME/importdesk
- **Live app:** https://YOUR-APP.vercel.app

## Demo login

| Role | Email | Password |
|---|---|---|
| Documentation executive | executive@importdesk.demo | Demo@1234 |
| Documentation manager | manager@importdesk.demo | Demo@1234 |

All data in the demo is synthetic. Sample PDFs for trying live upload are in [`samples/`](../samples).

## Run locally

Requirements: Node.js 20 or newer, and a PostgreSQL database (a free Supabase project works).

1. Clone and install:
   ```bash
   git clone https://github.com/YOUR-USERNAME/importdesk.git
   cd importdesk
   npm install
   ```
   `npm install` also generates the Prisma client.
2. Create the environment file and fill in the values (see the table below):
   ```bash
   cp .env.example .env
   ```
3. Create the tables and load the demo data:
   ```bash
   npm run db:deploy
   npm run db:seed
   ```
4. Start the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 and sign in with a demo account.
5. Run the tests:
   ```bash
   npm test
   ```

## Environment variables

Names only. Values are set in `.env` locally and in the Vercel project settings in production.

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Pooled Postgres connection used by the app (Supabase pooler, port 6543) |
| `DIRECT_URL` | yes | Direct Postgres connection used by migrations (port 5432) |
| `SESSION_SECRET` | yes | Signs the login cookie; 32+ random characters |
| `GEMINI_API_KEY` | yes | AI field extraction; server-side only |
| `GEMINI_MODEL` | no | Model name override; defaults to the one in `src/lib/extraction/gemini.ts` |

## How it is deployed

| Part | Where | Region |
|---|---|---|
| Web app and API (Next.js) | Vercel, Hobby plan | Functions pinned to `bom1` (Mumbai) via `vercel.json` |
| Database and stored documents | Supabase Postgres | `ap-south-1` (Mumbai) |
| AI extraction | Google Gemini API | Not India-pinned (see the TDD) |

Steps used:

1. Create a Supabase project in **South Asia (Mumbai)**. Copy the pooled and direct connection strings from **Connect → ORMs → Prisma**.
2. From a local checkout with `.env` pointing at that database, apply migrations and seed:
   ```bash
   npm run db:deploy
   npm run db:seed
   ```
3. In Vercel, **Add New → Project**, import the GitHub repository and keep the detected Next.js settings.
4. Add the environment variables from the table above under **Settings → Environment Variables**.
5. Deploy. Every push to `main` redeploys automatically.

Database migrations are applied from a developer machine with `npm run db:deploy`, not during the Vercel build, so a failed build can never leave the schema half-migrated.

## Resetting the demo

`npm run db:seed` clears shipments and reloads the four sample shipments. Demo users are kept.
