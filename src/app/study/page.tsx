"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const SESSION_KEY = "flashcards_session_v1";

type StudySession = {
  subjectIds: number[];
  cardIds: number[];
  index: number;
  startedAt: string;
};

type StudyCard = {
  id: number;
  subject_id: number;
  subject_name: string;
  question: string;
  question_image: string | null;
  answer: string;
  answer_image: string | null;
};

function loadSession(): StudySession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudySession;
    if (!Array.isArray(parsed.cardIds) || typeof parsed.index !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session: StudySession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export default function StudyPage() {
  const router = useRouter();

  const [session, setSession] = useState<StudySession | null>(null);
  const [card, setCard] = useState<StudyCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(s);
  }, []);

  const currentCardId = useMemo(() => {
    if (!session) return null;
    if (session.index < 0 || session.index >= session.cardIds.length) return null;
    return session.cardIds[session.index];
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      setLoading(true);
      setFlipped(false);

      if (!currentCardId) {
        setCard(null);
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/study/card?id=${currentCardId}`, { cache: "no-store" });
      const data = (await res.json()) as { card?: StudyCard; error?: string };

      if (!cancelled) {
        if (!res.ok) {
          setError(data.error ?? "Failed to load card");
          setCard(null);
        } else {
          setCard(data.card ?? null);
        }
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [currentCardId]);

  const progress = useMemo(() => {
    if (!session) return { studied: 0, total: 0 };
    return { studied: Math.max(0, session.index), total: session.cardIds.length };
  }, [session]);

  async function submitRating(rating: "again" | "hard" | "good" | "easy") {
    if (!session || !currentCardId) return;

    setSubmitting(true);
    try {
      const nextIndex = session.index + 1;
      const nextCardId = nextIndex < session.cardIds.length ? session.cardIds[nextIndex] : null;

      const res = await fetch("/api/study/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: currentCardId, rating, nextCardId }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error ?? "Failed to save review");
        return;
      }

      if (nextIndex >= session.cardIds.length) {
        clearSession();
        setSession(null);
        setCard(null);
        setFlipped(false);
        return;
      }

      const updated = { ...session, index: nextIndex };
      saveSession(updated);
      setSession(updated);
      setFlipped(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!session) {
    return (
      <main>
        <h1>Study</h1>
        <div className="muted" style={{ marginTop: 8 }}>
          No active study session.
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" onClick={() => router.push("/new-session")}
          >
            Start a New Session
          </button>
          <button type="button" onClick={() => router.push("/")}
          >
            Back to Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="navbar">
        <div className="row" style={{ alignItems: "center" }}>
          <Link href="/">Home</Link>
          <span className="muted">
            Progress: {progress.studied} / {progress.total}
          </span>
        </div>
        <div>
          <strong>{card?.subject_name ?? ""}</strong>
        </div>
      </div>

      {loading ? (
        <div className="muted">Loading card…</div>
      ) : error ? (
        <div className="cardFrame">
          <div>
            <strong>Error:</strong> {error}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" onClick={() => router.push("/new-session")}
            >
              New Session
            </button>
          </div>
        </div>
      ) : !card ? (
        <div className="muted">No card.</div>
      ) : (
        <>
          <div className={flipped ? "flipShell flipped" : "flipShell"}>
            <div className="flipInner">
              <div className="flipSide">
                <div className="cardFrame" style={{ minHeight: 260 }}>
                  <div>
                    <strong>Question</strong>
                  </div>
                  <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{card.question}</div>
                  {card.question_image ? (
                    <div style={{ marginTop: 10 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={card.question_image} alt="" style={{ maxWidth: "100%" }} />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flipSide flipBack">
                <div className="cardFrame" style={{ minHeight: 260 }}>
                  <div>
                    <strong>Question</strong>
                  </div>
                  <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{card.question}</div>
                  {card.question_image ? (
                    <div style={{ marginTop: 10 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={card.question_image} alt="" style={{ maxWidth: "100%" }} />
                    </div>
                  ) : null}

                  <hr style={{ margin: "12px 0" }} />

                  <div>
                    <strong>Answer</strong>
                  </div>
                  <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{card.answer}</div>
                  {card.answer_image ? (
                    <div style={{ marginTop: 10 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={card.answer_image} alt="" style={{ maxWidth: "100%" }} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" onClick={() => setFlipped((v) => !v)}
            >
              Flip
            </button>
          </div>

          {flipped ? (
            <div className="row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="ratingAgain"
                disabled={submitting}
                onClick={() => submitRating("again")}
              >
                Again
              </button>
              <button
                type="button"
                className="ratingHard"
                disabled={submitting}
                onClick={() => submitRating("hard")}
              >
                Hard
              </button>
              <button
                type="button"
                className="ratingGood"
                disabled={submitting}
                onClick={() => submitRating("good")}
              >
                Good
              </button>
              <button
                type="button"
                className="ratingEasy"
                disabled={submitting}
                onClick={() => submitRating("easy")}
              >
                Easy
              </button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
