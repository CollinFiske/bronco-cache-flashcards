import { NextResponse } from "next/server";
import { createCard, listCardsBySubject } from "@/lib/repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const subjectId = Number(url.searchParams.get("subjectId"));
  if (!Number.isFinite(subjectId)) {
    return NextResponse.json({ error: "subjectId is required" }, { status: 400 });
  }

  return NextResponse.json({ cards: await listCardsBySubject(subjectId) });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      subject_id?: unknown;
      question?: unknown;
      question_image?: unknown;
      answer?: unknown;
      answer_image?: unknown;
    };

    const subject_id = Number(body.subject_id);
    if (!Number.isFinite(subject_id)) throw new Error("subject_id is required");

    const question = typeof body.question === "string" ? body.question : "";
    const question_image = typeof body.question_image === "string" ? body.question_image : null;
    const answer = typeof body.answer === "string" ? body.answer : "";
    const answer_image = typeof body.answer_image === "string" ? body.answer_image : null;

    const card = await createCard({ subject_id, question, question_image, answer, answer_image });
    return NextResponse.json({ card }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
