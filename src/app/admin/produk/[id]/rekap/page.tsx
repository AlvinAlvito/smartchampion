import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, FileSpreadsheet, GraduationCap, Users } from "lucide-react";
import { requirePanel } from "@/lib/session";
import { getClassRecap } from "@/lib/class-recap";
import { ATTENDANCE_LABEL, GRADE_SCALE, gradeTone } from "@/lib/worksheet-shared";
import { cn } from "@/lib/utils";
import { Badge, PageTitle, StatCard } from "@/components/ui";
import { ScoreCell } from "./score-cell";

export const metadata = { title: "Rekap Nilai & Absensi" };
export const dynamic = "force-dynamic";

const ATT_DOT: Record<string, string> = { HADIR: "bg-emerald-500", IZIN: "bg-sky-500", SAKIT: "bg-amber-500", ALPA: "bg-rose-500" };

export default async function RecapPage({ params }: PageProps<"/admin/produk/[id]/rekap">) {
  const session = await requirePanel();
  // Superadmin = lihat saja
  const canEdit = session.role !== "SUPERADMIN";
  const { id } = await params;
  const recap = await getClassRecap(Number(id) || 0);
  if (!recap) notFound();
  const { product, meetings, rows, classAvg, startedCount } = recap;
  const avgAttendance = rows.length && startedCount ? Math.round(rows.reduce((s, r) => s + (r.attendanceRate ?? 0), 0) / rows.length) : null;

  return (
    <>
      <Link href={`/admin/produk/${product.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:gap-2.5">
        <ArrowLeft className="h-4 w-4" /> {product.name}
      </Link>
      <div className="mt-4">
        <PageTitle
          icon={BarChart3}
          eyebrow="Rekap kelas"
          title="Nilai & Absensi"
          subtitle={`${product.name} · ${meetings.length} pertemuan · ${rows.length} peserta`}
          action={
            <a href={`/api/admin/rekap/${product.id}`} className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Ekspor Excel
            </a>
          }
        />
      </div>

      <div className="stagger mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Peserta" value={rows.length} icon={Users} tone="navy" />
        <StatCard
          label="Rata-rata nilai kelas"
          value={classAvg ?? "-"}
          hint={classAvg != null ? `Grade ${GRADE_SCALE.find((g) => classAvg >= g.min)?.grade}` : "belum ada nilai"}
          icon={GraduationCap}
          tone="brand"
        />
        <StatCard
          label="Rata-rata kehadiran"
          value={avgAttendance != null ? `${avgAttendance}%` : "-"}
          hint={`dari ${startedCount} pertemuan yang sudah dimulai`}
          icon={Users}
          tone="green"
        />
      </div>

      <div className="card overflow-x-auto p-0!">
        <table className="table min-w-[720px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-navy-50">Peserta</th>
              {meetings.map((m) => (
                <th key={m.id} className="text-center" title={m.title}>
                  <Link href={`/admin/produk/${product.id}/pertemuan/${m.id}?tab=nilai`} className="hover:text-brand-700">
                    P{m.number}
                  </Link>
                </th>
              ))}
              <th className="text-center" title="Nilai Try Out Mimpi.mu setelah pelatihan">
                Try Out
              </th>
              <th className="text-right">Rata-rata</th>
              <th>Grade</th>
              <th className="text-right">Hadir</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <td className="sticky left-0 z-10 bg-white">
                  <p className="font-semibold text-navy-900">{r.name}</p>
                  <p className="text-xs text-navy-400">{r.school}</p>
                </td>
                {r.cells.map((c, i) => (
                  <td key={meetings[i].id} className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <ScoreCell
                        target={{
                          kind: "meeting",
                          productId: product.id,
                          sessionId: meetings[i].id,
                          userId: r.userId,
                          meetingLabel: `P${meetings[i].number} · ${meetings[i].title}`,
                          worksheetScore: c.worksheetScore,
                        }}
                        studentName={r.name}
                        score={c.score}
                        manual={!!c.manual}
                        note={c.manual?.note}
                        missed={c.missed}
                        canEdit={canEdit}
                        emptyText={meetings[i].graded ? "–" : "+"}
                      />
                      <span
                        className={cn("h-2 w-2 rounded-full", c.attendance ? ATT_DOT[c.attendance] : meetings[i].started ? "bg-navy-200" : "bg-transparent")}
                        title={c.attendance ? ATTENDANCE_LABEL[c.attendance] : meetings[i].started ? "Belum diabsen" : ""}
                      />
                    </div>
                  </td>
                ))}
                <td className="text-center">
                  <ScoreCell
                    target={{ kind: "tryout", productId: product.id, userId: r.userId }}
                    studentName={r.name}
                    score={r.tryout}
                    note={r.tryoutNote}
                    canEdit={canEdit}
                    emptyText="+"
                  />
                </td>
                <td className="text-right text-lg font-extrabold text-navy-900">{r.average ?? "-"}</td>
                <td>{r.grade ? <Badge tone={gradeTone(r.grade)}>{r.grade}</Badge> : "-"}</td>
                <td className="text-right text-sm text-navy-600">
                  {r.present}/{startedCount}
                  {r.attendanceRate != null && <span className="block text-xs text-navy-400">{r.attendanceRate}%</span>}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={meetings.length + 5} className="py-10 text-center text-navy-400">
                  Belum ada peserta lunas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-500">
        <span>
          Angka = nilai pertemuan (0–100) dari worksheet; <b className="text-violet-700">ungu ✎</b> = nilai manual (klik angka / + untuk mengisi atau mengubah);
          merah = tidak mengumpulkan sampai batas waktu (dihitung 0). Rata-rata = semua nilai pertemuan + Try Out Mimpi.mu.
        </span>
        {Object.entries(ATT_DOT).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", c)} /> {ATTENDANCE_LABEL[k]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-navy-200" /> Belum diabsen
        </span>
        <span className="flex flex-wrap gap-1">
          {GRADE_SCALE.map((g) => (
            <Badge key={g.grade} tone={g.tone}>
              {g.grade} ≥ {g.min}
            </Badge>
          ))}
        </span>
      </div>
    </>
  );
}
