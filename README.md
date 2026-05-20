Minimal flashcard study app (Next.js App Router + SQLite).

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

## SQLite

- By default, the app creates a SQLite database at `data/flashcards.db`.
- Override with `SQLITE_PATH` (relative or absolute), e.g. `SQLITE_PATH=./data/my.db`.

Note for Vercel: file-based SQLite uses the serverless filesystem (often `/tmp`) which is ephemeral. The app will run, but the database may not persist across deployments/instances unless you provide a persistent volume/DB.

## CSV Import

Import cards from a CSV whose headers match the `cards` table columns.

```bash
npm run import:cards -- path/to/cards.csv
```

Optional:

```bash
npm run import:cards -- path/to/cards.csv --subject-id 1
```

