import { NextResponse } from "next/server";
import { createSubject, listSubjects } from "@/lib/repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeDue = url.searchParams.get("includeDue") === "1";
  return NextResponse.json({ subjects: await listSubjects(includeDue) });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: unknown; description?: unknown };
    const name = typeof body.name === "string" ? body.name : "";
    const description = typeof body.description === "string" ? body.description : null;

    const subject = await createSubject(name, description);
    return NextResponse.json({ subject }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
