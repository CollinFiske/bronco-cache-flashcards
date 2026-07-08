// One-time migration: copies data from the local better-sqlite3 file into Turso.
//
// Usage:
//   node --env-file=.env.local scripts/migrate-to-turso.mjs
//   node --env-file=.env.local scripts/migrate-to-turso.mjs --force   (wipe existing Turso rows first)

import path from "node:path";
import Database from "better-sqlite3";
import { createClient } from "@libsql/client";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  question TEXT NOT NULL,
  question_image TEXT,
  answer TEXT NOT NULL,
  answer_image TEXT,
  ease_factor REAL DEFAULT 2.5,
  interval_days INTEGER DEFAULT 1,
  next_review_date DATE DEFAULT CURRENT_DATE,
  repetitions INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  current_card_id INTEGER REFERENCES cards(id),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dates (
  day DATE PRIMARY KEY,
  cards_studied INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cards_subject_id ON cards(subject_id);
CREATE INDEX IF NOT EXISTS idx_cards_next_review_date ON cards(next_review_date);
`;

const force = process.argv.includes("--force");

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error(
    "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set.\n" +
      "Run with: node --env-file=.env.local scripts/migrate-to-turso.mjs",
  );
  process.exit(1);
}

const localDbPath = path.join(process.cwd(), "data", "flashcards.db");
const local = new Database(localDbPath, { readonly: true });

const subjects = local.prepare("SELECT * FROM subjects ORDER BY id").all();
const cards = local.prepare("SELECT * FROM cards ORDER BY id").all();
const users = local.prepare("SELECT * FROM users ORDER BY id").all();
const dates = local.prepare("SELECT * FROM dates ORDER BY day").all();

local.close();

console.log(
  `Local DB (${localDbPath}): ${subjects.length} subjects, ${cards.length} cards, ${users.length} users, ${dates.length} date rows.`,
);

const remote = createClient({ url, authToken });

async function main() {
  await remote.executeMultiple(SCHEMA_SQL);

  const existing = await remote.execute("SELECT COUNT(*) as c FROM subjects");
  const existingCount = Number(existing.rows[0].c);

  if (existingCount > 0 && !force) {
    console.error(
      `Turso database already has ${existingCount} subject row(s). Re-run with --force to wipe and re-import, ` +
        "or this migration has likely already run.",
    );
    process.exit(1);
  }

  if (force) {
    console.log("Wiping existing Turso rows (cards, subjects, users, dates)...");
    await remote.executeMultiple(`
DELETE FROM cards;
DELETE FROM subjects;
DELETE FROM users;
DELETE FROM dates;
    `);
  }

  const statements = [];

  for (const s of subjects) {
    statements.push({
      sql: "INSERT INTO subjects (id, name, description, created_at) VALUES (?, ?, ?, ?)",
      args: [s.id, s.name, s.description, s.created_at],
    });
  }

  for (const c of cards) {
    statements.push({
      sql: `
INSERT INTO cards (
  id, subject_id, question, question_image, answer, answer_image,
  ease_factor, interval_days, next_review_date, repetitions, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        c.id,
        c.subject_id,
        c.question,
        c.question_image,
        c.answer,
        c.answer_image,
        c.ease_factor,
        c.interval_days,
        c.next_review_date,
        c.repetitions,
        c.created_at,
      ],
    });
  }

  for (const u of users) {
    statements.push({
      sql: "INSERT INTO users (id, username, current_card_id, updated_at) VALUES (?, ?, ?, ?)",
      args: [u.id, u.username, u.current_card_id, u.updated_at],
    });
  }

  for (const d of dates) {
    statements.push({
      sql: "INSERT INTO dates (day, cards_studied) VALUES (?, ?)",
      args: [d.day, d.cards_studied],
    });
  }

  // Turso/libSQL batches run each statement independently; chunk to stay well under
  // request size limits and keep failures easy to pinpoint.
  const chunkSize = 100;
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    await remote.batch(chunk, "write");
    console.log(`Inserted ${Math.min(i + chunkSize, statements.length)}/${statements.length} rows...`);
  }

  const counts = await remote.batch(
    [
      "SELECT COUNT(*) as c FROM subjects",
      "SELECT COUNT(*) as c FROM cards",
      "SELECT COUNT(*) as c FROM users",
      "SELECT COUNT(*) as c FROM dates",
    ],
    "read",
  );

  console.log("Turso row counts after migration:");
  console.log("  subjects:", counts[0].rows[0].c);
  console.log("  cards:", counts[1].rows[0].c);
  console.log("  users:", counts[2].rows[0].c);
  console.log("  dates:", counts[3].rows[0].c);
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
