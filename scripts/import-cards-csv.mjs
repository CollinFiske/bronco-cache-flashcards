import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";

function resolveDbPath() {
  const envPath = process.env.SQLITE_PATH;
  if (envPath && envPath.trim()) {
    return path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
  }
  if (process.env.VERCEL) return "/tmp/flashcards.db";
  return path.join(process.cwd(), "data", "flashcards.db");
}

function initSchema(db) {
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
}

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
    "Usage: node scripts/import-cards-csv.mjs <cards1.csv> [cards2.csv ...] [--subject-id <id>]\n\n" +
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

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
initSchema(db);

db.pragma("foreign_keys = ON");


const insert = db.prepare(`
INSERT INTO cards (
  subject_id,
  question,
  question_image,
  answer,
  answer_image,
  ease_factor,
  interval_days,
  next_review_date,
  repetitions
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Prepared statements to check and automatically create missing subjects
const checkSubject = db.prepare(`SELECT 1 FROM subjects WHERE id = ?`);
const insertSubject = db.prepare(`INSERT INTO subjects (id, name, description) VALUES (?, ?, ?)`);
const getSubjectByName = db.prepare(`SELECT id FROM subjects WHERE name = ? COLLATE NOCASE LIMIT 1`);
const createSubjectByName = db.prepare(`INSERT INTO subjects (name, description) VALUES (?, ?)`);

function getOrCreateSubjectIdByName(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    throw new Error("Could not infer subject name from file name");
  }
  const existing = getSubjectByName.get(trimmed);
  if (existing && typeof existing.id === "number") return existing.id;
  const info = createSubjectByName.run(trimmed, "Created automatically during CSV card import");
  return Number(info.lastInsertRowid);
}

const tx = db.transaction((rows, fallbackSubjectId, sourceLabel) => {
  let inserted = 0;
  for (const r of rows) {
    const subjectIdRaw = forcedSubjectId ?? Number(r.subject_id);
    const subjectId = Number.isFinite(subjectIdRaw) ? subjectIdRaw : fallbackSubjectId;
    if (!Number.isFinite(subjectId)) {
      throw new Error(
        `Missing/invalid subject_id in ${sourceLabel} (add subject_id column or pass --subject-id)`,
      );
    }

    // Auto-create the parent subject row if it doesn't exist yet
    if (!checkSubject.get(subjectId)) {
      const defaultName = `Subject ${subjectId}`;
      insertSubject.run(subjectId, defaultName, "Created automatically during CSV card import");
    }

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

    insert.run(
      subjectId,
      question,
      questionImage,
      answer,
      answerImage,
      easeFactor,
      intervalDays,
      nextReviewDate,
      repetitions,
    );
    inserted += 1;
  }
  return inserted;
});

try {
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
      forcedSubjectId ?? getOrCreateSubjectIdByName(inferSubjectNameFromFile(resolvedPath));

    const count = tx(records, fallbackSubjectId, resolvedPath);
    total += count;
    console.log(`Imported ${count} cards from ${resolvedPath}`);
  }

  console.log(`Imported ${total} cards into ${dbPath}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  db.close();
}