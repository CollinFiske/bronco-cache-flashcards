import { NextResponse } from "next/server";
import { getOverview } from "@/lib/repo";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getOverview());
}
