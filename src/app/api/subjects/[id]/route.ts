import { NextResponse } from "next/server";
import { deleteSubject } from "@/lib/repo";

export const runtime = "nodejs";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid subject id" }, { status: 400 });
  }

  const result = deleteSubject(id);
  return NextResponse.json(result);
}
