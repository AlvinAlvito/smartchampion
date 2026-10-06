import { NextResponse } from "next/server";
import { getProvinsi } from "@/lib/wilayah";
import { guardRoute, ipFrom } from "@/lib/security";

export async function GET(request: Request) {
  const limited = guardRoute(`wilayah:${ipFrom(request.headers)}`, 120, 60_000);
  if (limited) return limited;
  return NextResponse.json(await getProvinsi(), { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
}
