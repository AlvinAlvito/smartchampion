import Link from "next/link";
import { Bot, BookOpenText, CircleHelp, Database, FlaskConical, History, MessageSquareText, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { buildLiveContext } from "@/lib/chatbot";
import { groqConfigured } from "@/lib/groq";
import { ADMIN_CONTACTS } from "@/lib/chatbot-config";
import { cn, formatDate } from "@/lib/utils";
import { EmptyState, PageTitle, StatCard } from "@/components/ui";
import { ChatPanel } from "@/components/chatbot/chat-panel";
import { AddFromQuestionButton, KnowledgeManager, ResolveButton } from "./knowledge-admin";

export const metadata = { title: "Chatbot AI" };
export const dynamic = "force-dynamic";

const TABS = [
  { v: "pengetahuan", l: "Basis pengetahuan", icon: BookOpenText },
  { v: "belum-terjawab", l: "Belum terjawab", icon: CircleHelp },
  { v: "riwayat", l: "Riwayat chat", icon: History },
  { v: "uji", l: "Uji chatbot", icon: FlaskConical },
] as const;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

export default async function ChatbotAdminPage({ searchParams }: PageProps<"/admin/chatbot">) {
  await requirePanel();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.v === sp.tab)?.v ?? "pengetahuan";
  const weekAgo = daysAgo(7);

  const [knowledge, convos7, unansweredCount] = await Promise.all([
    prisma.chatKnowledge.findMany({ orderBy: [{ urutan: "asc" }, { id: "asc" }] }),
    prisma.chatConversation.count({ where: { updatedAt: { gte: weekAgo } } }),
    prisma.chatMessage.count({ where: { role: "assistant", answered: false } }),
  ]);
  const active = knowledge.filter((k) => k.isActive).length;

  return (
    <>
      <PageTitle
        icon={Bot}
        eyebrow="Layanan pelanggan"
        title="Chatbot AI"
        subtitle="Asisten AI di situs menjawab HANYA dari basis pengetahuan ini + data kelas, harga, jadwal, kuota & tutor yang otomatis diambil dari sistem."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Status AI" value={groqConfigured() ? "Aktif" : "Belum aktif"} hint={groqConfigured() ? (process.env.GROQ_MODEL ?? "openai/gpt-oss-120b") : "Isi GROQ_API_KEY di .env"} icon={Bot} tone={groqConfigured() ? "green" : "red"} />
        <StatCard label="Pengetahuan aktif" value={`${active}/${knowledge.length}`} icon={BookOpenText} tone="brand" />
        <StatCard label="Percakapan 7 hari" value={convos7.toLocaleString("id-ID")} icon={MessageSquareText} tone="blue" />
        <StatCard label="Belum terjawab" value={unansweredCount.toLocaleString("id-ID")} hint="perlu ditambah ke pengetahuan" icon={CircleHelp} tone={unansweredCount ? "yellow" : "green"} />
      </div>

      <div className="card mb-5 flex gap-1.5 overflow-x-auto p-1.5!">
        {TABS.map((t) => (
          <Link
            key={t.v}
            href={`/admin/chatbot?tab=${t.v}`}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition",
              tab === t.v ? "bg-linear-to-r from-brand-600 to-navy-700 text-white shadow-md" : "text-navy-500 hover:bg-brand-50 hover:text-brand-700",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.l}
            {t.v === "belum-terjawab" && unansweredCount > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-navy-950">{unansweredCount}</span>}
          </Link>
        ))}
      </div>

      {tab === "pengetahuan" && <KnowledgeTab rows={knowledge} />}
      {tab === "belum-terjawab" && <UnansweredTab />}
      {tab === "riwayat" && <HistoryTab />}
      {tab === "uji" && (
        <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
          <ChatPanel storageKey={null} page="admin-uji" className="h-[640px]" />
          <div className="card h-fit space-y-3 text-sm text-navy-600">
            <p className="font-bold text-navy-900">Tips menguji</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Tanyakan hal yang ADA di pengetahuan (mis. &quot;berapa harga kelas matematika SMP?&quot;) → harus dijawab sesuai data.</li>
              <li>Tanyakan hal yang TIDAK ADA (mis. &quot;ada diskon?&quot;) → chatbot harus jujur tidak tahu & menampilkan tombol admin.</li>
              <li>Tanya &quot;kamu manusia?&quot; → chatbot harus menyebut dirinya asisten AI.</li>
            </ul>
            <p>
              Kontak admin yang ditawarkan chatbot: {ADMIN_CONTACTS.map((c) => `${c.name} (${c.phone})`).join(" & ")}.
            </p>
            <p className="text-xs text-navy-400">Percakapan uji tercatat di Riwayat chat dengan halaman &quot;admin-uji&quot;.</p>
          </div>
        </div>
      )}
    </>
  );
}

async function KnowledgeTab({ rows }: { rows: Awaited<ReturnType<typeof prisma.chatKnowledge.findMany>> }) {
  const live = await buildLiveContext();
  return (
    <>
      <KnowledgeManager rows={rows} />
      <details className="card mt-6">
        <summary className="flex cursor-pointer items-center gap-2 font-bold text-navy-900">
          <Database className="h-5 w-5 text-brand-600" /> Data otomatis dari sistem (tidak perlu diketik ulang)
        </summary>
        <p className="mt-2 text-sm text-navy-500">
          Diambil langsung dari menu Produk &amp; Materi dan Tutor setiap kali ada chat, sehingga harga, jadwal, dan kuota selalu terbaru. Ubah datanya di menu tersebut.
        </p>
        <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-2xl bg-navy-50/70 p-4 font-mono text-xs leading-relaxed text-navy-700">{live}</pre>
      </details>
    </>
  );
}

async function UnansweredTab() {
  const misses = await prisma.chatMessage.findMany({
    where: { role: "assistant", answered: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { conversation: { select: { userName: true, page: true } } },
  });
  // pertanyaan pengguna tepat sebelum balasan tsb
  const questions = await Promise.all(
    misses.map((m) =>
      prisma.chatMessage.findFirst({ where: { conversationId: m.conversationId, role: "user", createdAt: { lte: m.createdAt } }, orderBy: { id: "desc" }, select: { content: true } }),
    ),
  );
  if (!misses.length) return <EmptyState icon={CircleHelp} title="Semua pertanyaan terjawab" desc="Pertanyaan yang tidak bisa dijawab chatbot akan muncul di sini untuk ditambahkan ke basis pengetahuan." />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-500">Pertanyaan yang tidak bisa dijawab chatbot karena datanya belum ada. Tambahkan jawabannya ke basis pengetahuan, lalu tandai selesai.</p>
      {misses.map((m, i) => (
        <div key={m.id} className="card p-4!">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-navy-400">
                {formatDate(m.createdAt, true)} · {m.conversation.userName ?? "Tamu"} · {m.conversation.page ?? "-"}
              </p>
              <p className="mt-1 font-bold text-navy-900">&ldquo;{questions[i]?.content ?? "(pertanyaan tidak ditemukan)"}&rdquo;</p>
              <p className="mt-1 line-clamp-2 text-sm text-navy-500">Bot: {m.content}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <AddFromQuestionButton question={questions[i]?.content ?? ""} />
              <ResolveButton messageId={m.id} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

async function HistoryTab() {
  const convos = await prisma.chatConversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 40,
    include: { messages: { orderBy: { id: "asc" }, take: 60 }, _count: { select: { messages: true } } },
  });
  if (!convos.length) return <EmptyState icon={History} title="Belum ada percakapan" desc="Percakapan pengunjung dengan chatbot akan tercatat di sini." />;
  return (
    <div className="space-y-3">
      {convos.map((c) => (
        <details key={c.id} className="card p-4!">
          <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5 font-bold text-navy-900">
              <UserRound className="h-4 w-4 text-brand-500" /> {c.userName ?? "Tamu"}
            </span>
            <span className="text-navy-400">{formatDate(c.updatedAt, true)}</span>
            <span className="text-navy-400">{c.page ?? "-"}</span>
            <span className="text-navy-500">{c._count.messages} pesan</span>
            {c.unanswered > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{c.unanswered} tak terjawab</span>}
            <span className="ml-auto truncate text-navy-500 sm:max-w-md">&ldquo;{c.messages.find((m) => m.role === "user")?.content ?? "-"}&rdquo;</span>
          </summary>
          <div className="mt-3 space-y-2 border-t border-navy-50 pt-3">
            {c.messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                    m.role === "user" ? "bg-brand-600 text-white" : m.answered === false ? "bg-amber-50 text-navy-800 ring-1 ring-amber-200" : "bg-navy-50 text-navy-800",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
