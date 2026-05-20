import { NextResponse } from "next/server";
import { deleteCard, updateCard } from "@/lib/repo";

export const runtime = "nodejs";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isFinite(id)) throw new Error("Invalid card id");

    const body = (await req.json()) as {
      question?: unknown;
      question_image?: unknown;
      answer?: unknown;
      answer_image?: unknown;
    };

    const question = typeof body.question === "string" ? body.question : "";
    const question_image = typeof body.question_image === "string" ? body.question_image : null;
    const answer = typeof body.answer === "string" ? body.answer : "";
    const answer_image = typeof body.answer_image === "string" ? body.answer_image : null;

    const card = updateCard(id, { question, question_image, answer, answer_image });
    return NextResponse.json({ card });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid card id" }, { status: 400 });
  }

  return NextResponse.json(deleteCard(id));
}
