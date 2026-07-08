// Imports cards from CSV into Turso.
//
// Usage:
//   node --env-file=.env.local scripts/import-cards-csv.mjs <cards1.csv> [cards2.csv ...] [--subject-id <id>]

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
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

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  return v ?? null;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function inferSubjectNameFromFile(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  const cleaned = base.replace(/_cards$/i, "");
  return cleaned.replace(/_/g, " ").trim();
}

function usage() {
  console.error(
    "Usage: node --env-file=.env.local scripts/import-cards-csv.mjs <cards1.csv> [cards2.csv ...] [--subject-id <id>]\n\n" +
      "CSV should have headers matching the cards table columns. If subject_id is missing,\n" +
      "the script will create/use a subject inferred from the file name and apply it to all rows.\n\n" +
      "Recommended headers:\n" +
      "subject_id,question,question_image,answer,answer_image,ease_factor,interval_days,next_review_date,repetitions\n",
  );
}

function resolveCsvPath(p) {
  if (fs.existsSync(p)) return p;

  // Convenience: this repo uses csv_files/, but users may type csvfiles/.
  const normalized = String(p);
  const alt1 = normalized.replace(/^csvfiles[\\/]/i, "csv_files/");
  if (alt1 !== normalized && fs.existsSync(alt1)) return alt1;

  const alt2 = normalized.replace(/^csv_files[\\/]/i, "csvfiles/");
  if (alt2 !== normalized && fs.existsSync(alt2)) return alt2;

  return p;
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

const forcedSubjectIdRaw = readArg("--subject-id");
const forcedSubjectId = forcedSubjectIdRaw ? Number(forcedSubjectIdRaw) : null;
if (forcedSubjectIdRaw && !Number.isFinite(forcedSubjectId)) {
  console.error("--subject-id must be a number");
  process.exit(1);
}

const csvPaths = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (!a) continue;
  if (a === "--subject-id") {
    i += 1;
    continue;
  }
  if (a.startsWith("--")) {
    continue;
  }
  csvPaths.push(a);
}

if (csvPaths.length === 0) {
  usage();
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error(
    "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set.\n" +
      "Run with: node --env-file=.env.local scripts/import-cards-csv.mjs ...",
  );
  process.exit(1);
}

const db = createClient({ url, authToken });

async function getOrCreateSubjectIdByName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    throw new Error("Could not infer subject name from file name");
  }
  const existing = await db.execute({
    sql: "SELECT id FROM subjects WHERE name = ? COLLATE NOCASE LIMIT 1",
    args: [trimmed],
  });
  if (existing.rows[0]) return Number(existing.rows[0].id);

  const info = await db.execute({
    sql: "INSERT INTO subjects (name, description) VALUES (?, ?)",
    args: [trimmed, "Created automatically during CSV card import"],
  });
  return Number(info.lastInsertRowid);
}

async function ensureSubjectExists(subjectId) {
  const existing = await db.execute({ sql: "SELECT 1 FROM subjects WHERE id = ?", args: [subjectId] });
  if (existing.rows[0]) return;

  await db.execute({
    sql: "INSERT INTO subjects (id, name, description) VALUES (?, ?, ?)",
    args: [subjectId, `Subject ${subjectId}`, "Created automatically during CSV card import"],
  });
}

async function importRows(rows, fallbackSubjectId, sourceLabel) {
  let inserted = 0;

  for (const r of rows) {
    const subjectIdRaw = forcedSubjectId ?? Number(r.subject_id);
    const subjectId = Number.isFinite(subjectIdRaw) ? subjectIdRaw : fallbackSubjectId;
    if (!Number.isFinite(subjectId)) {
      throw new Error(
        `Missing/invalid subject_id in ${sourceLabel} (add subject_id column or pass --subject-id)`,
      );
    }

    await ensureSubjectExists(subjectId);

    const question = String(r.question ?? "").trim();
    const answer = String(r.answer ?? "").trim();
    if (!question) throw new Error("Missing question");
    if (!answer) throw new Error("Missing answer");

    const questionImage = r.question_image ? String(r.question_image).trim() : null;
    const answerImage = r.answer_image ? String(r.answer_image).trim() : null;

    const easeFactorRaw =
      r.ease_factor === undefined || r.ease_factor === "" ? null : Number(r.ease_factor);
    const intervalDaysRaw =
      r.interval_days === undefined || r.interval_days === "" ? null : Number(r.interval_days);
    const nextReviewDateRaw = r.next_review_date ? String(r.next_review_date).trim() : "";
    const repetitionsRaw =
      r.repetitions === undefined || r.repetitions === "" ? null : Number(r.repetitions);

    const easeFactor = Number.isFinite(easeFactorRaw) ? easeFactorRaw : 2.5;
    const intervalDays = Number.isFinite(intervalDaysRaw) ? intervalDaysRaw : 1;
    const nextReviewDate = nextReviewDateRaw ? nextReviewDateRaw : todayIsoDate();
    const repetitions = Number.isFinite(repetitionsRaw) ? repetitionsRaw : 0;

    await db.execute({
      sql: `
INSERT INTO cards (
  subject_id, question, question_image, answer, answer_image,
  ease_factor, interval_days, next_review_date, repetitions
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        subjectId,
        question,
        questionImage,
        answer,
        answerImage,
        easeFactor,
        intervalDays,
        nextReviewDate,
        repetitions,
      ],
    });
    inserted += 1;
  }

  return inserted;
}

try {
  await db.executeMultiple(SCHEMA_SQL);

  let total = 0;

  for (const csvPath of csvPaths) {
    const resolvedPath = resolveCsvPath(csvPath);
    const csvText = fs.readFileSync(resolvedPath, "utf8");
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const fallbackSubjectId =
      forcedSubjectId ?? (await getOrCreateSubjectIdByName(inferSubjectNameFromFile(resolvedPath)));

    const count = await importRows(records, fallbackSubjectId, resolvedPath);
    total += count;
    console.log(`Imported ${count} cards from ${resolvedPath}`);
  }

  console.log(`Imported ${total} cards into Turso.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
