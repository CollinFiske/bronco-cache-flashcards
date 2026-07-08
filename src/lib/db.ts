import { createClient, type Client } from "@libsql/client";

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

function createTursoClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Add it (and TURSO_AUTH_TOKEN) to your environment.",
    );
  }

  return createClient({ url, authToken });
}

async function initSchema(db: Client): Promise<void> {
  await db.executeMultiple(SCHEMA_SQL);

  const existingUser = await db.execute({
    sql: "SELECT id FROM users WHERE username = ? LIMIT 1",
    args: ["default"],
  });

  if (existingUser.rows.length === 0) {
    await db.execute({
      sql: "INSERT INTO users (username) VALUES (?)",
      args: ["default"],
    });
  }
}

declare global {
  var __flashcards_client__: Client | undefined;
  var __flashcards_schema_ready__: Promise<void> | undefined;
}

export async function getDb(): Promise<Client> {
  if (!globalThis.__flashcards_client__) {
    globalThis.__flashcards_client__ = createTursoClient();
  }

  if (!globalThis.__flashcards_schema_ready__) {
    globalThis.__flashcards_schema_ready__ = initSchema(globalThis.__flashcards_client__);
  }
  await globalThis.__flashcards_schema_ready__;

  return globalThis.__flashcards_client__;
}
