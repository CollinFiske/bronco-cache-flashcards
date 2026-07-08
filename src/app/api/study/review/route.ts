import { NextResponse } from "next/server";
import { reviewCard } from "@/lib/repo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      cardId?: unknown;
      rating?: unknown;
      nextCardId?: unknown;
    };

    const cardId = Number(body.cardId);
    if (!Number.isFinite(cardId)) throw new Error("cardId is required");

    const rating = body.rating;
    if (rating !== "again" && rating !== "hard" && rating !== "good" && rating !== "easy") {
      throw new Error("rating must be again|hard|good|easy");
    }

    const nextCardId = body.nextCardId == null ? null : Number(body.nextCardId);
    if (nextCardId != null && !Number.isFinite(nextCardId)) {
      throw new Error("nextCardId must be a number if provided");
    }

    const result = await reviewCard({ cardId, rating, nextCardId });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
