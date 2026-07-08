import { NextResponse } from "next/server";
import { getOverview } from "@/lib/repo";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getOverview());
}
