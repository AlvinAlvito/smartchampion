import Link from "next/link";
import { ArrowLeft, BookOpenText, BrainCircuit, ChevronRight, Lightbulb, MessageCircleQuestion, MessagesSquare, Quote, Reply, Smile, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";
import { canChat, canMonitor } from "@/lib/wa";
import { botStats, type BotStats, type Persona } from "@/lib/admin-bot";
import { formatWaPhone } from "@/lib/wa-shared";
import { cn, formatDate } from "@/lib/utils";
import { EmptyState, StatCard } from "@/components/ui";
import { BotCard } from "../chat/bot-card";
import { BotTestChat, ForgetButton, ResetBotButton } from "./bot-lab";

/** "3 hari lalu" (render server) */
function ago(d: Date | null) {
  if (!d) return "belum pernah";
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 3600) return s < 90 ? "baru saja" : `${Math.round(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
  const days = Math.round(s / 86400);
  return days === 1 ? "kemarin" : days < 7 ? `${days} hari lalu` : days < 30 ? `${Math.round(days / 7)} minggu lalu` : `${Math.round(days / 30)} bulan lalu`;
}

function Progress({ s }: { s: BotStats }) {
  const fresh = s.pending === 0 && s.hasPersona;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={cn("font-bold", fresh ? "text-emerald-600" : s.analyzed ? "text-amber-700" : "text-navy-400")}>{s.percent}% chat dianalisis</span>
        <span className="text-navy-400">terakhir {ago(s.lastAnalyzedAt)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-navy-100">
        <div className={cn("h-full rounded-full", fresh ? "bg-emerald-500" : "bg-linear-to-r from-violet-500 to-brand-500")} style={{ width: `${s.percent}%` }} />
      </div>
    </div>
  );
}

/** Tab "Chatbot Admin": satu klon AI per admin yang menautkan WhatsApp */
export async function AdminBotsTab({ session, botParam }: { session: SessionPayload; botParam?: string }) {
  const all = canMonitor(session.role);
  const accounts = await prisma.waAccount.findMany({
    where: all ? {} : { userId: session.userId },
    orderBy: { id: "asc" },
    select: { id: true, phone: true, autoReply: true, status: true, userId: true, user: { select: { name: true, role: true } } },
  });
  if (!accounts.length) {
    return (
      <EmptyState
        icon={BrainCircuit}
        title="Belum ada klon AI"
        desc={canChat(session.role) ? "Tautkan WhatsApp di menu Chat WA, lalu tekan “Analisis chat kamu” untuk membuat versi AI dirimu." : "Belum ada admin yang menautkan WhatsApp."}
      />
    );
  }
  // admin biasa hanya punya satu klon (miliknya) → langsung buka
  const picked = accounts.find((a) => a.id === Number(botParam)) ?? (accounts.length === 1 ? accounts[0] : undefined);
  if (picked) return <BotDetail account={picked} own={picked.userId === session.userId} canEdit={picked.userId === session.userId || session.role === "ROOT"} multi={accounts.length > 1} />;

  const stats = await Promise.all(accounts.map((a) => botStats(a.id)));
  return (
    <div className="space-y-4">
      <p className="text-sm text-navy-500">
        Setiap admin punya <b>klon AI</b> sendiri: AI mempelajari seluruh chat WhatsApp admin itu (pertanyaan customer, cara admin menjawab, info terbaru, gaya bahasa) lalu
        membalas seperti admin tersebut. Analisis dijalankan dari menu <b>Chat WA → Analisis chat kamu</b>.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a, i) => {
          const s = stats[i];
          return (
            <Link key={a.id} href={`/admin/chatbot?tab=admin&bot=${a.id}`} className="card card-hover group flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-violet-500 to-brand-600 text-lg font-extrabold text-white shadow-md">
                  {a.user.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-navy-900">Klon AI {a.user.name}</p>
                  <p className="truncate text-xs text-navy-400">{a.phone ? formatWaPhone(a.phone) : "nomor belum tertaut"}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-navy-200 transition group-hover:translate-x-1 group-hover:text-brand-600" />
              </div>
              <Progress s={s} />
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-navy-50/70 p-2">
                  <p className="text-base font-extrabold text-navy-900">{s.qa}</p>
                  <p className="text-navy-400">tanya-jawab</p>
                </div>
                <div className="rounded-xl bg-navy-50/70 p-2">
                  <p className="text-base font-extrabold text-navy-900">{s.facts}</p>
                  <p className="text-navy-400">info</p>
                </div>
                <div className="rounded-xl bg-navy-50/70 p-2">
                  <p className="text-base font-extrabold text-navy-900">{s.analyzed.toLocaleString("id-ID")}</p>
                  <p className="text-navy-400">pesan</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                <span className={cn("rounded-full px-2 py-0.5", s.hasPersona ? "bg-emerald-100 text-emerald-700" : "bg-navy-100 text-navy-500")}>{s.hasPersona ? "Gaya bahasa siap" : "Belum dianalisis"}</span>
                {s.hasPersona && (
                  <span className={cn("rounded-full px-2 py-0.5", a.autoReply && s.enabled ? "bg-brand-100 text-brand-700" : "bg-navy-100 text-navy-500")}>
                    {a.autoReply && s.enabled ? "Auto-balas aktif" : !s.enabled ? "Klon dimatikan" : "Auto-balas mati"}
                  </span>
                )}
                {s.pending > 0 && s.analyzed > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{s.pending} pesan baru</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type Account = { id: number; phone: string | null; autoReply: boolean; userId: number; user: { name: string } };

async function BotDetail({ account, own, canEdit, multi }: { account: Account; own: boolean; canEdit: boolean; multi: boolean }) {
  const [stats, bot] = await Promise.all([
    botStats(account.id),
    prisma.adminBot.findUnique({ where: { accountId: account.id }, include: { memories: { orderBy: [{ hits: "desc" }, { learnedAt: "desc" }] } } }),
  ]);
  const persona = (bot?.persona ?? null) as Persona | null;
  const qa = bot?.memories.filter((m) => m.kind === "QA") ?? [];
  const facts = (bot?.memories.filter((m) => m.kind === "FACT") ?? []).sort((a, b) => b.learnedAt.getTime() - a.learnedAt.getTime());
  const group = <T,>(rows: T[], key: (r: T) => string, weight: (r: T) => number) => {
    const m = new Map<string, { items: T[]; n: number }>();
    for (const r of rows) {
      const g = m.get(key(r)) ?? { items: [], n: 0 };
      g.items.push(r);
      g.n += weight(r);
      m.set(key(r), g);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  };
  const qCats = group(qa, (r) => r.category, (r) => r.hits);
  const aCats = group(qa, (r) => r.answerCategory ?? "Lainnya", (r) => r.hits);
  const fCats = group(facts, (r) => r.category, () => 1);
  const name = account.user.name;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {multi && (
          <Link href="/admin/chatbot?tab=admin" className="btn-ghost btn-sm">
            <ArrowLeft className="h-3.5 w-3.5" /> Semua klon
          </Link>
        )}
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-navy-900">
          <BrainCircuit className="h-5 w-5 text-violet-600" /> Klon AI {name}
        </h2>
        <span className="text-sm text-navy-400">{account.phone ? formatWaPhone(account.phone) : ""}</span>
        {canEdit && stats.analyzed > 0 && (
          <span className="ml-auto">
            <ResetBotButton accountId={account.id} />
          </span>
        )}
      </div>

      <BotCard accountId={account.id} readOnly={!own} autoReply={account.autoReply} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pesan dianalisis" value={`${stats.analyzed.toLocaleString("id-ID")}/${stats.total.toLocaleString("id-ID")}`} hint={`${stats.chats} chat · ${stats.adminMessages.toLocaleString("id-ID")} pesan admin`} icon={MessagesSquare} tone="brand" />
        <StatCard label="Kategori pertanyaan" value={String(qCats.length)} hint={`${qa.length} tanya-jawab dipelajari`} icon={MessageCircleQuestion} tone="blue" />
        <StatCard label="Jenis jawaban admin" value={String(aCats.length)} hint="pola respons" icon={Reply} tone="green" />
        <StatCard label="Info dipelajari" value={String(facts.length)} hint={`terakhir dianalisis ${ago(stats.lastAnalyzedAt)}`} icon={Lightbulb} tone="yellow" />
      </div>

      {!stats.analyzed ? (
        <EmptyState
          icon={BrainCircuit}
          title="Klon AI ini belum belajar"
          desc={own ? "Tekan “Analisis chat kamu” di atas. AI akan membaca seluruh chat WhatsApp-mu dari awal sampai yang terbaru." : `${name} belum menjalankan Analisis chat di menu Chat WA.`}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className="min-w-0 space-y-5">
            {/* gaya bahasa */}
            <section className="card">
              <h3 className="mb-3 flex items-center gap-2 font-bold text-navy-900">
                <Smile className="h-5 w-5 text-violet-600" /> Gaya bahasa {name}
              </h3>
              {persona ? (
                <div className="space-y-4 text-sm">
                  <p className="rounded-2xl bg-violet-50 p-3 text-navy-700">{persona.ringkasan}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { l: "Sapaan ke customer", v: persona.sapaan },
                      { l: "Sebutan diri", v: persona.sebutanDiri },
                      { l: "Emoji", v: persona.emoji },
                    ].map((x) => (
                      <div key={x.l} className="rounded-2xl bg-navy-50/70 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-navy-400">{x.l}</p>
                        <p className="mt-0.5 font-semibold text-navy-800">{x.v || "-"}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(persona.nada ?? []).map((n) => (
                      <span key={n} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                        {n}
                      </span>
                    ))}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      { l: "Pola pembuka", v: persona.pembuka },
                      { l: "Pola penutup", v: persona.penutup },
                    ].map((x) => (
                      <div key={x.l}>
                        <p className="mb-1 text-xs font-bold text-navy-500">{x.l}</p>
                        <ul className="space-y-1">
                          {(x.v ?? []).map((t, i) => (
                            <li key={i} className="rounded-xl bg-navy-50/70 px-3 py-1.5 text-navy-700">
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-bold text-navy-500">Kebiasaan menulis</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-navy-600">
                      {(persona.kebiasaan ?? []).map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-navy-500">
                      <Quote className="h-3.5 w-3.5" /> Contoh kalimat asli
                    </p>
                    <ul className="space-y-1.5">
                      {(persona.contoh ?? []).map((t, i) => (
                        <li key={i} className="whitespace-pre-line rounded-2xl rounded-tr-sm bg-linear-to-br from-brand-600 to-navy-700 px-3 py-2 text-white">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-navy-400">Profil gaya dibuat otomatis setelah analisis mencapai 100%.</p>
              )}
            </section>

            {/* kategori pertanyaan customer */}
            <section className="card">
              <h3 className="mb-1 flex items-center gap-2 font-bold text-navy-900">
                <MessageCircleQuestion className="h-5 w-5 text-brand-600" /> Kategori pertanyaan customer
              </h3>
              <p className="mb-3 text-xs text-navy-400">Klik kategori untuk melihat pertanyaan & cara {name} menjawabnya. Angka = seberapa sering muncul.</p>
              <div className="space-y-2">
                {qCats.map(([cat, g]) => (
                  <details key={cat} className="group rounded-2xl ring-1 ring-navy-100 open:bg-navy-50/40">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-bold text-navy-800">
                      <ChevronRight className="h-4 w-4 shrink-0 text-navy-300 transition group-open:rotate-90" />
                      <span className="min-w-0 flex-1 truncate">{cat}</span>
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] text-brand-700">{g.n}x</span>
                      <span className="text-[11px] font-medium text-navy-400">{g.items.length} variasi</span>
                    </summary>
                    <ul className="space-y-2 px-3 pb-3">
                      {g.items.map((m) => (
                        <li key={m.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-navy-100">
                          <div className="flex items-start gap-2">
                            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-navy-300" />
                            <p className="min-w-0 flex-1 font-semibold text-navy-800">{m.question}</p>
                            {canEdit && <ForgetButton accountId={account.id} memoryId={m.id} />}
                          </div>
                          <p className="mt-2 whitespace-pre-line rounded-xl rounded-tr-sm bg-brand-50 px-3 py-2 text-navy-700">{m.answer}</p>
                          <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-navy-400">
                            {m.answerCategory && <span className="font-bold text-emerald-700">{m.answerCategory}</span>}
                            <span>muncul {m.hits}x</span>
                            <span>chat {formatDate(m.learnedAt)}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
                {!qCats.length && <p className="text-sm text-navy-400">Belum ada tanya-jawab yang dipelajari.</p>}
              </div>
            </section>

            {/* jenis jawaban */}
            <section className="card">
              <h3 className="mb-3 flex items-center gap-2 font-bold text-navy-900">
                <Reply className="h-5 w-5 text-emerald-600" /> Jenis jawaban {name}
              </h3>
              <div className="flex flex-wrap gap-2">
                {aCats.map(([cat, g]) => (
                  <span key={cat} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">
                    {cat} <span className="rounded-full bg-white px-1.5 text-emerald-600">{g.n}</span>
                  </span>
                ))}
                {!aCats.length && <p className="text-sm text-navy-400">Belum ada.</p>}
              </div>
            </section>

            {/* informasi */}
            <section className="card">
              <h3 className="mb-1 flex items-center gap-2 font-bold text-navy-900">
                <BookOpenText className="h-5 w-5 text-amber-500" /> Informasi yang dipelajari dari chat
              </h3>
              <p className="mb-3 text-xs text-navy-400">
                Dipakai klon AI sebagai pengetahuan tambahan. Harga/jadwal dari sistem tetap diutamakan. Hapus info yang keliru atau sudah tidak berlaku.
              </p>
              <div className="space-y-2">
                {fCats.map(([cat, g]) => (
                  <details key={cat} className="group rounded-2xl ring-1 ring-navy-100 open:bg-navy-50/40">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-bold text-navy-800">
                      <ChevronRight className="h-4 w-4 shrink-0 text-navy-300 transition group-open:rotate-90" />
                      <span className="min-w-0 flex-1 truncate">{cat}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{g.items.length}</span>
                    </summary>
                    <ul className="space-y-1.5 px-3 pb-3">
                      {g.items.map((m) => (
                        <li key={m.id} className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-navy-100">
                          <p className="min-w-0 flex-1 text-navy-700">
                            {m.answer} <span className="text-[11px] text-navy-400">· {formatDate(m.learnedAt)}</span>
                          </p>
                          {canEdit && <ForgetButton accountId={account.id} memoryId={m.id} />}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
                {!fCats.length && <p className="text-sm text-navy-400">Belum ada info yang dipelajari.</p>}
              </div>
            </section>
          </div>

          <div className="xl:sticky xl:top-4 xl:self-start">
            {persona ? (
              <BotTestChat accountId={account.id} adminName={name} />
            ) : (
              <div className="card text-sm text-navy-500">Uji coba percakapan tersedia setelah analisis mencapai 100% (profil gaya terbentuk).</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
