"use client";

import { useRouter } from "next/navigation";

const SESSION_KEY = "flashcards_session_v1";

type StudySession = {
  subjectIds: number[];
  cardIds: number[];
  index: number;
  startedAt: string;
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

export default function HomeActions() {
  const router = useRouter();

  return (
    <div className="row">
      <button
        type="button"
        onClick={() => {
          const s = loadSession();
          if (s && s.cardIds.length > 0 && s.index >= 0 && s.index < s.cardIds.length) {
            router.push("/study");
          } else {
            router.push("/new-session");
          }
        }}
      >
        Resume Study Session
      </button>
      <button type="button" onClick={() => router.push("/new-session")}
      >
        New Study Session
      </button>
      <button type="button" onClick={() => router.push("/edit-cards")}
      >
        Edit Cards
      </button>
    </div>
  );
}
