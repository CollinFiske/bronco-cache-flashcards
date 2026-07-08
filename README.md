Minimal flashcard study app (Next.js App Router + Turso/libSQL).

## Getting Started

Install deps (already done if you used `create-next-app`):

```bash
npm install
```

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database (Turso)

The app stores data in [Turso](https://turso.tech) (hosted libSQL) via `@libsql/client`. Set these
env vars (in `.env.local` for local dev, and in the Vercel project's environment variables for
prod — the Vercel Turso integration sets them automatically):

```
TURSO_DATABASE_URL="libsql://..."
TURSO_AUTH_TOKEN="..."
```

Locally, run `vercel env pull .env.development.local` (or copy `.env.local`) to pick up the
linked project's values. The schema is created automatically on first connection.

`data/*.db` are legacy local SQLite files from before the Turso migration; they're no longer read
by the app and are kept only as a historical backup.

## CSV Import

Import cards from a CSV whose headers match the `cards` table columns.

```bash
npm run import:cards -- path/to/cards.csv
```

Optional:

```bash
npm run import:cards -- path/to/cards.csv --subject-id 1
```

Imports go straight to Turso, so `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` must be set (loaded from
`.env.local` automatically).

