import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";
import { Filter, RotateCcw, Search, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { PageTitle } from "@/components/ui";
import { Pagination, readPage } from "@/components/pagination";
import { UsersTable } from "./users-table";

export const metadata = { title: "Pengguna" };
export const dynamic = "force-dynamic";

const TABS = [
  { v: "", l: "Tim (semua admin)" },
  { v: "ADMIN", l: "Admin Pelatihan" },
  { v: "SMARTCHAMPION", l: "Admin SmartChampion" },
  { v: "SUPERADMIN", l: "Superadmin" },
  { v: "ROOT", l: "Root" },
  { v: "PESERTA", l: "Peserta" },
];

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const session = await requireSuperadmin();
  const sp = await searchParams;
  const role = typeof sp.role === "string" && sp.role in ROLE_LABEL ? (sp.role as Role) : undefined;
  const { page, skip, take } = readPage(sp);
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  // Filter khusus tab Peserta
  const isPeserta = role === "PESERTA";
  const q = isPeserta ? get("q") : "";
  const jenjang = isPeserta && ["SD", "SMP", "SMA", "UMUM"].includes(get("jenjang")) ? get("jenjang") : "";
  const provinsi = isPeserta ? get("provinsi") : "";
  const status = isPeserta && ["aktif", "nonaktif"].includes(get("status")) ? get("status") : "";
  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : { role: { in: ["ROOT", "SUPERADMIN", "ADMIN", "SMARTCHAMPION"] as Role[] } }),
    ...(q
      ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }, { school: { contains: q } }, { kabKota: { contains: q } }] }
      : {}),
    ...(jenjang ? { jenjang: jenjang as Prisma.UserWhereInput["jenjang"] } : {}),
    ...(provinsi ? { provinsi } : {}),
    ...(status ? { isActive: status === "aktif" } : {}),
  };
  const activeFilters = [q, jenjang, provinsi, status].filter(Boolean).length;
  const provinsiList = isPeserta
    ? (
        await prisma.user.findMany({
          where: { role: "PESERTA", provinsi: { not: null } },
          distinct: ["provinsi"],
          select: { provinsi: true },
          orderBy: { provinsi: "asc" },
        })
      ).map((u) => u.provinsi!)
    : [];
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { id: "asc" }],
      skip,
      take,
      include: { _count: { select: { leads: true, registrations: true } } },
    }),
  ]);

  return (
    <>
      <PageTitle
        icon={Users}
        eyebrow="Root"
        title="Pengguna"
        subtitle="Kelola akun root, superadmin (lihat saja), admin pelatihan, admin SmartChampion, dan peserta."
      />
      <div className="card mb-5 flex gap-1.5 overflow-x-auto p-1.5!">
        {TABS.map((t) => (
          <Link
            key={t.l}
            href={t.v ? `/admin/users?role=${t.v}` : "/admin/users"}
            className={cn(
              "shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold transition",
              (role ?? "") === t.v ? "bg-linear-to-r from-brand-600 to-navy-700 text-white shadow-md" : "text-navy-500 hover:bg-brand-50 hover:text-brand-700",
            )}
          >
            {t.l}
          </Link>
        ))}
      </div>
      {isPeserta && (
        <form action="/admin/users" className="card mb-5 animate-fade-up">
          <input type="hidden" name="role" value="PESERTA" />
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-700">
            <Filter className="h-4 w-4 text-brand-600" /> Cari peserta
            {activeFilters > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] text-white">{activeFilters} aktif</span>}
            <span className="ml-auto text-xs font-semibold text-navy-400">{total.toLocaleString("id-ID")} peserta</span>
          </div>
          <div className="grid gap-3 md:grid-cols-6">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
              <input name="q" defaultValue={q} placeholder="Nama / email / WA / sekolah / kota" className="input pl-10" />
            </div>
            <select name="jenjang" defaultValue={jenjang} className="input">
              <option value="">Semua jenjang</option>
              <option value="SD">SD</option>
              <option value="SMP">SMP</option>
              <option value="SMA">SMA</option>
              <option value="UMUM">Umum</option>
            </select>
            <select name="provinsi" defaultValue={provinsi} className="input">
              <option value="">Semua provinsi</option>
              {provinsiList.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select name="status" defaultValue={status} className="input">
              <option value="">Semua status</option>
              <option value="aktif">Aktif</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
            <div className="flex gap-2">
              <Link href="/admin/users?role=PESERTA" className="btn-ghost px-3!" title="Reset filter" aria-label="Reset filter">
                <RotateCcw className="h-4 w-4" />
              </Link>
              <button className="btn-primary flex-1">
                <Search className="h-4 w-4" /> Cari
              </button>
            </div>
          </div>
        </form>
      )}
      <UsersTable
        meId={session.userId}
        canImpersonate={session.role === "ROOT"}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          kelas: u.kelas,
          domisili: u.kabKota ? `${u.kabKota}, ${u.provinsi}` : null,
          email: u.email,
          phone: u.phone,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt,
          leads: u._count.leads,
          registrations: u._count.registrations,
        }))}
      />
      <Pagination basePath="/admin/users" searchParams={sp} page={page} total={total} noun="pengguna" anchor="tabel" />
    </>
  );
}
