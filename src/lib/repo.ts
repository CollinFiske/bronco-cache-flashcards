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

export async function getOverview(): Promise<Overview> {
  const db = await getDb();

  const dueResult = await db.execute(
    "SELECT COUNT(*) as count FROM cards WHERE next_review_date <= CURRENT_DATE",
  );
  const dueRow = dueResult.rows[0] as unknown as { count: number } | undefined;

  const lastResult = await db.execute(
    "SELECT day FROM dates WHERE cards_studied > 0 ORDER BY day DESC LIMIT 1",
  );
  const lastRow = lastResult.rows[0] as unknown as { day: string } | undefined;

  return {
    dueCount: dueRow?.count ?? 0,
    lastStudiedDay: lastRow?.day ?? null,
  };
}

export async function listSubjects(
  includeDueCounts: boolean,
): Promise<(Subject | SubjectWithDueCount)[]> {
  const db = await getDb();

  if (!includeDueCounts) {
    const result = await db.execute(
      "SELECT id, name, description, created_at FROM subjects ORDER BY name COLLATE NOCASE",
    );
    return result.rows as unknown as Subject[];
  }

  const result = await db.execute(`
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
  `);
  return result.rows as unknown as SubjectWithDueCount[];
}

export async function createSubject(
  name: string,
  description?: string | null,
): Promise<Subject> {
  const db = await getDb();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Subject name is required");
  }

  const info = await db.execute({
    sql: "INSERT INTO subjects (name, description) VALUES (?, ?)",
    args: [trimmed, description ?? null],
  });

  const result = await db.execute({
    sql: "SELECT id, name, description, created_at FROM subjects WHERE id = ?",
    args: [info.lastInsertRowid ?? null],
  });

  return result.rows[0] as unknown as Subject;
}

export async function deleteSubject(subjectId: number): Promise<{ deleted: boolean }> {
  const db = await getDb();

  const results = await db.batch(
    [
      { sql: "DELETE FROM cards WHERE subject_id = ?", args: [subjectId] },
      { sql: "DELETE FROM subjects WHERE id = ?", args: [subjectId] },
    ],
    "write",
  );

  const subjectDeleteResult = results[1];
  return { deleted: subjectDeleteResult.rowsAffected > 0 };
}

export async function listCardsBySubject(subjectId: number): Promise<Card[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `
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
    args: [subjectId],
  });
  return result.rows as unknown as Card[];
}

export async function createCard(input: {
  subject_id: number;
  question: string;
  question_image?: string | null;
  answer: string;
  answer_image?: string | null;
}): Promise<Card> {
  const db = await getDb();

  const question = input.question.trim();
  const answer = input.answer.trim();

  if (!question) throw new Error("Question is required");
  if (!answer) throw new Error("Answer is required");

  const info = await db.execute({
    sql: `
INSERT INTO cards (
  subject_id,
  question,
  question_image,
  answer,
  answer_image
) VALUES (?, ?, ?, ?, ?)
    `,
    args: [
      input.subject_id,
      question,
      input.question_image?.trim() || null,
      answer,
      input.answer_image?.trim() || null,
    ],
  });

  const result = await db.execute({
    sql: `
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
    args: [info.lastInsertRowid ?? null],
  });

  return result.rows[0] as unknown as Card;
}

export async function updateCard(
  cardId: number,
  input: {
    question: string;
    question_image?: string | null;
    answer: string;
    answer_image?: string | null;
  },
): Promise<Card> {
  const db = await getDb();

  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question) throw new Error("Question is required");
  if (!answer) throw new Error("Answer is required");

  await db.execute({
    sql: `
UPDATE cards
SET
  question = ?,
  question_image = ?,
  answer = ?,
  answer_image = ?
WHERE id = ?
    `,
    args: [
      question,
      input.question_image?.trim() || null,
      answer,
      input.answer_image?.trim() || null,
      cardId,
    ],
  });

  const result = await db.execute({
    sql: `
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
    args: [cardId],
  });

  return result.rows[0] as unknown as Card;
}

export async function deleteCard(cardId: number): Promise<{ deleted: boolean }> {
  const db = await getDb();
  const res = await db.execute({
    sql: "DELETE FROM cards WHERE id = ?",
    args: [cardId],
  });
  return { deleted: res.rowsAffected > 0 };
}

export async function getDueCardIds(subjectIds: number[]): Promise<number[]> {
  const db = await getDb();
  if (!subjectIds.length) return [];

  const placeholders = subjectIds.map(() => "?").join(",");
  const result = await db.execute({
    sql: `
SELECT id
FROM cards
WHERE next_review_date <= CURRENT_DATE
  AND subject_id IN (${placeholders})
ORDER BY next_review_date ASC, id ASC
    `,
    args: subjectIds,
  });

  const rows = result.rows as unknown as { id: number }[];
  return rows.map((r) => r.id);
}

export async function getStudyCard(cardId: number): Promise<StudyCard | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `
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
    args: [cardId],
  });

  const row = result.rows[0] as unknown as StudyCard | undefined;
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

export async function reviewCard(input: {
  cardId: number;
  rating: Rating;
  nextCardId?: number | null;
}): Promise<{
  updatedCard: Card;
  todayStudied: number;
}> {
  const db = await getDb();
  const today = todayIsoDate();

  const tx = await db.transaction("write");
  try {
    const existingResult = await tx.execute({
      sql: "SELECT ease_factor, interval_days, repetitions FROM cards WHERE id = ?",
      args: [input.cardId],
    });
    const existing = existingResult.rows[0] as unknown as {
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

    await tx.execute({
      sql: `
UPDATE cards
SET
  ease_factor = ?,
  interval_days = ?,
  repetitions = ?,
  next_review_date = ?
WHERE id = ?
      `,
      args: [
        schedule.easeFactor,
        schedule.intervalDays,
        schedule.repetitions,
        schedule.nextReviewDate,
        input.cardId,
      ],
    });

    await tx.execute({
      sql: `
INSERT INTO dates (day, cards_studied)
VALUES (?, 1)
ON CONFLICT(day) DO UPDATE SET cards_studied = cards_studied + 1
      `,
      args: [today],
    });

    await tx.execute({
      sql: `
UPDATE users
SET current_card_id = ?, updated_at = CURRENT_TIMESTAMP
WHERE username = ?
      `,
      args: [input.nextCardId ?? null, "default"],
    });

    const todayResult = await tx.execute({
      sql: "SELECT cards_studied FROM dates WHERE day = ?",
      args: [today],
    });
    const todayRow = todayResult.rows[0] as unknown as { cards_studied: number };

    const updatedResult = await tx.execute({
      sql: `
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
      args: [input.cardId],
    });
    const updated = updatedResult.rows[0] as unknown as Card;

    await tx.commit();

    return { updatedCard: updated, todayStudied: todayRow.cards_studied };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
