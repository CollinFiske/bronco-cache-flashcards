"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const SESSION_KEY = "flashcards_session_v1";

type SubjectRow = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  due_count: number;
};

export default function NewSessionPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/subjects?includeDue=1", { cache: "no-store" });
      const data = (await res.json()) as { subjects?: SubjectRow[] };
      if (!cancelled) {
        setSubjects(Array.isArray(data.subjects) ? data.subjects : []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSubjectIds = useMemo(() => {
    return subjects.filter((s) => selected[s.id]).map((s) => s.id);
  }, [subjects, selected]);

  const selectedCounts = useMemo(() => {
    const selectedSubjects = subjects.filter((s) => selected[s.id]);
    const subjectCount = selectedSubjects.length;
    const cardCount = selectedSubjects.reduce((sum, s) => sum + (s.due_count ?? 0), 0);
    return { subjectCount, cardCount };
  }, [subjects, selected]);

  async function startSession() {
    if (!selectedSubjectIds.length) {
      alert("Select at least one subject.");
      return;
    }

    setStarting(true);
    try {
      const res = await fetch("/api/study/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectIds: selectedSubjectIds }),
      });

      const data = (await res.json()) as { cardIds?: number[] };
      const cardIds = Array.isArray(data.cardIds) ? data.cardIds : [];

      if (cardIds.length === 0) {
        alert("No cards due today for the selected subjects.");
        return;
      }

      const session = {
        subjectIds: selectedSubjectIds,
        cardIds,
        index: 0,
        startedAt: new Date().toISOString(),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      router.push("/study");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main>
      <h1>New Study Session</h1>

      <div className="cardFrame" style={{ marginTop: 12 }}>
        <strong>Selected:</strong> {selectedCounts.subjectCount} subjects, {selectedCounts.cardCount} cards
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div className="muted">Loading subjects…</div>
        ) : subjects.length === 0 ? (
          <div className="muted">No subjects yet. Use “Edit Cards” to add one.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {subjects.map((s) => (
              <label key={s.id} className="cardFrame" style={{ display: "flex", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!selected[s.id]}
                  onChange={(e) => {
                    setSelected((prev) => ({ ...prev, [s.id]: e.target.checked }));
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div>
                    <strong>{s.name}</strong> <span className="muted">(due today: {s.due_count})</span>
                  </div>
                  {s.description ? <div className="muted">{s.description}</div> : null}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="row" style={{ marginTop: 16, justifyContent: "space-between" }}>
        <button type="button" onClick={() => router.push("/edit-cards")}
        >
          Edit Cards
        </button>
        <button type="button" onClick={startSession} disabled={starting}
        >
          {starting ? "Starting…" : "Start Study Session"}
        </button>
      </div>
    </main>
  );
}
