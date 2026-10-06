import { NextResponse } from "next/server";
import { getKabKota } from "@/lib/wilayah";
import { guardRoute, ipFrom } from "@/lib/security";

export async function GET(request: Request, { params }: RouteContext<"/api/wilayah/kabupaten-kota/[kode]">) {
  const limited = guardRoute(`wilayah:${ipFrom(request.headers)}`, 120, 60_000);
  if (limited) return limited;
  const { kode } = await params;
  const list = await getKabKota(kode);
  if (!list.length) return NextResponse.json({ message: "Provinsi tidak ditemukan" }, { status: 404 });
  return NextResponse.json(list, { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } });
}
