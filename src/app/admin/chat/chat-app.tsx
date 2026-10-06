"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Eye,
  Hand,
  LoaderCircle,
  Maximize2,
  MessageCircle,
  Minimize2,
  MessagesSquare,
  Search,
  ServerCrash,
  Smartphone,
  TriangleAlert,
  Unplug,
  X,
  Users,
} from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/modal";
import { cn } from "@/lib/utils";
import { WA_STATUS_LABEL, WA_STATUS_TONE, formatWaPhone } from "@/lib/wa-shared";
import { ConnectPanel } from "./connect-panel";
import { Conversation } from "./conversation";
import { CustomerPanel } from "./customer-panel";
import { getJson, postJson, usePoll } from "./use-poll";

type Account = {
  userId: number;
  name: string;
  role: string;
  accountId: number | null;
  status: string;
  phone: string | null;
  chats: number;
  unread: number;
};
type Conn = {
  configured: boolean;
  gatewayUp?: boolean;
  account: {
    id: number;
    status: string;
    phone: string | null;
    waName: string | null;
    lastError: string | null;
    restricted: boolean;
    connectedAt: string | null;
    autoReply?: boolean;
  } | null;
  aiConfigured?: boolean;
  qr?: string | null;
  pairingCode?: string | null;
  usage?: { minute: number; hour: number; day: number } | null;
  limits?: { perMinute: number; perHour: number; perDay: number } | null;
  queue?: number;
};
type ChatItem = {
  id: number;
  name: string | null;
  phone: string | null;
  isGroup?: boolean;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastFromMe: boolean;
  unread: number;
  aiPaused?: boolean;
};

function when(d: string) {
  const date = new Date(d);
  const k = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(x);
  if (k(date) === k(new Date()))
    return new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }).format(date);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

export function ChatApp({
  mode,
  configured,
  accounts,
  initialAccountId,
}: {
  mode: "own" | "monitor";
  configured: boolean;
  accounts: Account[];
  initialAccountId: number | null;
  role: string;
}) {
  const router = useRouter();
  const readOnly = mode === "monitor";
  const [accountId, setAccountId] = useState<number | null>(initialAccountId);
  const [conn, setConn] = useState<Conn | null>(null);
  const [chats, setChats] = useState<ChatItem[] | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  /** "" semua · "private" chat pribadi · "group" grup */
  const [kind, setKind] = useState<"" | "private" | "group">("");
  const [chatId, setChatId] = useState<number | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [confirmAi, setConfirmAi] = useState(false);
  const [full, setFull] = useState(false);

  // layar penuh: kunci scroll halaman di belakang & keluar dengan tombol Esc
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);
  const acctQs = readOnly && accountId ? `account=${accountId}` : "";
  const status = conn?.account?.status ?? "DISCONNECTED";
  const connected = status === "CONNECTED";
  const hasAccount = readOnly ? !!accountId : !!conn?.account;
  const autoReply = !!conn?.account?.autoReply;

  const setAutoReply = async (enabled: boolean) => {
    const r = await postJson<{ autoReply?: boolean }>("/api/admin/wa/ai", { enabled });
    if (r.error) return { error: r.error };
    setConn((c) => (c?.account ? { ...c, account: { ...c.account, autoReply: enabled } } : c));
    return { ok: enabled ? "Auto-balas AI aktif — chat masuk baru akan dijawab otomatis." : "Auto-balas AI dimatikan." };
  };

  const loadConn = async () => {
    if (readOnly && !accountId) return;
    const c = await getJson<Conn>(`/api/admin/wa/state?${acctQs}`);
    setConn(c);
    if (!readOnly && c.account && c.account.id !== accountId) setAccountId(c.account.id);
  };
  const loadChats = async () => {
    if (!hasAccount) return;
    const params = new URLSearchParams(acctQs);
    if (q.trim()) params.set("q", q.trim());
    if (unreadOnly) params.set("unread", "1");
    if (kind) params.set("kind", kind);
    const r = await getJson<{ chats: ChatItem[]; unreadTotal: number }>(`/api/admin/wa/chats?${params}`);
    setChats(r.chats);
    setUnreadTotal(r.unreadTotal);
  };

  // koneksi: cepat saat menunggu QR, santai saat sudah terhubung
  usePoll(loadConn, connected ? 20_000 : 3000, [accountId, connected]);
  usePoll(loadChats, hasAccount ? 4000 : null, [accountId, hasAccount, q, unreadOnly, kind]);

  const pickAccount = (id: number | null) => {
    setAccountId(id);
    setConn(null);
    setChats(null);
    setChatId(null);
    router.replace(id ? `/admin/chat?akun=${id}` : "/admin/chat", {
      scroll: false,
    });
  };

  const disconnect = async () => {
    const r = await postJson("/api/admin/wa/disconnect", {});
    if (r.error) return { error: r.error };
    await loadConn();
    return { ok: "WhatsApp diputuskan. Riwayat chat tetap tersimpan." };
  };

  if (!configured) {
    return (
      <EmptyState
        icon={ServerCrash}
        title="Layanan WhatsApp belum aktif di server"
        desc="Superadmin/teknisi perlu menjalankan wa-gateway dan mengisi WA_GATEWAY_URL & WA_GATEWAY_SECRET di .env (lihat README)."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Pilih admin (superadmin) */}
      {readOnly && (
        <div className="card flex flex-wrap items-center gap-2 p-3!">
          <Eye className="ml-1 h-4 w-4 text-navy-400" />
          {accounts.length === 0 && <span className="text-sm text-navy-400">Belum ada admin.</span>}
          {accounts.map((a) => (
            <button
              key={a.userId}
              disabled={!a.accountId}
              onClick={() => pickAccount(a.accountId)}
              title={a.accountId ? undefined : "Admin ini belum pernah menautkan WhatsApp"}
              className={cn(
                "flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
                a.accountId && a.accountId === accountId
                  ? "bg-linear-to-r from-brand-600 to-navy-700 text-white shadow-md"
                  : "bg-navy-50 text-navy-700 hover:bg-brand-50",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", a.status === "CONNECTED" ? "bg-emerald-400" : "bg-navy-300")} />
              <span>
                <span className="block font-semibold leading-tight">{a.name}</span>
                <span className={cn("block text-[11px]", a.accountId === accountId ? "text-white/75" : "text-navy-400")}>
                  {a.role} · {a.accountId ? `${a.chats} chat` : "belum tertaut"}
                </span>
              </span>
              {a.unread > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{a.unread}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Status koneksi */}
      {(!readOnly || accountId) && (
        <div className="card p-4!">
          {!conn ? (
            <p className="flex items-center gap-2 text-sm text-navy-400">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Memeriksa koneksi WhatsApp…
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cn("grid h-10 w-10 place-items-center rounded-2xl", connected ? "bg-emerald-50 text-emerald-600" : "bg-navy-50 text-navy-400")}
                >
                  <Smartphone className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-navy-900">
                    WhatsApp {conn.account?.phone ? formatWaPhone(conn.account.phone) : ""}
                    <Badge tone={WA_STATUS_TONE[status] ?? "gray"}>{WA_STATUS_LABEL[status] ?? status}</Badge>
                    {unreadTotal > 0 && <Badge tone="green">{unreadTotal} belum dibaca</Badge>}
                  </p>
                  <p className="text-xs text-navy-400">
                    {conn.gatewayUp === false
                      ? "Layanan WhatsApp (wa-gateway) belum berjalan, jadi QR belum bisa ditampilkan. Jalankan `npm run dev:wa` (lokal) atau `pm2 start pelatihan-wa` (server). Chat lama tetap bisa dibaca."
                      : connected && conn.usage && conn.limits
                        ? `Terkirim hari ini ${conn.usage.day}/${conn.limits.perDay} · jam ini ${conn.usage.hour}/${conn.limits.perHour}${conn.queue ? ` · antre ${conn.queue}` : ""}`
                        : conn.account?.waName
                          ? conn.account.waName
                          : "Belum ada nomor yang ditautkan."}
                  </p>
                </div>
                {!readOnly && connected && (
                  <button className="btn-ghost btn-sm ml-auto text-rose-600 hover:bg-rose-50" onClick={() => setConfirmOff(true)}>
                    <Unplug className="h-3.5 w-3.5" /> Putuskan
                  </button>
                )}
              </div>
              {conn.account?.restricted && (
                <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> WhatsApp sedang membatasi pengiriman dari nomor ini. Kiriman ditahan otomatis; balas
                  dari HP seperlunya dan tunggu pembatasan berakhir.
                </p>
              )}
              {!readOnly && !connected && conn.gatewayUp !== false && (
                <div className="mt-4 border-t border-navy-50 pt-4">
                  <ConnectPanel
                    status={status}
                    qr={conn.qr ?? null}
                    pairingCode={conn.pairingCode ?? null}
                    lastError={conn.account?.lastError ?? null}
                    onChanged={loadConn}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Chat */}
      {hasAccount && (
        <div
          className={cn(
            "flex flex-col overflow-hidden",
            full ? "fixed inset-0 z-[90] bg-[#f2f7fb] p-0 sm:p-3" : "card h-[calc(100dvh-12rem)] min-h-[520px] p-0!",
          )}
        >
          {/* bilah atas: status singkat + tombol layar penuh */}
          <div className={cn("flex items-center gap-2 border-b border-navy-100 bg-white px-3 py-2", full && "sm:rounded-t-3xl")}>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", connected ? "bg-emerald-500" : "bg-navy-300")} />
            <p className="min-w-0 truncate text-sm font-bold text-navy-800">
              {readOnly ? `Pantau · ${accounts.find((a) => a.accountId === accountId)?.name ?? ""}` : "Chat WA"}
              {conn?.account?.phone && <span className="ml-2 font-medium text-navy-400">{formatWaPhone(conn.account.phone)}</span>}
            </p>
            {unreadTotal > 0 && <Badge tone="green">{unreadTotal} belum dibaca</Badge>}
            {hasAccount &&
              (readOnly ? (
                autoReply && (
                  <Badge tone="brand">
                    <Bot className="mr-1 inline h-3 w-3" />
                    AI aktif
                  </Badge>
                )
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoReply}
                  onClick={() => (autoReply ? void setAutoReply(false) : setConfirmAi(true))}
                  title={autoReply ? "Matikan auto-balas AI" : "Aktifkan auto-balas AI untuk chat masuk"}
                  className={cn(
                    "ml-auto inline-flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-bold ring-1 transition",
                    autoReply ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-navy-600 ring-navy-200 hover:ring-brand-300",
                  )}
                >
                  <span className={cn("relative h-5 w-9 rounded-full transition", autoReply ? "bg-white/30" : "bg-navy-200")}>
                    <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", autoReply ? "left-[18px]" : "left-0.5")} />
                  </span>
                  <Bot className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Auto-balas AI</span>
                  <span className="sm:hidden">AI</span>
                </button>
              ))}
            <button
              className={cn("btn-ghost btn-sm", (!hasAccount || (readOnly && !autoReply)) && "ml-auto")}
              onClick={() => setFull((f) => !f)}
              title={full ? "Keluar layar penuh (Esc)" : "Layar penuh"}
              aria-label={full ? "Keluar layar penuh" : "Layar penuh"}
            >
              {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              <span className="hidden sm:inline">{full ? "Keluar layar penuh" : "Layar penuh"}</span>
            </button>
          </div>
          <div
            className={cn(
              "relative grid min-h-0 flex-1 overflow-hidden bg-white lg:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_330px]",
              full && "sm:rounded-b-3xl",
            )}
          >
            <aside className={cn("flex min-h-0 flex-col border-r border-navy-100", chatId ? "hidden lg:flex" : "")}>
              <div className="space-y-2 border-b border-navy-100 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Cari nama / nomor / pesan"
                    className="input py-2! pl-9"
                    aria-label="Cari chat"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {[
                    { k: "all", l: "Semua", on: !unreadOnly && !kind, set: () => (setUnreadOnly(false), setKind("")) },
                    { k: "unread", l: `Belum dibaca${unreadTotal ? ` (${unreadTotal})` : ""}`, on: unreadOnly, set: () => setUnreadOnly(!unreadOnly) },
                    { k: "private", l: "Pribadi", on: kind === "private", set: () => setKind(kind === "private" ? "" : "private") },
                    { k: "group", l: "Grup", on: kind === "group", set: () => setKind(kind === "group" ? "" : "group") },
                  ].map((o) => (
                    <button
                      key={o.k}
                      onClick={o.set}
                      className={cn("rounded-full px-3 py-1 font-semibold", o.on ? "bg-brand-600 text-white" : "bg-navy-50 text-navy-600 hover:bg-brand-50")}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {chats === null && (
                  <li className="space-y-2 p-3">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="skeleton h-12 w-full" />
                    ))}
                  </li>
                )}
                {chats?.length === 0 && (
                  <li className="p-6 text-center text-sm text-navy-400">
                    <MessageCircle className="mx-auto mb-2 h-8 w-8 text-navy-200" />
                    {q || unreadOnly || kind ? (kind === "group" && !q && !unreadOnly ? "Belum ada pesan grup. Grup muncul setelah ada pesan baru di grup tersebut." : "Tidak ada chat yang cocok.") : connected ? "Belum ada chat. Pesan masuk akan muncul di sini." : "Belum ada chat."}
                  </li>
                )}
                {chats?.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        setChatId(c.id);
                        setCustomerOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-navy-50 px-3 py-2.5 text-left transition",
                        chatId === c.id ? "bg-brand-50" : "hover:bg-navy-50/60",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-linear-to-br text-sm font-bold text-white",
                          c.isGroup ? "from-sky-400 to-navy-600" : "from-emerald-400 to-teal-600",
                        )}
                      >
                        {c.isGroup ? <Users className="h-5 w-5" /> : (c.name || "?").trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-sm font-bold text-navy-900">{c.name || formatWaPhone(c.phone) || (c.isGroup ? "Grup WhatsApp" : "Tanpa nama")}</span>
                            {c.isGroup && <span className="shrink-0 rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-700">Grup</span>}
                          </span>
                          <span className={cn("shrink-0 text-[11px]", c.unread ? "font-bold text-emerald-600" : "text-navy-400")}>{when(c.lastMessageAt)}</span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-navy-500">
                            {c.lastFromMe && <span className="text-navy-400">Anda: </span>}
                            {c.lastMessageText}
                          </span>
                          {autoReply && c.aiPaused && (
                            <span
                              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
                              title="AI dijeda — perlu dibalas admin"
                            >
                              <Hand className="h-2.5 w-2.5" /> Admin
                            </span>
                          )}
                          {c.unread > 0 && (
                            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                              {c.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <section className={cn("min-h-0 min-w-0", !chatId && "hidden lg:block xl:col-span-2")}>
              {chatId ? (
                <Conversation
                  key={chatId}
                  chatId={chatId}
                  readOnly={readOnly}
                  connected={connected}
                  onBack={() => setChatId(null)}
                  onShowCustomer={() => setCustomerOpen(true)}
                  onActivity={() => void loadChats()}
                />
              ) : (
                <div className="grid h-full place-items-center bg-navy-50/40 p-6 text-center">
                  <div>
                    <MessagesSquare className="mx-auto h-12 w-12 text-navy-200" />
                    <p className="mt-2 font-semibold text-navy-600">Pilih chat untuk mulai</p>
                    <p className="text-sm text-navy-400">Data customer tampil di samping percakapan.</p>
                  </div>
                </div>
              )}
            </section>

            {/* Panel customer: kolom ke-3 di layar lebar, laci di layar kecil */}
            {chatId && (
              <aside
                className={cn(
                  "min-h-0 overflow-y-auto border-l border-navy-100 bg-navy-50/40",
                  customerOpen ? "absolute inset-y-0 right-0 z-20 w-full max-w-sm shadow-2xl xl:static xl:max-w-none xl:shadow-none" : "hidden xl:block",
                )}
              >
                {customerOpen && (
                  <button className="btn-icon absolute right-2 top-2 z-10 xl:hidden" onClick={() => setCustomerOpen(false)} aria-label="Tutup data customer">
                    <X className="h-4 w-4" />
                  </button>
                )}
                {chats?.find((c) => c.id === chatId)?.isGroup ? (
                  <div className="p-5 text-sm text-navy-500">
                    <p className="mb-1 flex items-center gap-2 font-bold text-navy-800">
                      <Users className="h-4 w-4 text-sky-600" /> Grup WhatsApp
                    </p>
                    Data customer hanya untuk chat pribadi. Di grup, nama & nomor pengirim tampil di atas setiap pesan. Auto-balas AI tidak membalas di grup.
                  </div>
                ) : (
                  <CustomerPanel key={chatId} chatId={chatId} />
                )}
              </aside>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmAi}
        onClose={() => setConfirmAi(false)}
        title="Aktifkan auto-balas AI?"
        tone="primary"
        confirmText="Ya, aktifkan"
        message={
          <span className="block space-y-2 text-left">
            <span className="block">
              Chat masuk yang baru akan dijawab otomatis oleh AI (otak yang sama dengan chatbot situs: basis pengetahuan + data kelas dari sistem). Setiap
              balasan diberi keterangan bahwa pesan dijawab otomatis oleh AI.
            </span>
            <span className="block">
              Bila AI tidak tahu jawabannya atau customer terlihat kesal, AI membalas &ldquo;admin akan menjawab sebentar lagi&rdquo; lalu{" "}
              <b>berhenti di chat itu</b> — tandanya label <b>Admin</b> di daftar chat. Saat Anda membalas sendiri, AI juga berhenti di chat tersebut.
            </span>
          </span>
        }
        action={() => setAutoReply(true)}
      />
      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title="Putuskan WhatsApp?"
        message="Nomor ini akan dilepas dari perangkat tertaut. Riwayat chat di panel tetap tersimpan, dan Anda bisa menautkan lagi kapan saja."
        confirmText="Ya, putuskan"
        action={disconnect}
      />
    </div>
  );
}
