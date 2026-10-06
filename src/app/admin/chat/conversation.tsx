"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Check, CheckCheck, Clock, Eye, Hand, LoaderCircle, Play, SendHorizonal, TriangleAlert, UserSearch } from "lucide-react";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { WA_AI_FOOTER, WA_MAX_TEXT, formatWaPhone, waPreview } from "@/lib/wa-shared";
import { EmojiPicker } from "@/components/emoji-picker";
import { getJson, postJson, usePoll } from "./use-poll";

type Msg = {
  id: number;
  fromMe: boolean;
  type: string;
  body: string | null;
  status: string;
  error: string | null;
  timestamp: string;
  byAi: boolean;
  hasMedia: boolean;
  sentBy: { name: string } | null;
};
type ChatInfo = {
  id: number;
  name: string | null;
  phone: string | null;
  hasIncoming: boolean;
  unread: number;
  aiPaused: boolean;
  aiNote: string | null;
  autoReply: boolean;
};
type Resp = { chat: ChatInfo; messages: Msg[]; statuses: { id: number; status: string; error: string | null }[]; hasMore: boolean };

const time = (d: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(d));
const dayKey = (d: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(d));
function dayLabel(d: string) {
  const k = dayKey(d);
  const today = dayKey(new Date().toISOString());
  const yest = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (k === today) return "Hari ini";
  if (k === yest) return "Kemarin";
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(d));
}

/** Gambar pesan (privat, lewat route berizin); bila tidak tersedia → label "Foto" */
function ChatImage({ id, fromMe }: { id: number; fromMe: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = `/api/admin/wa/media?id=${id}`;
  if (failed) return <p className={cn("mb-0.5 text-xs font-semibold", fromMe ? "text-white/80" : "text-navy-400")}>📷 Foto (gambar tidak tersedia)</p>;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="-mx-1 -mt-0.5 mb-1 block" title="Buka gambar">
      {/* eslint-disable-next-line @next/next/no-img-element -- gambar privat lewat route berizin */}
      <img
        src={src}
        alt="Gambar dari chat"
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-72 w-full max-w-xs rounded-xl bg-navy-100 object-cover"
      />
    </a>
  );
}

function Ticks({ m }: { m: Msg }) {
  if (m.status === "PENDING") return <Clock className="h-3.5 w-3.5" aria-label="Antre" />;
  if (m.status === "FAILED") return <TriangleAlert className="h-3.5 w-3.5 text-rose-300" aria-label="Gagal" />;
  if (m.status === "SENT") return <Check className="h-3.5 w-3.5" aria-label="Terkirim" />;
  if (m.status === "DELIVERED") return <CheckCheck className="h-3.5 w-3.5" aria-label="Diterima" />;
  if (m.status === "READ") return <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label="Dibaca" />;
  return null;
}

export function Conversation({
  chatId,
  readOnly,
  connected,
  onBack,
  onShowCustomer,
  onActivity,
}: {
  chatId: number;
  readOnly: boolean;
  connected: boolean;
  onBack: () => void;
  onShowCustomer: () => void;
  onActivity: () => void;
}) {
  const toast = useToast();
  const [chat, setChat] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const stick = useRef(true); // tetap di bawah bila pengguna sedang di bawah
  const lastId = messages.length ? messages[messages.length - 1].id : 0;

  const merge = useCallback((incoming: Msg[], statuses: Resp["statuses"]) => {
    setMessages((cur) => {
      const byId = new Map(cur.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      for (const s of statuses) {
        const m = byId.get(s.id);
        if (m && (m.status !== s.status || m.error !== s.error)) byId.set(s.id, { ...m, status: s.status, error: s.error });
      }
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
  }, []);

  // muat awal + tandai dibaca (hanya pemilik nomor). Komponen di-key per chat, jadi state selalu mulai kosong.
  useEffect(() => {
    let alive = true;
    stick.current = true;
    void getJson<Resp>(`/api/admin/wa/messages?chat=${chatId}`)
      .then((r) => {
        if (!alive) return;
        setChat(r.chat);
        setMessages(r.messages);
        setHasMore(r.hasMore);
        if (!readOnly && r.chat.unread > 0) void postJson("/api/admin/wa/read", { chatId }).then(onActivity);
      })
      .catch((e) => toast.error((e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, readOnly]);

  // pesan baru & perubahan status centang
  usePoll(
    async () => {
      if (!chat) return;
      const r = await getJson<Resp>(`/api/admin/wa/messages?chat=${chatId}&after=${lastId}`);
      if (r.messages.length || r.statuses.length) merge(r.messages, r.statuses);
      if (!readOnly && r.chat.unread > 0 && r.messages.some((m) => !m.fromMe)) void postJson("/api/admin/wa/read", { chatId }).then(onActivity);
      setChat(r.chat);
    },
    3000,
    [chatId, lastId, !!chat],
  );

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const loadOlder = async () => {
    if (!messages.length) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const r = await getJson<Resp>(`/api/admin/wa/messages?chat=${chatId}&before=${messages[0].id}`);
      stick.current = false;
      setMessages((cur) => [...r.messages, ...cur]);
      setHasMore(r.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const r = await postJson<{ messageId?: number }>("/api/admin/wa/send", { chatId, text: body });
    setSending(false);
    if (r.error && !r.messageId) {
      toast.error(r.error);
      return;
    }
    if (r.error) toast.error(r.error);
    else setText("");
    stick.current = true;
    const fresh = await getJson<Resp>(`/api/admin/wa/messages?chat=${chatId}&after=${lastId}`).catch(() => null);
    if (fresh) merge(fresh.messages, fresh.statuses);
    onActivity();
  };

  /** sisipkan emoji di posisi kursor */
  const insertEmoji = (e: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + e + text.slice(end)).slice(0, WA_MAX_TEXT);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + e.length, start + e.length);
    });
  };

  /** jeda / lanjutkan AI di chat ini */
  const setAiPaused = async (paused: boolean) => {
    setAiBusy(true);
    const r = await postJson<{ aiPaused?: boolean }>("/api/admin/wa/ai", { chatId, paused });
    setAiBusy(false);
    if (r.error) return toast.error(r.error);
    setChat((c) => (c ? { ...c, aiPaused: paused, aiNote: paused ? "Dijeda oleh Anda" : null } : c));
    toast.success(paused ? "AI dijeda di chat ini — Anda yang membalas." : "AI kembali membalas chat ini otomatis.");
  };

  const title = chat?.name || formatWaPhone(chat?.phone) || "Chat";
  const canReply = !readOnly && connected && !!chat?.hasIncoming;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-navy-100 bg-white px-3 py-2.5">
        <button className="btn-icon lg:hidden" onClick={onBack} aria-label="Kembali ke daftar chat">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-emerald-400 to-teal-600 text-sm font-bold text-white">
          {(chat?.name || "?").trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-navy-900">{title}</p>
          {chat?.phone && chat.name && <p className="truncate text-xs text-navy-400">{formatWaPhone(chat.phone)}</p>}
        </div>
        <button className="btn-secondary btn-sm xl:hidden" onClick={onShowCustomer}>
          <UserSearch className="h-3.5 w-3.5" /> Data customer
        </button>
      </div>

      {chat?.autoReply && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs font-semibold",
            chat.aiPaused ? "border-amber-100 bg-amber-50 text-amber-800" : "border-brand-100 bg-brand-50 text-brand-800",
          )}
        >
          {chat.aiPaused ? <Hand className="h-4 w-4 shrink-0" /> : <Bot className="h-4 w-4 shrink-0" />}
          <span className="min-w-0 flex-1">
            {chat.aiPaused ? (
              <>AI dijeda di chat ini{chat.aiNote ? ` · ${chat.aiNote}` : ""} — admin yang membalas.</>
            ) : (
              "AI membalas chat ini otomatis dari basis pengetahuan."
            )}
          </span>
          {!readOnly && (
            <button
              type="button"
              className={chat.aiPaused ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
              disabled={aiBusy}
              onClick={() => setAiPaused(!chat.aiPaused)}
            >
              {aiBusy ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : chat.aiPaused ? (
                <Play className="h-3.5 w-3.5" />
              ) : (
                <Hand className="h-3.5 w-3.5" />
              )}
              {chat.aiPaused ? "Aktifkan AI lagi" : "Ambil alih"}
            </button>
          )}
        </div>
      )}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-[#efeae2] bg-dots px-3 py-4 sm:px-6"
      >
        {hasMore && (
          <div className="mb-2 text-center">
            <button className="btn-secondary btn-sm" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />} Muat pesan sebelumnya
            </button>
          </div>
        )}
        {!chat && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-navy-400">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Memuat percakapan…
          </p>
        )}
        {messages.map((m, i) => {
          const newDay = i === 0 || dayKey(messages[i - 1].timestamp) !== dayKey(m.timestamp);
          return (
            <div key={m.id}>
              {newDay && (
                <p className="my-3 text-center">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-navy-500 shadow-sm">{dayLabel(m.timestamp)}</span>
                </p>
              )}
              <div className={cn("flex", m.fromMe ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[70%]",
                    m.fromMe ? "rounded-tr-sm bg-linear-to-br from-brand-600 to-navy-700 text-white" : "rounded-tl-sm bg-white text-navy-800",
                    m.status === "FAILED" && "from-rose-500 to-rose-700",
                  )}
                >
                  {m.type === "image" && m.hasMedia ? (
                    <ChatImage id={m.id} fromMe={m.fromMe} />
                  ) : (
                    m.type !== "text" && (
                      <p className={cn("mb-0.5 text-xs font-semibold", m.fromMe ? "text-white/80" : "text-navy-400")}>{waPreview(m.type, null)}</p>
                    )
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.byAi ? m.body.replace(WA_AI_FOOTER, "").trim() : m.body}</p>}
                  <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", m.fromMe ? "text-white/70" : "text-navy-400")}>
                    {m.fromMe &&
                      (m.byAi ? (
                        <span
                          className="mr-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5 font-bold"
                          title="Dijawab otomatis oleh AI (customer melihat keterangan ini)"
                        >
                          <Bot className="h-3 w-3" /> AI
                        </span>
                      ) : (
                        <span className="mr-1 truncate">{m.sentBy ? `via panel · ${m.sentBy.name}` : "dari HP"}</span>
                      ))}
                    {time(m.timestamp)} {m.fromMe && <Ticks m={m} />}
                  </p>
                  {m.status === "FAILED" && m.error && <p className="mt-1 text-[11px] text-white/90">⚠ {m.error}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {readOnly ? (
        <p className="flex items-center justify-center gap-2 border-t border-navy-100 bg-navy-50 px-4 py-3 text-xs font-semibold text-navy-500">
          <Eye className="h-4 w-4" /> Mode pantau superadmin: hanya membaca, tidak mengirim & tidak menandai dibaca.
        </p>
      ) : (
        <div className="border-t border-navy-100 bg-white p-3">
          {!connected && <p className="mb-2 text-xs font-semibold text-amber-700">WhatsApp belum tersambung — pesan tidak bisa dikirim.</p>}
          {connected && chat && !chat.hasIncoming && (
            <p className="mb-2 text-xs font-semibold text-amber-700">Demi keamanan nomor, balasan hanya untuk chat yang sudah pernah menghubungi Anda.</p>
          )}
          <div className="flex items-end gap-2">
            <EmojiPicker onPick={insertEmoji} disabled={!canReply || sending} />
            <textarea
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, WA_MAX_TEXT))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={Math.min(5, Math.max(1, text.split("\n").length))}
              placeholder={canReply ? "Tulis balasan… (Enter kirim, Shift+Enter baris baru)" : "Tidak bisa membalas chat ini"}
              disabled={!canReply || sending}
              className="input max-h-40 min-h-11 resize-none"
              aria-label="Tulis balasan"
            />
            <button className="btn-primary h-11 w-11 shrink-0 px-0!" onClick={send} disabled={!canReply || sending || !text.trim()} aria-label="Kirim">
              {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
