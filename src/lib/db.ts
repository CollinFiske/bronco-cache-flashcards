import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function resolveDbPath(): string {
  const envPath = process.env.SQLITE_PATH;
  if (envPath && envPath.trim()) {
    return path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
  }

  // Vercel serverless functions can write to /tmp (ephemeral per deployment/instance).
  if (process.env.VERCEL) {
    return "/tmp/flashcards.db";
  }

  return path.join(process.cwd(), "data", "flashcards.db");
}

function initSchema(db: Database.Database) {
  db.pragma("foreign_keys = ON");

  db.exec(`
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
`);

  const existingUser = db
    .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
    .get("default") as { id: number } | undefined;

  if (!existingUser) {
    db.prepare("INSERT INTO users (username) VALUES (?)").run("default");
  }
}

declare global {
  var __flashcards_db__: Database.Database | undefined;
  var __flashcards_db_path__: string | undefined;
}

export function getDb(): Database.Database {
  const dbPath = resolveDbPath();

  if (globalThis.__flashcards_db__ && globalThis.__flashcards_db_path__ === dbPath) {
    return globalThis.__flashcards_db__;
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  initSchema(db);

  globalThis.__flashcards_db__ = db;
  globalThis.__flashcards_db_path__ = dbPath;

  return db;
}
