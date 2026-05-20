import { NextResponse } from "next/server";
import { getDueCardIds } from "@/lib/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { subjectIds?: unknown };
    const subjectIdsRaw = Array.isArray(body.subjectIds) ? body.subjectIds : [];
    const subjectIds = subjectIdsRaw
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));

    const cardIds = getDueCardIds(subjectIds);
    return NextResponse.json({ cardIds, total: cardIds.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
