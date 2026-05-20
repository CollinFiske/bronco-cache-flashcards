"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Subject = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
};

type Card = {
  id: number;
  subject_id: number;
  question: string;
  question_image: string | null;
  answer: string;
  answer_image: string | null;
  created_at: string;
};

type CardDraft = {
  id?: number;
  question: string;
  question_image: string;
  answer: string;
  answer_image: string;
};

export default function EditCardsPage() {
  const router = useRouter();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [cards, setCards] = useState<Card[]>([]);

  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingCards, setLoadingCards] = useState(false);

  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");

  const [showDeleteSubject, setShowDeleteSubject] = useState(false);
  const [confirmDeleteSubject, setConfirmDeleteSubject] = useState(false);

  const [showCardModal, setShowCardModal] = useState(false);
  const [cardDraft, setCardDraft] = useState<CardDraft>({
    question: "",
    question_image: "",
    answer: "",
    answer_image: "",
  });

  const [openMenuCardId, setOpenMenuCardId] = useState<number | null>(null);

  const selectedSubject = useMemo(() => {
    return selectedSubjectId == null
      ? null
      : subjects.find((s) => s.id === selectedSubjectId) ?? null;
  }, [subjects, selectedSubjectId]);

  async function refreshSubjects(selectId?: number) {
    setLoadingSubjects(true);
    const res = await fetch("/api/subjects", { cache: "no-store" });
    const data = (await res.json()) as { subjects?: Subject[] };
    const next = Array.isArray(data.subjects) ? data.subjects : [];
    setSubjects(next);
    setLoadingSubjects(false);

    if (selectId != null) {
      setSelectedSubjectId(selectId);
    } else if (selectedSubjectId == null && next.length > 0) {
      setSelectedSubjectId(next[0].id);
    } else if (selectedSubjectId != null && !next.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(next.length ? next[0].id : null);
    }
  }

  async function refreshCards(subjectId: number) {
    setLoadingCards(true);
    const res = await fetch(`/api/cards?subjectId=${subjectId}`, { cache: "no-store" });
    const data = (await res.json()) as { cards?: Card[] };
    setCards(Array.isArray(data.cards) ? data.cards : []);
    setLoadingCards(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedSubjectId == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCards([]);
      return;
    }
    refreshCards(selectedSubjectId);
  }, [selectedSubjectId]);

  async function onAddSubject() {
    const name = newSubjectName.trim();
    if (!name) {
      alert("Subject name is required");
      return;
    }

    const res = await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error ?? "Failed to add subject");
      return;
    }

    const data = (await res.json()) as { subject?: Subject };
    const created = data.subject;

    setShowAddSubject(false);
    setNewSubjectName("");
    await refreshSubjects(created?.id);
  }

  async function onDeleteSubject() {
    if (!selectedSubjectId) return;
    if (!confirmDeleteSubject) {
      alert("Please check the confirmation box first.");
      return;
    }

    const res = await fetch(`/api/subjects/${selectedSubjectId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error ?? "Failed to delete subject");
      return;
    }

    setShowDeleteSubject(false);
    setConfirmDeleteSubject(false);
    await refreshSubjects();
  }

  function openAddCard() {
    if (!selectedSubjectId) {
      alert("Create and select a subject first.");
      return;
    }

    setCardDraft({ question: "", question_image: "", answer: "", answer_image: "" });
    setShowCardModal(true);
  }

  function openEditCard(c: Card) {
    setCardDraft({
      id: c.id,
      question: c.question,
      question_image: c.question_image ?? "",
      answer: c.answer,
      answer_image: c.answer_image ?? "",
    });
    setShowCardModal(true);
  }

  async function saveCard() {
    if (!selectedSubjectId) return;

    const payload = {
      subject_id: selectedSubjectId,
      question: cardDraft.question,
      question_image: cardDraft.question_image,
      answer: cardDraft.answer,
      answer_image: cardDraft.answer_image,
    };

    const isEdit = typeof cardDraft.id === "number";

    const res = await fetch(isEdit ? `/api/cards/${cardDraft.id}` : "/api/cards", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error ?? "Failed to save card");
      return;
    }

    setShowCardModal(false);
    await refreshCards(selectedSubjectId);
  }

  async function removeCard(cardId: number) {
    if (!confirm("Delete this card?")) return;

    const res = await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      alert(data.error ?? "Failed to delete card");
      return;
    }

    if (selectedSubjectId) await refreshCards(selectedSubjectId);
  }

  return (
    <main>
      <h1>Edit Cards</h1>

      <div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
        <button type="button" onClick={() => router.push("/")}
        >
          Home
        </button>
        <button type="button" onClick={() => router.push("/new-session")}
        >
          New Study Session
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>
          <strong>Subject:</strong>{" "}
          {loadingSubjects ? (
            <span className="muted">Loading…</span>
          ) : (
            <select
              value={selectedSubjectId ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSelectedSubjectId(Number.isFinite(v) ? v : null);
              }}
            >
              {subjects.length === 0 ? <option value="">(no subjects)</option> : null}
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" onClick={() => setShowAddSubject(true)}
        >
          Add Subject
        </button>
        <button
          type="button"
          onClick={() => {
            if (!selectedSubjectId) {
              alert("Select a subject first.");
              return;
            }
            setShowDeleteSubject(true);
            setConfirmDeleteSubject(false);
          }}
        >
          Delete Subject
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" onClick={openAddCard} style={{ width: "100%" }}
        >
          Add Card
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <h2 style={{ margin: 0 }}>Cards</h2>
        <div className="muted" style={{ marginTop: 4 }}>
          {selectedSubject ? `Subject: ${selectedSubject.name}` : "No subject selected"}
        </div>

        {loadingCards ? (
          <div className="muted" style={{ marginTop: 8 }}>
            Loading cards…
          </div>
        ) : cards.length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>
            No cards in this subject yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {cards.map((c) => (
              <div
                key={c.id}
                className="cardFrame"
                style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}
              >
                <div style={{ flex: 1, display: "flex", gap: 12 }}>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <strong>Q:</strong>{" "}
                    <span title={c.question}>
                      {c.question.length > 80 ? c.question.slice(0, 80) + "…" : c.question}
                    </span>
                  </div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <strong>A:</strong>{" "}
                    <span title={c.answer}>
                      {c.answer.length > 80 ? c.answer.slice(0, 80) + "…" : c.answer}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label="Card menu"
                  onClick={() => setOpenMenuCardId((prev) => (prev === c.id ? null : c.id))}
                >
                  ⋮
                </button>

                {openMenuCardId === c.id ? (
                  <div className="menu">
                    <div className="row">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuCardId(null);
                          openEditCard(c);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuCardId(null);
                          removeCard(c.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddSubject ? (
        <div className="modalOverlay" onClick={() => setShowAddSubject(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Add Subject</h2>
            <div>
              <label>
                Name:{" "}
                <input
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  style={{ width: "100%" }}
                />
              </label>
            </div>
            <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <button type="button" onClick={() => setShowAddSubject(false)}
              >
                Cancel
              </button>
              <button type="button" onClick={onAddSubject}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteSubject ? (
        <div className="modalOverlay" onClick={() => setShowDeleteSubject(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Delete Subject</h2>
            <div>
              Are you sure you want to delete <strong>{selectedSubject?.name}</strong>? This will
              delete all cards in the subject.
            </div>
            <label style={{ display: "block", marginTop: 12 }}>
              <input
                type="checkbox"
                checked={confirmDeleteSubject}
                onChange={(e) => setConfirmDeleteSubject(e.target.checked)}
              />{" "}
              Yes, I understand.
            </label>
            <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <button type="button" onClick={() => setShowDeleteSubject(false)}
              >
                Cancel
              </button>
              <button type="button" onClick={onDeleteSubject}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCardModal ? (
        <div className="modalOverlay" onClick={() => setShowCardModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>{cardDraft.id ? "Edit Card" : "Add Card"}</h2>

            <div style={{ display: "grid", gap: 8 }}>
              <label>
                Question:
                <textarea
                  value={cardDraft.question}
                  onChange={(e) => setCardDraft((p) => ({ ...p, question: e.target.value }))}
                  rows={3}
                  style={{ width: "100%" }}
                />
              </label>
              <label>
                Question image URL (optional):
                <input
                  value={cardDraft.question_image}
                  onChange={(e) => setCardDraft((p) => ({ ...p, question_image: e.target.value }))}
                  style={{ width: "100%" }}
                />
              </label>
              <label>
                Answer:
                <textarea
                  value={cardDraft.answer}
                  onChange={(e) => setCardDraft((p) => ({ ...p, answer: e.target.value }))}
                  rows={3}
                  style={{ width: "100%" }}
                />
              </label>
              <label>
                Answer image URL (optional):
                <input
                  value={cardDraft.answer_image}
                  onChange={(e) => setCardDraft((p) => ({ ...p, answer_image: e.target.value }))}
                  style={{ width: "100%" }}
                />
              </label>
            </div>

            <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <button type="button" onClick={() => setShowCardModal(false)}
              >
                Cancel
              </button>
              <button type="button" onClick={saveCard}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
