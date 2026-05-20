import { getDb } from "@/lib/db";

export type Subject = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
};

export type SubjectWithDueCount = Subject & { due_count: number };

export type Card = {
  id: number;
  subject_id: number;
  question: string;
  question_image: string | null;
  answer: string;
  answer_image: string | null;
  ease_factor: number;
  interval_days: number;
  next_review_date: string;
  repetitions: number;
  created_at: string;
};

export type StudyCard = Card & { subject_name: string };

export type Overview = {
  dueCount: number;
  lastStudiedDay: string | null;
};

export type Rating = "again" | "hard" | "good" | "easy";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getOverview(): Overview {
  const db = getDb();
  const dueRow = db
    .prepare("SELECT COUNT(*) as count FROM cards WHERE next_review_date <= CURRENT_DATE")
    .get() as { count: number };

  const lastRow = db
    .prepare(
      "SELECT day FROM dates WHERE cards_studied > 0 ORDER BY day DESC LIMIT 1",
    )
    .get() as { day: string } | undefined;

  return {
    dueCount: dueRow?.count ?? 0,
    lastStudiedDay: lastRow?.day ?? null,
  };
}

export function listSubjects(includeDueCounts: boolean): (Subject | SubjectWithDueCount)[] {
  const db = getDb();

  if (!includeDueCounts) {
    return db
      .prepare(
        "SELECT id, name, description, created_at FROM subjects ORDER BY name COLLATE NOCASE",
      )
      .all() as Subject[];
  }

  return db
    .prepare(
      `
SELECT
  s.id,
  s.name,
  s.description,
  s.created_at,
  (
    SELECT COUNT(*)
    FROM cards c
    WHERE c.subject_id = s.id AND c.next_review_date <= CURRENT_DATE
  ) as due_count
FROM subjects s
ORDER BY s.name COLLATE NOCASE
      `,
    )
    .all() as SubjectWithDueCount[];
}

export function createSubject(name: string, description?: string | null): Subject {
  const db = getDb();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Subject name is required");
  }

  const info = db
    .prepare("INSERT INTO subjects (name, description) VALUES (?, ?)")
    .run(trimmed, description ?? null);

  const subject = db
    .prepare("SELECT id, name, description, created_at FROM subjects WHERE id = ?")
    .get(info.lastInsertRowid) as Subject;

  return subject;
}

export function deleteSubject(subjectId: number): { deleted: boolean } {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM cards WHERE subject_id = ?").run(subjectId);
    const res = db.prepare("DELETE FROM subjects WHERE id = ?").run(subjectId);
    return res.changes > 0;
  });

  return { deleted: tx() };
}

export function listCardsBySubject(subjectId: number): Card[] {
  const db = getDb();
  return db
    .prepare(
      `
SELECT
  id,
  subject_id,
  question,
  question_image,
  answer,
  answer_image,
  ease_factor,
  interval_days,
  next_review_date,
  repetitions,
  created_at
FROM cards
WHERE subject_id = ?
ORDER BY id DESC
      `,
    )
    .all(subjectId) as Card[];
}

export function createCard(input: {
  subject_id: number;
  question: string;
  question_image?: string | null;
  answer: string;
  answer_image?: string | null;
}): Card {
  const db = getDb();

  const question = input.question.trim();
  const answer = input.answer.trim();

  if (!question) throw new Error("Question is required");
  if (!answer) throw new Error("Answer is required");

  const info = db
    .prepare(
      `
INSERT INTO cards (
  subject_id,
  question,
  question_image,
  answer,
  answer_image
) VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.subject_id,
      question,
      input.question_image?.trim() || null,
      answer,
      input.answer_image?.trim() || null,
    );

  return db
    .prepare(
      `
SELECT
  id,
  subject_id,
  question,
  question_image,
  answer,
  answer_image,
  ease_factor,
  interval_days,
  next_review_date,
  repetitions,
  created_at
FROM cards
WHERE id = ?
      `,
    )
    .get(info.lastInsertRowid) as Card;
}

export function updateCard(
  cardId: number,
  input: {
    question: string;
    question_image?: string | null;
    answer: string;
    answer_image?: string | null;
  },
): Card {
  const db = getDb();

  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question) throw new Error("Question is required");
  if (!answer) throw new Error("Answer is required");

  db.prepare(
    `
UPDATE cards
SET
  question = ?,
  question_image = ?,
  answer = ?,
  answer_image = ?
WHERE id = ?
    `,
  ).run(
    question,
    input.question_image?.trim() || null,
    answer,
    input.answer_image?.trim() || null,
    cardId,
  );

  return db
    .prepare(
      `
SELECT
  id,
  subject_id,
  question,
  question_image,
  answer,
  answer_image,
  ease_factor,
  interval_days,
  next_review_date,
  repetitions,
  created_at
FROM cards
WHERE id = ?
      `,
    )
    .get(cardId) as Card;
}

export function deleteCard(cardId: number): { deleted: boolean } {
  const db = getDb();
  const res = db.prepare("DELETE FROM cards WHERE id = ?").run(cardId);
  return { deleted: res.changes > 0 };
}

export function getDueCardIds(subjectIds: number[]): number[] {
  const db = getDb();
  if (!subjectIds.length) return [];

  const placeholders = subjectIds.map(() => "?").join(",");
  const stmt = db.prepare(
    `
SELECT id
FROM cards
WHERE next_review_date <= CURRENT_DATE
  AND subject_id IN (${placeholders})
ORDER BY next_review_date ASC, id ASC
    `,
  );

  const rows = stmt.all(...subjectIds) as { id: number }[];
  return rows.map((r) => r.id);
}

export function getStudyCard(cardId: number): StudyCard | null {
  const db = getDb();
  const row = db
    .prepare(
      `
SELECT
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
  s.name as subject_name
FROM cards c
JOIN subjects s ON s.id = c.subject_id
WHERE c.id = ?
      `,
    )
    .get(cardId) as StudyCard | undefined;

  return row ?? null;
}

function computeSchedule(card: Pick<Card, "ease_factor" | "interval_days" | "repetitions">, rating: Rating) {
  // SM-2 inspired, simplified.
  const today = todayIsoDate();

  let easeFactor = card.ease_factor ?? 2.5;
  let repetitions = card.repetitions ?? 0;
  let intervalDays = card.interval_days ?? 1;

  if (rating === "again") {
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;

    if (rating === "hard") {
      easeFactor = Math.max(1.3, easeFactor - 0.15);
    } else if (rating === "easy") {
      easeFactor = easeFactor + 0.15;
    }

    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
  }

  return {
    easeFactor,
    repetitions,
    intervalDays,
    nextReviewDate: addDays(today, intervalDays),
  };
}

export function reviewCard(input: {
  cardId: number;
  rating: Rating;
  nextCardId?: number | null;
}): {
  updatedCard: Card;
  todayStudied: number;
} {
  const db = getDb();
  const today = todayIsoDate();

  const tx = db.transaction(() => {
    const existing = db
      .prepare(
        "SELECT ease_factor, interval_days, repetitions FROM cards WHERE id = ?",
      )
      .get(input.cardId) as {
      ease_factor: number;
      interval_days: number;
      repetitions: number;
    };

    const schedule = computeSchedule(
      {
        ease_factor: existing.ease_factor,
        interval_days: existing.interval_days,
        repetitions: existing.repetitions,
      },
      input.rating,
    );

    db.prepare(
      `
UPDATE cards
SET
  ease_factor = ?,
  interval_days = ?,
  repetitions = ?,
  next_review_date = ?
WHERE id = ?
      `,
    ).run(
      schedule.easeFactor,
      schedule.intervalDays,
      schedule.repetitions,
      schedule.nextReviewDate,
      input.cardId,
    );

    db.prepare(
      `
INSERT INTO dates (day, cards_studied)
VALUES (?, 1)
ON CONFLICT(day) DO UPDATE SET cards_studied = cards_studied + 1
      `,
    ).run(today);

    db.prepare(
      `
UPDATE users
SET current_card_id = ?, updated_at = CURRENT_TIMESTAMP
WHERE username = ?
      `,
    ).run(input.nextCardId ?? null, "default");

    const todayRow = db
      .prepare("SELECT cards_studied FROM dates WHERE day = ?")
      .get(today) as { cards_studied: number };

    const updated = db
      .prepare(
        `
SELECT
  id,
  subject_id,
  question,
  question_image,
  answer,
  answer_image,
  ease_factor,
  interval_days,
  next_review_date,
  repetitions,
  created_at
FROM cards
WHERE id = ?
        `,
      )
      .get(input.cardId) as Card;

    return { updated, todayStudied: todayRow.cards_studied };
  });

  const { updated, todayStudied } = tx();
  return { updatedCard: updated, todayStudied };
}
