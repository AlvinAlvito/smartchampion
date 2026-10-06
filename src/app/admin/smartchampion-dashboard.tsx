import Link from "next/link";
import { Bot, BookOpen, Brain, CircleCheck, ClipboardList, Gamepad2, GraduationCap, Hourglass, Presentation, UserPlus, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getRegistrationStats } from "@/lib/stats";
import { JENJANG_LABEL } from "@/lib/constants";
import { QuotaBar, SectionTitle, StatCard } from "@/components/ui";
import { ChartCard, DonutChart, SimpleBarChart, TrendChart } from "@/components/charts";

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/**
 * Dashboard Admin SmartChampion: hanya jumlah peserta / peserta terdaftar & pelanggan Mimpi.mu,
 * kuota kelas, serta aktivitas games & chatbot. Tanpa data keuangan dan tanpa performa admin.
 */
export async function SmartChampionDashboard({ name, today, greeting }: { name: string; today: string; greeting: string }) {
  const since30 = daysAgo(30);
  const since180 = daysAgo(180);
  const [reg, pesertaTotal, pesertaBaru, mimpiTotal, mimpiBaru, mimpiRecent, jenjangPeserta, gamesLive, plays30, tutorsLive, chats7, unanswered] = await Promise.all([
    getRegistrationStats(),
    prisma.user.count({ where: { role: "PESERTA" } }),
    prisma.user.count({ where: { role: "PESERTA", createdAt: { gte: since30 } } }),
    prisma.lead.count({ where: { statusFunnel: "Paid", produk: { contains: "Mimpi" } } }),
    prisma.lead.count({ where: { statusFunnel: "Paid", produk: { contains: "Mimpi" }, tanggalBayar: { gte: since30 } } }),
    prisma.lead.findMany({ where: { statusFunnel: "Paid", produk: { contains: "Mimpi" }, tanggalBayar: { gte: since180 } }, select: { tanggalBayar: true } }),
    prisma.user.groupBy({ by: ["jenjang"], where: { role: "PESERTA" }, _count: { _all: true } }),
    prisma.game.count({ where: { isPublished: true } }),
    prisma.gameScore.count({ where: { createdAt: { gte: since30 } } }),
    prisma.tutor.count({ where: { isPublished: true } }),
    prisma.chatConversation.count({ where: { updatedAt: { gte: daysAgo(7) } } }),
    prisma.chatMessage.count({ where: { role: "assistant", answered: false } }),
  ]);

  // Pelanggan Mimpi.mu baru per bulan (6 bulan terakhir) — jumlah saja
  const wib = (d: Date) => new Date(d.getTime() + 7 * 3600_000);
  const now = wib(new Date());
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1));
    return { key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, name: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, value: 0 };
  });
  for (const l of mimpiRecent) {
    if (!l.tanggalBayar) continue;
    const d = wib(l.tanggalBayar);
    const m = months.find((x) => x.key === `${d.getUTCFullYear()}-${d.getUTCMonth()}`);
    if (m) m.value++;
  }
  const byJenjang = jenjangPeserta
    .map((j) => ({ name: j.jenjang ? JENJANG_LABEL[j.jenjang] : "Belum diisi", value: j._count._all }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <section className="relative mb-7 animate-fade-up overflow-hidden rounded-[32px] bg-hero p-6 text-white shadow-xl shadow-navy-900/20 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="pointer-events-none absolute -right-10 -top-20 h-72 w-72 animate-blob rounded-full bg-brand-500/40 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm text-brand-200">{today}</p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
              {greeting}, {name.split(" ")[0]} 👋
            </h1>
            <p className="mt-1.5 text-sm text-navy-200">Ringkasan peserta, peserta terdaftar kelas, dan pelanggan Mimpi.mu.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/pendaftar" className="btn-light">
              <ClipboardList className="h-4 w-4" /> Peserta Terdaftar
            </Link>
            <Link href="/admin/produk" className="btn-outline-light">
              <BookOpen className="h-4 w-4" /> Produk &amp; Materi
            </Link>
          </div>
        </div>
      </section>

      <SectionTitle title="Peserta" icon={Users} />
      <div className="stagger mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total akun peserta" value={pesertaTotal.toLocaleString("id-ID")} icon={Users} tone="navy" />
        <StatCard label="Peserta baru" value={pesertaBaru.toLocaleString("id-ID")} hint="30 hari terakhir" icon={UserPlus} tone="brand" />
        <StatCard label="Pelanggan Mimpi.mu" value={mimpiTotal.toLocaleString("id-ID")} hint={`${mimpiBaru} baru dalam 30 hari`} icon={Brain} tone="blue" />
        <StatCard label="Kelas kuota terpenuhi" value={`${reg.classesReady}/${reg.quota.length}`} hint="Minimal 15 peserta lunas" icon={GraduationCap} tone="green" />
      </div>

      <SectionTitle title="Peserta Terdaftar (semua produk kelas)" icon={ClipboardList} />
      <div className="stagger mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total pendaftar" value={reg.total.toLocaleString("id-ID")} icon={ClipboardList} tone="navy" />
        <StatCard label="Lunas (peserta aktif)" value={reg.paid.toLocaleString("id-ID")} icon={CircleCheck} tone="green" />
        <StatCard label="Menunggu bayar" value={reg.pending.toLocaleString("id-ID")} icon={Hourglass} tone="yellow" />
        <StatCard label="Konversi daftar → lunas" value={`${reg.conversion}%`} icon={GraduationCap} tone="brand" />
      </div>
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <ChartCard title="Pendaftar harian" subtitle="30 hari terakhir">
          <TrendChart data={reg.daily} series={[{ key: "daftar", label: "Daftar" }, { key: "lunas", label: "Lunas" }]} />
        </ChartCard>
        <ChartCard title="Peserta lunas per jenjang">
          <DonutChart data={reg.byJenjang.map((j) => ({ name: JENJANG_LABEL[j.name] ?? j.name, value: j.value }))} />
        </ChartCard>
      </div>

      <div className="mb-8 grid gap-6 xl:grid-cols-2">
        <ChartCard title="Pelanggan Mimpi.mu baru" subtitle="Per bulan, 6 bulan terakhir (jumlah)">
          <SimpleBarChart data={months.map(({ name, value }) => ({ name, value }))} />
        </ChartCard>
        <ChartCard title="Akun peserta per jenjang">
          <DonutChart data={byJenjang} />
        </ChartCard>
      </div>

      <SectionTitle title="Kuota kelas COC" icon={GraduationCap} />
      <div className="stagger mb-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {reg.quota.map((q) => (
          <Link key={q.id} href={`/admin/pendaftar?product=${q.id}`} className="card card-hover block p-4!">
            <p className="truncate font-semibold text-navy-900">{q.name}</p>
            <p className="mb-2 text-xs text-navy-400">
              {JENJANG_LABEL[q.jenjang]} · {q.paid} lunas · {q.pending} menunggu bayar
            </p>
            <QuotaBar filled={q.paid} min={q.minQuota} />
          </Link>
        ))}
      </div>

      <SectionTitle title="Konten & layanan" icon={Gamepad2} />
      <div className="stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Games dirilis" value={gamesLive.toLocaleString("id-ID")} hint={`${plays30.toLocaleString("id-ID")} kali dimainkan (30 hari)`} icon={Gamepad2} tone="brand" />
        <StatCard label="Tutor tampil" value={tutorsLive.toLocaleString("id-ID")} icon={Presentation} tone="navy" />
        <StatCard label="Percakapan chatbot" value={chats7.toLocaleString("id-ID")} hint="7 hari terakhir" icon={Bot} tone="blue" />
        <StatCard label="Chatbot belum terjawab" value={unanswered.toLocaleString("id-ID")} hint="Tambahkan ke basis pengetahuan" icon={Bot} tone={unanswered ? "yellow" : "green"} />
      </div>
    </>
  );
}
